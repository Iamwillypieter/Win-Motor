import { randomUUID } from "crypto";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import { generateInvoiceNumber } from "@/lib/invoice";
import sseManager from "@/lib/sse";
import { ALL_PAYMENT_METHODS } from "@/lib/paymentMethods";
import { isValidWhatsapp } from "@/lib/validators";

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
  INVALID_WHATSAPP: "INVALID_WHATSAPP",
  INVALID_PAYMENT_METHOD: "INVALID_PAYMENT_METHOD",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
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
 * @param {string} [filters.orderType] - Filter by orderType: "ONLINE" | "OFFLINE"
 * @returns {Promise<Object[]>} Array of serialized order documents
 */
export async function getOrders({ status, cashierId, orderType } = {}) {
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

  if (orderType) {
    query.orderType = orderType;
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

/**
 * Update items in an existing order (before payment).
 * Recalculates totalAmount. Only allowed for orders with paymentStatus "pending"
 * and orderStatus not "completed" or "cancelled".
 *
 * @param {string} orderId
 * @param {Array<{productId: string, quantity: number}>} items - Full replacement item list
 * @param {string} [customerName]
 * @returns {Promise<Object>} Updated serialized order
 * @throws {OrderError}
 */
export async function updateOrderItems(orderId, items, customerName) {
  await connectDB();

  const order = await Order.findById(orderId);
  if (!order) {
    throw new OrderError(OrderErrorCode.ORDER_NOT_FOUND, "Pesanan tidak ditemukan");
  }

  if (order.paymentStatus === "paid") {
    throw new OrderError(OrderErrorCode.INVALID_STATUS, "Pesanan sudah dibayar, tidak dapat diubah");
  }

  if (["completed", "cancelled"].includes(order.orderStatus)) {
    throw new OrderError(OrderErrorCode.INVALID_STATUS, `Pesanan sudah ${order.orderStatus}, tidak dapat diubah`);
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new OrderError(OrderErrorCode.EMPTY_CART, "Item pesanan tidak boleh kosong");
  }

  // Validate stock and build new item snapshots
  const orderItems = [];
  let totalAmount = 0;

  for (const cartItem of items) {
    const product = await Product.findById(cartItem.productId).lean();
    if (!product || !product.isActive) {
      throw new OrderError(OrderErrorCode.INSUFFICIENT_STOCK, `Produk tidak ditemukan atau tidak aktif`);
    }
    if (product.stock < cartItem.quantity) {
      throw new OrderError(OrderErrorCode.INSUFFICIENT_STOCK, `Stok tidak mencukupi untuk produk: ${product.name}`);
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

  order.items = orderItems;
  order.totalAmount = totalAmount;
  if (customerName !== undefined) {
    order.customerName = customerName?.trim() || null;
  }
  order.updatedAt = new Date();
  await order.save();

  const updated = order.toObject();
  return {
    ...updated,
    _id: updated._id.toString(),
    cashierId: updated.cashierId?.toString() ?? null,
    items: updated.items.map((item) => ({
      ...item,
      _id: item._id?.toString() ?? null,
      productId: item.productId?.toString() ?? null,
    })),
    createdAt: updated.createdAt?.toISOString() ?? null,
    updatedAt: updated.updatedAt?.toISOString() ?? null,
  };
}

/**
 * Cancel an order that has not been paid yet.
 * Sets orderStatus to "cancelled". Only allowed for pending orders.
 *
 * @param {string} orderId
 * @returns {Promise<Object>} Cancelled serialized order
 * @throws {OrderError}
 */
export async function cancelOrder(orderId) {
  await connectDB();

  const order = await Order.findById(orderId);
  if (!order) {
    throw new OrderError(OrderErrorCode.ORDER_NOT_FOUND, "Pesanan tidak ditemukan");
  }

  if (order.paymentStatus === "paid") {
    throw new OrderError(OrderErrorCode.INVALID_STATUS, "Pesanan sudah dibayar, tidak dapat dibatalkan");
  }

  if (["completed", "cancelled"].includes(order.orderStatus)) {
    throw new OrderError(OrderErrorCode.INVALID_STATUS, `Pesanan sudah ${order.orderStatus}`);
  }

  order.orderStatus = "cancelled";
  order.updatedAt = new Date();
  await order.save();

  // Broadcast ke WAREHOUSE dan CASHIER
  try {
    sseManager.broadcastToRole(
      { type: "order_status_updated", data: { orderId: orderId.toString(), orderStatus: "cancelled" } },
      ["CASHIER", "WAREHOUSE"]
    );
  } catch (err) {
    console.error("SSE broadcast error (cancel order):", err);
  }

  const updated = order.toObject();
  return {
    ...updated,
    _id: updated._id.toString(),
    createdAt: updated.createdAt?.toISOString() ?? null,
    updatedAt: updated.updatedAt?.toISOString() ?? null,
  };
}

/**
 * Create a new online order from a public customer.
 *
 * Business rules:
 *  - Stock is NOT decremented at order creation (only on payment completion).
 *  - cashierId is set to null (no staff session).
 *  - A one-time sseToken (UUID) is generated and stored on the Order so the
 *    customer can subscribe to real-time status updates via /api/sse/public.
 *  - A new_order SSE event is broadcast to all WAREHOUSE clients.
 *
 * @param {Object} params
 * @param {Array<{productId: string, quantity: number}>} params.items
 * @param {string} params.customerName
 * @param {string} params.customerWhatsapp - Format: 08xx or +62xx
 * @param {string} params.shippingAddress
 * @param {string} params.paymentMethod - One of ALL_PAYMENT_METHODS
 * @returns {Promise<Object>} Serialized order document including sseToken
 * @throws {OrderError} EMPTY_CART | MISSING_REQUIRED_FIELD | INVALID_WHATSAPP |
 *                      INVALID_PAYMENT_METHOD | INSUFFICIENT_STOCK
 */
export async function createOnlineOrder({
  items,
  customerName,
  customerWhatsapp,
  shippingAddress,
  paymentMethod,
}) {
  await connectDB();

  // --- Validate required fields ---
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new OrderError(OrderErrorCode.EMPTY_CART, "Keranjang belanja kosong");
  }

  if (!customerName || !customerName.trim()) {
    throw new OrderError(
      OrderErrorCode.MISSING_REQUIRED_FIELD,
      "Nama lengkap wajib diisi"
    );
  }

  if (!customerWhatsapp || !customerWhatsapp.trim()) {
    throw new OrderError(
      OrderErrorCode.MISSING_REQUIRED_FIELD,
      "Nomor WhatsApp wajib diisi"
    );
  }

  if (!isValidWhatsapp(customerWhatsapp)) {
    throw new OrderError(
      OrderErrorCode.INVALID_WHATSAPP,
      "Nomor WhatsApp tidak valid"
    );
  }

  if (!shippingAddress || !shippingAddress.trim()) {
    throw new OrderError(
      OrderErrorCode.MISSING_REQUIRED_FIELD,
      "Alamat pengiriman wajib diisi"
    );
  }

  if (!paymentMethod) {
    throw new OrderError(
      OrderErrorCode.MISSING_REQUIRED_FIELD,
      "Pilih metode pembayaran"
    );
  }

  if (!ALL_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new OrderError(
      OrderErrorCode.INVALID_PAYMENT_METHOD,
      "Metode pembayaran tidak valid"
    );
  }

  // --- Validate stock and build order item snapshots ---
  const orderItems = [];
  let totalAmount = 0;

  for (const cartItem of items) {
    if (!cartItem.productId || !cartItem.quantity || cartItem.quantity < 1) {
      throw new OrderError(
        OrderErrorCode.MISSING_REQUIRED_FIELD,
        "Setiap item harus memiliki productId dan quantity yang valid"
      );
    }

    const product = await Product.findById(cartItem.productId).lean();

    if (!product || !product.isActive) {
      throw new OrderError(
        OrderErrorCode.INSUFFICIENT_STOCK,
        "Produk tidak ditemukan atau tidak aktif"
      );
    }

    if (product.stock < cartItem.quantity) {
      throw new OrderError(
        OrderErrorCode.INSUFFICIENT_STOCK,
        `Stok ${product.name} tidak mencukupi`
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

  // --- Generate invoice number and SSE token ---
  const invoiceNumber = await generateInvoiceNumber();
  const sseToken = randomUUID();

  // --- Persist the order ---
  const order = await Order.create({
    invoiceNumber,
    cashierId: null,
    orderType: "ONLINE",
    customerName: customerName.trim(),
    customerWhatsapp: customerWhatsapp.trim(),
    shippingAddress: shippingAddress.trim(),
    paymentMethod,
    items: orderItems,
    totalAmount,
    orderStatus: "waiting_preparation",
    paymentStatus: "pending",
    sseToken,
  });

  const orderObj = order.toObject();

  // --- Serialize for client consumption ---
  const serialized = {
    _id: orderObj._id.toString(),
    invoiceNumber: orderObj.invoiceNumber,
    orderType: orderObj.orderType,
    orderStatus: orderObj.orderStatus,
    paymentStatus: orderObj.paymentStatus,
    paymentMethod: orderObj.paymentMethod,
    totalAmount: orderObj.totalAmount,
    customerName: orderObj.customerName,
    customerWhatsapp: orderObj.customerWhatsapp,
    shippingAddress: orderObj.shippingAddress,
    sseToken: orderObj.sseToken,
    cashierId: null,
    createdAt: orderObj.createdAt?.toISOString() ?? null,
    updatedAt: orderObj.updatedAt?.toISOString() ?? null,
    completedAt: null,
    qrisCode: orderObj.qrisCode ?? null,
    qrisExpiresAt: orderObj.qrisExpiresAt?.toISOString() ?? null,
    items: orderObj.items.map((item) => ({
      ...item,
      _id: item._id?.toString() ?? null,
      productId: item.productId?.toString() ?? null,
    })),
  };

  // --- Broadcast new_order to WAREHOUSE (strip sensitive customer data) ---
  try {
    const warehousePayload = {
      _id: serialized._id,
      invoiceNumber: serialized.invoiceNumber,
      orderType: serialized.orderType,
      orderStatus: serialized.orderStatus,
      paymentStatus: serialized.paymentStatus,
      paymentMethod: serialized.paymentMethod,
      totalAmount: serialized.totalAmount,
      customerName: serialized.customerName,
      shippingAddress: serialized.shippingAddress,
      createdAt: serialized.createdAt,
      items: serialized.items,
    };

    sseManager.broadcastToRole(
      { type: "new_order", data: warehousePayload },
      ["WAREHOUSE"]
    );
  } catch (err) {
    // SSE broadcast failure must not break order creation
    console.error("SSE broadcast error (new_order online):", err);
  }

  return serialized;
}
