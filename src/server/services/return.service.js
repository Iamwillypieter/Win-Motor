import connectDB from "@/lib/db";
import mongoose from "mongoose";
import Return from "@/models/Return";
import Product from "@/models/Product";
import Order from "@/models/Order";
import StockMovement from "@/models/StockMovement";
import User from "@/models/User";
import { formatDatePart } from "@/lib/invoice";

/**
 * Custom error class for return operations.
 */
export class ReturnError extends Error {
  /**
   * @param {string} code - ReturnErrorCode value
   * @param {string} [message] - Optional override message
   */
  constructor(code, message) {
    super(message || code);
    this.name = "ReturnError";
    this.code = code;
  }
}

export const ReturnErrorCode = {
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  EMPTY_ITEMS: "EMPTY_ITEMS",
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  ORDER_NOT_PAID: "ORDER_NOT_PAID",
  QUANTITY_EXCEEDS_ORIGINAL: "QUANTITY_EXCEEDS_ORIGINAL",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};

/**
 * Generate a unique return number in the format RET-YYYYMMDD-NNNN.
 * Counter resets daily.
 * @returns {Promise<string>}
 */
async function generateReturnNumber() {
  const now = new Date();
  const datePart = formatDatePart(now);
  const prefix = `RET-${datePart}-`;

  const lastReturn = await Return.findOne(
    { returnNumber: { $regex: `^${prefix}` } },
    { returnNumber: 1 },
    { sort: { returnNumber: -1 } }
  ).lean();

  let counter = 1;
  if (lastReturn?.returnNumber) {
    const parts = lastReturn.returnNumber.split("-");
    const lastCounter = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastCounter)) {
      counter = lastCounter + 1;
    }
  }

  return `${prefix}${String(counter).padStart(4, "0")}`;
}

/**
 * Lookup a product by SKU for the return form.
 * Strategi lookup berlapis sama dengan POS:
 * 1. Exact uppercase SKU
 * 2. Regex case-insensitive
 * 3. Alias lookup
 *
 * @param {string} sku - SKU atau barcode yang di-scan
 * @returns {Promise<Object>} Product document (lean) with serialized _id
 * @throws {ReturnError} PRODUCT_NOT_FOUND jika produk tidak ditemukan
 */
export async function lookupProductBySku(sku) {
  await connectDB();

  const rawSku = sku.trim();
  const normalizedSku = rawSku.toUpperCase();
  const escaped = rawSku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const product = await Product.findOne({
    $or: [
      { sku: normalizedSku },
      { sku: new RegExp(`^${escaped}$`, "i") },
      { aliases: { $elemMatch: { $regex: `^${escaped}$`, $options: "i" } } },
    ],
  }).lean();

  if (!product) {
    throw new ReturnError(
      ReturnErrorCode.PRODUCT_NOT_FOUND,
      `Produk dengan SKU "${sku}" tidak ditemukan`
    );
  }

  return {
    ...product,
    _id: product._id.toString(),
    createdBy: product.createdBy?.toString() ?? null,
  };
}

/**
 * Create a return transaction.
 * Atomically increments stock for each returned item and records StockMovement entries.
 *
 * @param {Object} params
 * @param {string} params.cashierId - User ObjectId string
 * @param {Array<{ productId: string, quantity: number, reason?: string }>} params.items
 * @param {string} params.refundMethod - "CASH" | "CREDIT" | "EXCHANGE"
 * @param {string|null} [params.orderId] - Referensi order asli (opsional)
 * @param {string|null} [params.note] - Catatan umum (opsional)
 * @returns {Promise<Object>} Created return document (lean) with serialized IDs
 * @throws {ReturnError}
 */
