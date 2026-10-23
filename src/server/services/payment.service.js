import { randomUUID } from "crypto";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import Invoice from "@/models/Invoice";
import sseManager from "@/lib/sse";
import { notifyOrderConfirmed } from "@/lib/whatsapp";

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
 * @param {{ method: "CASH"|"QRIS", cashReceived?: number, changeAmount?: number, itemDiscounts?: Array<{productId: string, discountPercent: number}> }} paymentData
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

  const now = new Date();

  // ── Hitung diskon per item ───────────────────────────────────────────────────
  // itemDiscounts: [{ productId: string, discountPercent: 0–100 }]
  // Jika tidak ada → semua discountPercent = 0 (harga normal)
  const discountMap = {};
  if (Array.isArray(paymentData.itemDiscounts)) {
    for (const d of paymentData.itemDiscounts) {
      if (d.productId && typeof d.discountPercent === "number") {
        discountMap[d.productId.toString()] = Math.min(100, Math.max(0, d.discountPercent));
      }
    }
  }

  let discountTotal = 0;
  const itemsWithDiscount = order.items.map((item) => {
    const pid = item.productId.toString();
    const pct = discountMap[pid] ?? 0;
    const originalSubtotal = item.unitPrice * item.quantity;
    const discountAmount = pct > 0 ? Math.round(originalSubtotal * pct / 100) : 0;
    const finalPrice = originalSubtotal - discountAmount;
    discountTotal += discountAmount;
    return { ...item, discountPercent: pct, discountAmount, finalPrice };
  });

  const finalTotalAmount = order.totalAmount - discountTotal;

  const isDigitalOnlinePayment =
    order.orderType === "ONLINE" &&
    order.paymentMethod !== "CASH" &&
    order.paymentMethod !== "BANK_TRANSFER";

  const newOrderStatus =
    isDigitalOnlinePayment && order.orderStatus !== "ready"
      ? "preparing"
      : "completed";

  // ── Step 1: Update Order status + diskon ────────────────────────────────────
  try {
    await Order.updateOne(
      { _id: orderId },
      {
        $set: {
          paymentStatus: "paid",
          orderStatus: newOrderStatus,
          paymentMethod: paymentData.method,
          cashReceived: paymentData.cashReceived ?? null,
          changeAmount: paymentData.changeAmount ?? null,
          totalAmount: finalTotalAmount,
          discountTotal,
          items: itemsWithDiscount,
          completedAt: newOrderStatus === "completed" ? now : null,
          updatedAt: now,
        },
      }
    );
  } catch (err) {
    console.error("completePayment: step 1 (order update) failed", err);
    throw new PaymentError(PaymentErrorCode.TRANSACTION_FAILED, "Gagal memperbarui status pesanan");
  }

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
          orderStatus: order.orderStatus,
          paymentMethod: order.paymentMethod ?? null,
          cashReceived: null,
          changeAmount: null,
          totalAmount: order.totalAmount,
          discountTotal: order.discountTotal ?? 0,
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
      discountPercent: discountMap[item.productId.toString()] ?? 0,
      discountAmount: itemsWithDiscount.find(
        (i) => i.productId.toString() === item.productId.toString()
      )?.discountAmount ?? 0,
      subtotal: itemsWithDiscount.find(
        (i) => i.productId.toString() === item.productId.toString()
      )?.finalPrice ?? item.unitPrice * item.quantity,
    }));

    const created = await Invoice.create({
      orderId: order._id,
      invoiceNumber: order.invoiceNumber,
      cashierName,
      customerName: order.customerName ?? null,
      items: invoiceItems,
      totalAmount: finalTotalAmount,
      discountTotal,
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
          orderStatus: order.orderStatus,
          paymentMethod: order.paymentMethod ?? null,
          cashReceived: null,
          changeAmount: null,
          totalAmount: order.totalAmount,
          discountTotal: order.discountTotal ?? 0,
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
    const eventType = newOrderStatus === "completed" ? "order_completed" : "order_status_updated";
    sseManager.broadcastToRole(
      { type: eventType, data: { orderId: orderId.toString(), orderStatus: newOrderStatus } },
      ["CASHIER", "WAREHOUSE"]
    );
  } catch (err) {
    console.error("SSE broadcast error (order_completed):", err);
  }

  // ── Notifikasi WhatsApp ke pelanggan ─────────────────────────────────────────
  if (order.orderType === "ONLINE" && order.customerWhatsapp) {
    try {
      await notifyOrderConfirmed({
        customerName: order.customerName,
        customerWhatsapp: order.customerWhatsapp,
        invoiceNumber: order.invoiceNumber,
        totalAmount: order.totalAmount,
        paymentMethod: paymentData.method,
      });
    } catch (err) {
      // WA failure must not break the payment flow
      console.error("WhatsApp notification error (order confirmed):", err);
    }
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

/**
 * Complete an order with DEBT payment method (utang).
 *
 * @param {string} orderId
 * @param {{ dueDate?: string, note?: string, itemDiscounts?: Array<{productId: string, discountPercent: number}> }} debtData
 * @returns {Promise<Object>} Created invoice document (plain object)
 * @throws {PaymentError}
 */
export async function completeDebtOrder(orderId, debtData = {}) {
  await connectDB();

  // ── Step 0: Fetch and validate ───────────────────────────────────────────────
  const order = await Order.findById(orderId).lean();

  if (!order) {
    throw new PaymentError(PaymentErrorCode.ORDER_NOT_FOUND, "Pesanan tidak ditemukan");
  }

  if (order.paymentStatus === "paid") {
    throw new PaymentError(PaymentErrorCode.ALREADY_PAID, "Pesanan sudah dibayar");
  }

  if (order.paymentMethod === "DEBT" && order.orderStatus === "completed") {
    throw new PaymentError(PaymentErrorCode.ALREADY_PAID, "Pesanan sudah dicatat sebagai utang");
  }

  if (!order.customerName?.trim()) {
    throw new PaymentError(
      "CUSTOMER_NAME_REQUIRED",
      "Nama pelanggan wajib diisi untuk transaksi utang"
    );
  }

  const now = new Date();
  const dueDate = debtData.dueDate ? new Date(debtData.dueDate) : null;

  // ── Hitung diskon per item ───────────────────────────────────────────────────
  const discountMap = {};
  if (Array.isArray(debtData.itemDiscounts)) {
    for (const d of debtData.itemDiscounts) {
      if (d.productId && typeof d.discountPercent === "number") {
        discountMap[d.productId.toString()] = Math.min(100, Math.max(0, d.discountPercent));
      }
    }
  }

  let discountTotal = 0;
  const itemsWithDiscount = order.items.map((item) => {
    const pid = item.productId.toString();
    const pct = discountMap[pid] ?? 0;
    const originalSubtotal = item.unitPrice * item.quantity;
    const discountAmount = pct > 0 ? Math.round(originalSubtotal * pct / 100) : 0;
    const finalPrice = originalSubtotal - discountAmount;
    discountTotal += discountAmount;
    return { ...item, discountPercent: pct, discountAmount, finalPrice };
  });

  const finalTotalAmount = order.totalAmount - discountTotal;

  // ── Step 1: Update Order ─────────────────────────────────────────────────────
  try {
    await Order.updateOne(
      { _id: orderId },
      {
        $set: {
          paymentMethod: "DEBT",
          paymentStatus: "pending",
          orderStatus: "completed",
          completedAt: now,
          debtDueDate: dueDate,
          debtNote: debtData.note?.trim() || null,
          totalAmount: finalTotalAmount,
          discountTotal,
          items: itemsWithDiscount,
          updatedAt: now,
        },
      }
    );
  } catch (err) {
    console.error("completeDebtOrder: step 1 (order update) failed", err);
    throw new PaymentError(PaymentErrorCode.TRANSACTION_FAILED, "Gagal memperbarui status pesanan");
  }

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
          paymentMethod: null,
          paymentStatus: "pending",
          orderStatus: order.orderStatus,
          completedAt: null,
          debtDueDate: null,
          debtNote: null,
          updatedAt: now,
        },
      }
    ).catch((e) => console.error("completeDebtOrder: rollback step 1 failed", e));

    if (err instanceof PaymentError) throw err;
    console.error("completeDebtOrder: step 2 (stock decrement) failed", err);
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
      discountPercent: discountMap[item.productId.toString()] ?? 0,
      discountAmount: itemsWithDiscount.find(
        (i) => i.productId.toString() === item.productId.toString()
      )?.discountAmount ?? 0,
      subtotal: itemsWithDiscount.find(
        (i) => i.productId.toString() === item.productId.toString()
      )?.finalPrice ?? item.unitPrice * item.quantity,
    }));

    const created = await Invoice.create({
      orderId: order._id,
      invoiceNumber: order.invoiceNumber,
      cashierName,
      customerName: order.customerName,
      items: invoiceItems,
      totalAmount: finalTotalAmount,
      discountTotal,
      paymentMethod: "DEBT",
      cashReceived: null,
      changeAmount: null,
      transactionAt: now,
    });

    invoice = created.toObject();
  } catch (err) {
    // Roll back step 1 dan step 2
    await Order.updateOne(
      { _id: orderId },
      {
        $set: {
          paymentMethod: null,
          paymentStatus: "pending",
          orderStatus: order.orderStatus,
          completedAt: null,
          debtDueDate: null,
          debtNote: null,
          updatedAt: now,
        },
      }
    ).catch((e) => console.error("completeDebtOrder: rollback step 1 failed", e));

    if (stockDecrementDone) {
      const restore = order.items.map((item) => ({
        updateOne: {
          filter: { _id: item.productId },
          update: { $inc: { stock: item.quantity }, $set: { updatedAt: now } },
        },
      }));
      await Product.bulkWrite(restore).catch((e) =>
        console.error("completeDebtOrder: rollback step 2 failed", e)
      );
    }

    console.error("completeDebtOrder: step 3 (invoice create) failed", err);
    throw new PaymentError(PaymentErrorCode.TRANSACTION_FAILED, "Gagal membuat invoice");
  }

  // ── Broadcast SSE ────────────────────────────────────────────────────────────
  try {
    sseManager.broadcastToRole(
      {
        type: "order_completed",
        data: {
          orderId: orderId.toString(),
          orderStatus: "completed",
          paymentMethod: "DEBT",
          customerName: order.customerName,
        },
      },
      ["CASHIER", "WAREHOUSE", "OWNER"]
    );
  } catch (err) {
    console.error("SSE broadcast error (order_completed debt):", err);
  }

  return invoice;
}

