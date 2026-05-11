import { randomUUID } from "crypto";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import Invoice from "@/models/Invoice";
import sseManager from "@/lib/sse";

/**
 * Custom error class for payment operations.
 */
export class PaymentError extends Error {
  /**
   * @param {string} code - Error code
   * @param {string} [message] - Optional override message
   */
  constructor(code, message) {
    super(message || code);
    this.name = "PaymentError";
    this.code = code;
  }
}

export const PaymentErrorCode = {
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  ALREADY_PAID: "ALREADY_PAID",
  INSUFFICIENT_CASH: "INSUFFICIENT_CASH",
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  TRANSACTION_FAILED: "TRANSACTION_FAILED",
  QRIS_EXPIRED: "QRIS_EXPIRED",
  ORDER_NOT_READY: "ORDER_NOT_READY",
};

/**
 * Complete a payment for an order atomically.
 *
 * Performs three operations inside a single MongoDB transaction:
 *  1. Update Order: paymentStatus → "paid", orderStatus → "completed", completedAt, paymentMethod, cashReceived, changeAmount
 *  2. Product.bulkWrite() — decrement stock with filter stock: { $gte: quantity }
 *  3. Invoice.create() — full snapshot including cashierName from User lookup
 *
 * After commit: broadcasts SSE "order_completed" event.
 *
 * @param {string} orderId - Order ObjectId string
 * @param {{ method: "CASH"|"QRIS", cashReceived?: number, changeAmount?: number }} paymentData
 * @param {import("mongoose").ClientSession} [existingSession] - Optional existing session
 * @returns {Promise<Object>} Created invoice document
 * @throws {PaymentError}
 */
/**
 * Complete a payment for an order.
 *
 * Performs three sequential operations (no MongoDB transaction required —
 * compatible with standalone MongoDB instances used in local development):
 *  1. Update Order: paymentStatus → "paid", orderStatus → "completed"
 *  2. Product.bulkWrite() — decrement stock
 *  3. Invoice.create() — full snapshot
 *
 * If step 2 or 3 fails, attempts to roll back step 1 manually.
 * After success: broadcasts SSE "order_completed" event.
 *
 * @param {string} orderId - Order ObjectId string
 * @param {{ method: "CASH"|"QRIS", cashReceived?: number, changeAmount?: number }} paymentData
 * @returns {Promise<Object>} Created invoice document (plain object)
 * @throws {PaymentError}
 */
