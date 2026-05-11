/**
 * Order status values representing the lifecycle of an order.
 * @enum {string}
 */
export const OrderStatus = {
  WAITING_PREPARATION: "waiting_preparation",
  PREPARING: "preparing",
  READY: "ready",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

/**
 * Payment status values for an order.
 * @enum {string}
 */
export const PaymentStatus = {
  PENDING: "pending",
  PAID: "paid",
  EXPIRED: "expired",
};

/**
 * Payment methods supported by the system.
 * @enum {string}
 */
export const PaymentMethod = {
  CASH: "CASH",
  QRIS: "QRIS",
};

/**
 * Array of all valid order statuses.
 * @type {string[]}
 */
export const ORDER_STATUSES = Object.values(OrderStatus);

/**
 * Array of all valid payment statuses.
 * @type {string[]}
 */
export const PAYMENT_STATUSES = Object.values(PaymentStatus);

/**
 * Array of all valid payment methods.
 * @type {string[]}
 */
export const PAYMENT_METHODS = Object.values(PaymentMethod);

/**
 * Order statuses that appear in the warehouse queue.
 * @type {string[]}
 */
export const QUEUE_STATUSES = [
  OrderStatus.WAITING_PREPARATION,
  OrderStatus.PREPARING,
];

/**
 * QRIS expiry duration in milliseconds (5 minutes).
 * @type {number}
 */
export const QRIS_EXPIRY_MS = 5 * 60 * 1000;