/**
 * Settle a debt order — mark as paid by the owner.
 *
 * Updates:
 *  - paymentStatus → "paid"
 *  - debtPaidAt → now
 *  - debtPaidBy → userId
 *
 * @param {string} orderId
 * @param {string} userId - Owner/kasir yang mengkonfirmasi pelunasan
 * @returns {Promise<Object>} Updated order (plain object)
 * @throws {PaymentError}
 */
export async function settleDebt(orderId, userId) {
  await connectDB();

  const order = await Order.findById(orderId).lean();

  if (!order) {
    throw new PaymentError(PaymentErrorCode.ORDER_NOT_FOUND, "Pesanan tidak ditemukan");
  }

  if (order.paymentMethod !== "DEBT") {
    throw new PaymentError("NOT_A_DEBT", "Pesanan ini bukan utang");
  }

  if (order.paymentStatus === "paid") {
    throw new PaymentError(PaymentErrorCode.ALREADY_PAID, "Utang sudah dilunasi");
  }

  const now = new Date();

  const updated = await Order.findByIdAndUpdate(
    orderId,
    {
      $set: {
        paymentStatus: "paid",
        debtPaidAt: now,
        debtPaidBy: userId,
        updatedAt: now,
      },
    },
    { new: true }
  ).lean();

  // Broadcast ke semua role
  try {
    sseManager.broadcastToRole(
      {
        type: "debt_settled",
        data: {
          orderId: orderId.toString(),
          invoiceNumber: order.invoiceNumber,
          customerName: order.customerName,
        },
      },
      ["CASHIER", "OWNER"]
    );
  } catch (err) {
    console.error("SSE broadcast error (debt_settled):", err);
  }

  return {
    ...updated,
    _id: updated._id.toString(),
    cashierId: updated.cashierId?.toString() ?? null,
    debtPaidBy: updated.debtPaidBy?.toString() ?? null,
    createdAt: updated.createdAt?.toISOString() ?? null,
    updatedAt: updated.updatedAt?.toISOString() ?? null,
    completedAt: updated.completedAt?.toISOString() ?? null,
    debtDueDate: updated.debtDueDate?.toISOString() ?? null,
    debtPaidAt: updated.debtPaidAt?.toISOString() ?? null,
  };
}

