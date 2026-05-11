import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import { generateInvoiceNumber } from "@/lib/invoice";
import sseManager from "@/lib/sse";

/**
 * Custom error class for order operations.
 */
export class OrderError extends Error {
  /**
   * @param {string} code - Error code
   * @param {string} [message] - Optional override message
   */
  constructor(code, message) {
    super(message || code);
    this.name = "OrderError";
    this.code = code;
  }
}

export const OrderErrorCode = {
  EMPTY_CART: "EMPTY_CART",
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  INVALID_STATUS: "INVALID_STATUS",
};

/**
 * Create a new order from a cashier's cart items.
 *
 * @param {string} cashierId - User ObjectId string
 * @param {Array<{productId: string, quantity: number}>} items - Cart items
 * @param {string} [customerName] - Nama pelanggan (opsional)
 * @returns {Promise<Object>} Created order document (lean)
 * @throws {OrderError} EMPTY_CART | INSUFFICIENT_STOCK
 */
export async function createOrder(cashierId, items, customerName = null) {
  await connectDB();

  // Validate: cart must not be empty
  if (!items || items.length === 0) {
    throw new OrderError(OrderErrorCode.EMPTY_CART, "Keranjang belanja kosong");
  }

  // Validate stock for each item and build order item snapshots
  const orderItems = [];
  let totalAmount = 0;

  for (const cartItem of items) {
    const product = await Product.findById(cartItem.productId).lean();

    if (!product || !product.isActive) {
      throw new OrderError(
        OrderErrorCode.INSUFFICIENT_STOCK,
        `Produk tidak ditemukan atau tidak aktif`
      );
    }

    if (product.stock < cartItem.quantity) {
      throw new OrderError(
        OrderErrorCode.INSUFFICIENT_STOCK,
        `Stok tidak mencukupi untuk produk: ${product.name}`
      );
    }

    orderItems.push({
      productId: product._id,
      productName: product.name,
      sku: product.sku,
      unitPrice: product.price,
      quantity: cartItem.quantity,
    });

    totalAmount += product.price * cartItem.quantity;
  }

  // Generate unique invoice number
  const invoiceNumber = await generateInvoiceNumber();

  // Create and save the order
  const order = await Order.create({
    invoiceNumber,
    cashierId,
    customerName: customerName?.trim() || null,
    items: orderItems,
    totalAmount,
    orderStatus: "waiting_preparation",
    paymentStatus: "pending",
  });

  const orderObj = order.toObject();

  // Serialize ObjectId and Date fields to plain values for Client Component compatibility
  const serialized = {
    ...orderObj,
    _id: orderObj._id.toString(),
    cashierId: orderObj.cashierId?.toString() ?? null,
    customerName: orderObj.customerName ?? null,
    invoiceNumber: orderObj.invoiceNumber,
    totalAmount: orderObj.totalAmount,
    orderStatus: orderObj.orderStatus,
    paymentStatus: orderObj.paymentStatus,
    createdAt: orderObj.createdAt?.toISOString() ?? null,
    updatedAt: orderObj.updatedAt?.toISOString() ?? null,
    completedAt: orderObj.completedAt?.toISOString() ?? null,
    items: orderObj.items.map((item) => ({
      ...item,
      _id: item._id?.toString() ?? null,
      productId: item.productId?.toString() ?? null,
    })),
  };

  // Lookup cashier name for SSE broadcast
  try {
    const cashierUser = await User.findById(cashierId).select("name").lean();
    if (cashierUser) serialized.cashierName = cashierUser.name;
  } catch {
    // non-critical, ignore
  }

  // Broadcast new order event to all WAREHOUSE clients in real-time
  try {
    sseManager.broadcastToRole(
      { type: "new_order", data: serialized },
      ["WAREHOUSE"]
    );
  } catch (err) {
    // SSE broadcast failure must not break order creation
    console.error("SSE broadcast error (new_order):", err);
  }

  return serialized;
}

/**
 * Get a list of orders with optional filters.
 * Includes cashierName populated from User collection.
 * @param {Object} [filters]
 * @param {string|string[]} [filters.status] - Filter by orderStatus
 * @param {string} [filters.cashierId] - Filter by cashierId
 * @returns {Promise<Object[]>} Array of serialized order documents
 */
export async function getOrders({ status, cashierId } = {}) {
  await connectDB();

  const query = {};

  if (status) {
    const statuses = Array.isArray(status)
      ? status
      : status.split(",").map((s) => s.trim()).filter(Boolean);

    if (statuses.length === 1) {
      query.orderStatus = statuses[0];
    } else if (statuses.length > 1) {
      query.orderStatus = { $in: statuses };
    }
  }

  if (cashierId) {
    query.cashierId = cashierId;
  }

  // Populate cashierName dari User
  const orders = await Order.find(query)
    .populate("cashierId", "name")
    .sort({ createdAt: -1 })
    .lean({ virtuals: false });

  // Serialize dan tambahkan cashierName
  return orders.map((order) => ({
    ...order,
    _id: order._id?.toString(),
    cashierName: order.cashierId?.name ?? "Kasir",
    cashierId: order.cashierId?._id?.toString() ?? order.cashierId?.toString() ?? null,
    customerName: order.customerName || null,
    createdAt: order.createdAt?.toISOString() ?? null,
    updatedAt: order.updatedAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    qrisExpiresAt: order.qrisExpiresAt?.toISOString() ?? null,
    items: (order.items || []).map((item) => ({
      ...item,
      _id: item._id?.toString() ?? null,
      productId: item.productId?.toString() ?? null,
    })),
  }));
}

/**
 * Get a single order by ID.
 * @param {string} orderId - Order ObjectId string
 * @returns {Promise<Object>} Order document (lean)
 * @throws {OrderError} ORDER_NOT_FOUND if order does not exist
 */
export async function getOrderById(orderId) {
  await connectDB();

  const order = await Order.findById(orderId).lean();

  if (!order) {
    throw new OrderError(OrderErrorCode.ORDER_NOT_FOUND, "Pesanan tidak ditemukan");
  }

  return order;
}