export async function createReturn({ cashierId, items, refundMethod, orderId = null, note = null }) {
  await connectDB();

  if (!items || items.length === 0) {
    throw new ReturnError(ReturnErrorCode.EMPTY_ITEMS, "Daftar item retur tidak boleh kosong");
  }

  const now = new Date();

  // ── Ambil data kasir ─────────────────────────────────────────────────────────
  const cashier = await User.findById(cashierId).select("name").lean();
  const cashierName = cashier?.name ?? "Kasir";

  // ── Validasi referensi order (opsional) ─────────────────────────────────────
  let linkedOrder = null;
  if (orderId) {
    linkedOrder = await Order.findById(orderId).select("paymentStatus invoiceNumber items").lean();
    if (!linkedOrder) {
      throw new ReturnError(ReturnErrorCode.ORDER_NOT_FOUND, "Pesanan referensi tidak ditemukan");
    }
    if (linkedOrder.paymentStatus !== "paid") {
      throw new ReturnError(
        ReturnErrorCode.ORDER_NOT_PAID,
        "Retur hanya bisa dilakukan untuk pesanan yang sudah dibayar"
      );
    }
  }

  // ── Validasi dan snapshot setiap item ────────────────────────────────────────
  const returnItems = [];
  let totalAmount = 0;

  for (const item of items) {
    const product = await Product.findById(item.productId).lean();
    if (!product) {
      throw new ReturnError(
        ReturnErrorCode.PRODUCT_NOT_FOUND,
        `Produk dengan ID "${item.productId}" tidak ditemukan`
      );
    }

    // Jika ada referensi order, validasi jumlah retur tidak melebihi jumlah beli
    if (linkedOrder) {
      const originalItem = linkedOrder.items.find(
        (oi) => oi.productId.toString() === item.productId
      );
      if (originalItem && item.quantity > originalItem.quantity) {
        throw new ReturnError(
          ReturnErrorCode.QUANTITY_EXCEEDS_ORIGINAL,
          `Jumlah retur untuk "${product.name}" (${item.quantity}) melebihi jumlah pembelian (${originalItem.quantity})`
        );
      }
    }

    const subtotal = product.price * item.quantity;
    totalAmount += subtotal;

    returnItems.push({
      productId: product._id,
      productName: product.name,
      sku: product.sku,
      unitPrice: product.price,
      quantity: item.quantity,
      subtotal,
      reason: item.reason?.trim() || null,
    });
  }

  // ── Generate nomor retur ──────────────────────────────────────────────────────
  const returnNumber = await generateReturnNumber();

  // ── Buat dokumen Return ───────────────────────────────────────────────────────
  const returnDoc = await Return.create({
    returnNumber,
    orderId: orderId ? new mongoose.Types.ObjectId(orderId) : null,
    invoiceNumber: linkedOrder?.invoiceNumber ?? null,
    cashierId: new mongoose.Types.ObjectId(cashierId),
    cashierName,
    items: returnItems,
    totalAmount,
    refundMethod,
    note: note?.trim() || null,
    createdAt: now,
    updatedAt: now,
  });

  // ── Increment stok (non-blocking per item, tapi log setiap error) ────────────
  const stockRestoreUpdates = returnItems.map((item) => ({
    updateOne: {
      filter: { _id: item.productId },
      update: {
        $inc: { stock: item.quantity },
        $set: { updatedAt: now },
      },
    },
  }));

  try {
    await Product.bulkWrite(stockRestoreUpdates);
  } catch (err) {
    // Log error kritis tapi jangan rollback Return yang sudah dibuat —
    // kasir bisa koreksi stok manual. Ini lebih baik dari membiarkan retur
    // tanpa catatan apapun.
    console.error("createReturn: CRITICAL — stock restore bulkWrite failed", err);
  }

  // ── Catat StockMovement "in" untuk setiap item retur ─────────────────────────
  // Non-blocking: gagal tidak batalkan return
  Promise.all(
    returnItems.map(async (item) => {
      try {
        const freshProduct = await Product.findById(item.productId)
          .select("stock")
          .lean();
        const newStock = freshProduct?.stock ?? null;
        const previousStock = newStock !== null ? newStock - item.quantity : null;

        await StockMovement.create({
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          type: "in",
          quantity: item.quantity,
          previousStock: previousStock ?? 0,
          newStock: newStock ?? item.quantity,
          reason: `Retur ${returnNumber}${item.reason ? ` — ${item.reason}` : ""}`,
          orderId: orderId ? new mongoose.Types.ObjectId(orderId) : null,
          invoiceNumber: linkedOrder?.invoiceNumber ?? null,
          userId: new mongoose.Types.ObjectId(cashierId),
          userName: cashierName,
          createdAt: now,
        });
      } catch (err) {
        console.error(`createReturn: StockMovement record failed for SKU ${item.sku}`, err);
      }
    })
  ).catch(() => {});

  // ── Serialize ObjectIds untuk response ───────────────────────────────────────
  const result = returnDoc.toObject();
  return {
    ...result,
    _id: result._id.toString(),
    orderId: result.orderId?.toString() ?? null,
    cashierId: result.cashierId?.toString() ?? null,
    items: result.items.map((it) => ({
      ...it,
      _id: it._id?.toString(),
      productId: it.productId?.toString(),
    })),
    createdAt: result.createdAt?.toISOString() ?? null,
    updatedAt: result.updatedAt?.toISOString() ?? null,
  };
}

/**
 * Get a list of returns, optionally filtered.
 *
 * @param {Object} [options]
 * @param {string} [options.cashierId] - Filter by cashier ID
 * @param {number} [options.limit] - Max results (default 50)
 * @param {number} [options.skip] - Offset for pagination (default 0)
 * @returns {Promise<Object[]>} Array of return documents (lean, serialized)
 */
export async function getReturns({ cashierId, limit = 50, skip = 0 } = {}) {
  await connectDB();

  const query = {};
  if (cashierId) query.cashierId = new mongoose.Types.ObjectId(cashierId);

  const docs = await Return.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return docs.map((doc) => ({
    ...doc,
    _id: doc._id.toString(),
    orderId: doc.orderId?.toString() ?? null,
    cashierId: doc.cashierId?.toString() ?? null,
    items: doc.items.map((it) => ({
      ...it,
      _id: it._id?.toString(),
      productId: it.productId?.toString(),
    })),
    createdAt: doc.createdAt?.toISOString() ?? null,
    updatedAt: doc.updatedAt?.toISOString() ?? null,
  }));
}

/**
 * Get a single return by ID.
 *
 * @param {string} id - Return ObjectId string
 * @returns {Promise<Object>} Return document (lean, serialized)
 * @throws {ReturnError} jika tidak ditemukan
 */
export async function getReturnById(id) {
  await connectDB();

  const doc = await Return.findById(id).lean();
  if (!doc) {
    throw new ReturnError(ReturnErrorCode.ORDER_NOT_FOUND, "Data retur tidak ditemukan");
  }

  return {
    ...doc,
    _id: doc._id.toString(),
    orderId: doc.orderId?.toString() ?? null,
    cashierId: doc.cashierId?.toString() ?? null,
    items: doc.items.map((it) => ({
      ...it,
      _id: it._id?.toString(),
      productId: it.productId?.toString(),
    })),
    createdAt: doc.createdAt?.toISOString() ?? null,
    updatedAt: doc.updatedAt?.toISOString() ?? null,
  };
}