export async function completePayment(orderId, paymentData) {
  await connectDB();

  // ── Step 0: Fetch and validate order ────────────────────────────────────────
  const order = await Order.findById(orderId).lean();

  if (!order) {
    throw new PaymentError(PaymentErrorCode.ORDER_NOT_FOUND, "Pesanan tidak ditemukan");
  }

  if (order.paymentStatus === "paid") {
    throw new PaymentError(PaymentErrorCode.ALREADY_PAID, "Pesanan sudah dibayar");
  }

  if (order.paymentStatus === "expired") {
    throw new PaymentError(PaymentErrorCode.QRIS_EXPIRED, "Kode QRIS sudah kedaluwarsa");
  }

  if (order.orderStatus !== "ready") {
    throw new PaymentError(
      PaymentErrorCode.ORDER_NOT_READY,
      "Pesanan belum siap. Tunggu konfirmasi dari staf gudang."
    );
  }

  const now = new Date();

  // ── Step 1: Update Order status ──────────────────────────────────────────────
  await Order.updateOne(
    { _id: orderId },
    {
      $set: {
        paymentStatus: "paid",
        orderStatus: "completed",
        paymentMethod: paymentData.method,
        cashReceived: paymentData.cashReceived ?? null,
        changeAmount: paymentData.changeAmount ?? null,
        completedAt: now,
        updatedAt: now,
      },
    }
  );

  // ── Step 2: Decrement stock ──────────────────────────────────────────────────
  let stockDecrementDone = false;
  try {
    const stockUpdates = order.items.map((item) => ({
      updateOne: {
        filter: { _id: item.productId, stock: { $gte: item.quantity } },
        update: { $inc: { stock: -item.quantity }, $set: { updatedAt: now } },
      },
    }));

    const bulkResult = await Product.bulkWrite(stockUpdates);

    if (bulkResult.modifiedCount !== order.items.length) {
      throw new PaymentError(
        PaymentErrorCode.INSUFFICIENT_STOCK,
        "Stok tidak mencukupi untuk satu atau lebih produk"
      );
    }

    stockDecrementDone = true;
  } catch (err) {
    // Roll back step 1
    await Order.updateOne(
      { _id: orderId },
      {
        $set: {
          paymentStatus: "pending",
          orderStatus: "ready",
          paymentMethod: null,
          cashReceived: null,
          changeAmount: null,
          completedAt: null,
          updatedAt: now,
        },
      }
    ).catch((rollbackErr) =>
      console.error("completePayment: rollback step 1 failed", rollbackErr)
    );

    if (err instanceof PaymentError) throw err;
    console.error("completePayment: step 2 (stock decrement) failed", err);
    throw new PaymentError(PaymentErrorCode.TRANSACTION_FAILED, "Gagal mengurangi stok");
  }

  // ── Step 3: Create Invoice ───────────────────────────────────────────────────
  let invoice;
  try {
    const cashier = await User.findById(order.cashierId).select("name").lean();
    const cashierName = cashier?.name ?? "Kasir";

    const invoiceItems = order.items.map((item) => ({
      productName: item.productName,
      sku: item.sku,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.unitPrice * item.quantity,
    }));

    const created = await Invoice.create({
      orderId: order._id,
      invoiceNumber: order.invoiceNumber,
      cashierName,
      items: invoiceItems,
      totalAmount: order.totalAmount,
      paymentMethod: paymentData.method,
      cashReceived: paymentData.cashReceived ?? null,
      changeAmount: paymentData.changeAmount ?? null,
      transactionAt: now,
    });

    invoice = created.toObject();
  } catch (err) {
    // Roll back step 1 and step 2
    await Order.updateOne(
      { _id: orderId },
      {
        $set: {
          paymentStatus: "pending",
          orderStatus: "ready",
          paymentMethod: null,
          cashReceived: null,
          changeAmount: null,
          completedAt: null,
          updatedAt: now,
        },
      }
    ).catch((e) => console.error("completePayment: rollback step 1 failed", e));

    if (stockDecrementDone) {
      const stockRestore = order.items.map((item) => ({
        updateOne: {
          filter: { _id: item.productId },
          update: { $inc: { stock: item.quantity }, $set: { updatedAt: now } },
        },
      }));
      await Product.bulkWrite(stockRestore).catch((e) =>
        console.error("completePayment: rollback step 2 failed", e)
      );
    }

    console.error("completePayment: step 3 (invoice create) failed", err);
    throw new PaymentError(PaymentErrorCode.TRANSACTION_FAILED, "Gagal membuat invoice");
  }

  // ── Broadcast SSE ────────────────────────────────────────────────────────────
  try {
    sseManager.broadcastToRole(
      { type: "order_completed", data: { orderId: orderId.toString() } },
      ["CASHIER", "WAREHOUSE"]
    );
  } catch (err) {
    console.error("SSE broadcast error (order_completed):", err);
  }

  return invoice;
}

/**
 * Generate a mock QRIS code for an order.
 * In production, this would call Midtrans/Xendit API.
 *
 * @param {string} orderId - Order ObjectId string
 * @returns {Promise<{ qrisCode: string, qrisExpiresAt: Date }>}
 * @throws {PaymentError}
 */
export async function generateQRIS(orderId) {
  await connectDB();

  const order = await Order.findById(orderId).lean();

  if (!order) {
    throw new PaymentError(
      PaymentErrorCode.ORDER_NOT_FOUND,
      "Pesanan tidak ditemukan"
    );
  }

  if (order.paymentStatus === "paid") {
    throw new PaymentError(
      PaymentErrorCode.ALREADY_PAID,
      "Pesanan sudah dibayar"
    );
  }

  // Generate unique QRIS code (UUID as mock payment gateway response)
  const qrisCode = randomUUID();
  const qrisExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // now + 5 minutes

  await Order.updateOne(
    { _id: orderId },
    {
      $set: {
        qrisCode,
        qrisExpiresAt,
        paymentMethod: "QRIS",
        updatedAt: new Date(),
      },
    }
  );

  return { qrisCode, qrisExpiresAt };
}

/**
 * Expire QRIS orders that have passed their expiry time.
 * Intended to be called by a cron job.
 *
 * @returns {Promise<number>} Number of orders expired
 */
export async function expireQRISOrders() {
  await connectDB();

  const result = await Order.updateMany(
    {
      paymentStatus: "pending",
      qrisExpiresAt: { $lt: new Date() },
      qrisCode: { $ne: null },
    },
    {
      $set: {
        paymentStatus: "expired",
        qrisCode: null,
        updatedAt: new Date(),
      },
    }
  );

  return result.modifiedCount;
}