/**
 * Get all debt orders with optional filter.
 *
 * @param {{ status?: "unpaid"|"paid"|"all" }} options
 * @returns {Promise<Object[]>}
 */
export async function getDebtOrders({ status = "unpaid" } = {}) {
  await connectDB();

  const query = { paymentMethod: "DEBT" };

  if (status === "unpaid") {
    query.paymentStatus = "pending";
  } else if (status === "paid") {
    query.paymentStatus = "paid";
  }
  // "all" = tidak filter paymentStatus

  const orders = await Order.find(query)
    .populate("cashierId", "name")
    .populate("debtPaidBy", "name")
    .sort({ createdAt: -1 })
    .lean();

  return orders.map((o) => ({
    ...o,
    _id: o._id.toString(),
    cashierName: o.cashierId?.name ?? "Kasir",
    cashierId: o.cashierId?._id?.toString() ?? o.cashierId?.toString() ?? null,
    debtPaidByName: o.debtPaidBy?.name ?? null,
    debtPaidBy: o.debtPaidBy?._id?.toString() ?? o.debtPaidBy?.toString() ?? null,
    createdAt: o.createdAt?.toISOString() ?? null,
    updatedAt: o.updatedAt?.toISOString() ?? null,
    completedAt: o.completedAt?.toISOString() ?? null,
    debtDueDate: o.debtDueDate?.toISOString() ?? null,
    debtPaidAt: o.debtPaidAt?.toISOString() ?? null,
    items: (o.items || []).map((item) => ({
      ...item,
      _id: item._id?.toString(),
      productId: item.productId?.toString(),
    })),
  }));
}
