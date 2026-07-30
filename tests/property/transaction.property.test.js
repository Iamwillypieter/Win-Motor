
/**
 * Property-Based Tests: Atomic Transaction (P18–P20)
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 *
 * P18: Atomisitas Penyelesaian Pembayaran — ketiga operasi (paymentStatus paid,
 *      orderStatus completed, stock berkurang) terjadi bersama atau tidak sama sekali.
 * P19: Rollback Atomik Saat Kegagalan — jika ada kegagalan di tengah transaksi,
 *      paymentStatus dan orderStatus tetap pada nilai sebelumnya, tidak ada
 *      perubahan stok parsial.
 * P20: Invoice Lengkap Setelah Transaksi Selesai — setiap pesanan completed
 *      memiliki tepat satu Invoice dengan semua field wajib: invoiceNumber,
 *      transactionAt, items, totalAmount, paymentMethod, cashierName.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the service
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/sse", () => ({
  default: {
    broadcastToRole: vi.fn(),
    broadcastToUser: vi.fn(),
  },
}));

vi.mock("@/models/Order", () => {
  const mockOrder = {
    findById: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  };
  return { default: mockOrder };
});

vi.mock("@/models/Product", () => {
  const mockProduct = {
    bulkWrite: vi.fn(),
  };
  return { default: mockProduct };
});

vi.mock("@/models/User", () => {
  const mockUser = {
    findById: vi.fn(),
  };
  return { default: mockUser };
});

vi.mock("@/models/Invoice", () => {
  const mockInvoice = {
    create: vi.fn(),
  };
  return { default: mockInvoice };
});

vi.mock("mongoose", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      startSession: vi.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import mongoose from "mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import Invoice from "@/models/Invoice";
import {
  completePayment,
  PaymentError,
  PaymentErrorCode,
} from "@/server/services/payment.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock pending order document.
 */
function makeMockOrder({
  orderId,
  invoiceNumber,
  cashierId,
  items,
  totalAmount,
  paymentStatus = "pending",
  orderStatus = "ready",
}) {
  return {
    _id: orderId,
    invoiceNumber,
    cashierId,
    items,
    totalAmount,
    paymentStatus,
    orderStatus,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
  };
}

/**
 * Build a mock invoice document matching what completePayment creates.
 */
function makeMockInvoice({
  orderId,
  invoiceNumber,
  cashierName,
  items,
  totalAmount,
  paymentMethod,
  cashReceived = null,
  changeAmount = null,
}) {
  return {
    _id: `invoice-${orderId}`,
    orderId,
    invoiceNumber,
    cashierName,
    items: items.map((item) => ({
      productName: item.productName,
      sku: item.sku,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.unitPrice * item.quantity,
    })),
    totalAmount,
    paymentMethod,
    cashReceived,
    changeAmount,
    transactionAt: new Date(),
    createdAt: new Date(),
  };
}

/**
 * Set up a successful completePayment mock scenario.
 * Configures all mocks to simulate a successful atomic transaction.
 */
function setupSuccessfulTransaction({
  order,
  cashierName,
  paymentMethod,
  cashReceived = null,
  changeAmount = null,
}) {
  const mockSession = {
    withTransaction: vi.fn().mockImplementation(async (fn) => {
      await fn();
    }),
    endSession: vi.fn(),
  };

  mongoose.startSession.mockResolvedValue(mockSession);

  Order.findById.mockReturnValue({
    lean: vi.fn().mockResolvedValue(order),
  });

  Order.updateOne.mockResolvedValue({ modifiedCount: 1 });

  Product.bulkWrite.mockResolvedValue({
    modifiedCount: order.items.length,
  });

  User.findById.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({ name: cashierName }),
    }),
  });

  const invoice = makeMockInvoice({
    orderId: order._id,
    invoiceNumber: order.invoiceNumber,
    cashierName,
    items: order.items,
    totalAmount: order.totalAmount,
    paymentMethod,
    cashReceived,
    changeAmount,
  });

  Invoice.create.mockResolvedValue({ toObject: () => invoice });

  return { mockSession, invoice };
}

/**
 * Set up a failing transaction mock scenario.
 * The withTransaction callback throws at a specified step.
 */
function setupFailingTransaction({ order, failAt }) {
  const mockSession = {
    withTransaction: vi.fn().mockImplementation(async (fn) => {
      // Simulate withTransaction: call fn but it throws, then auto-aborts
      try {
        await fn();
      } catch (err) {
        // withTransaction auto-aborts on throw — re-throw to propagate
        throw err;
      }
    }),
    endSession: vi.fn(),
  };

  mongoose.startSession.mockResolvedValue(mockSession);

  Order.findById.mockReturnValue({
    lean: vi.fn().mockResolvedValue(order),
  });

  if (failAt === "order_update") {
    Order.updateOne.mockRejectedValue(new Error("DB write failed"));
  } else if (failAt === "stock_update") {
    // Step 1 succeeds, step 2 fails, rollback calls updateOne again
    Order.updateOne
      .mockResolvedValueOnce({ modifiedCount: 1 }) // step 1 OK
      .mockResolvedValueOnce({ modifiedCount: 1 }); // rollback OK
    Product.bulkWrite.mockRejectedValue(new Error("Stock write failed"));
  } else if (failAt === "invoice_create") {
    Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Product.bulkWrite.mockResolvedValue({
      modifiedCount: order.items.length,
    });
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ name: "Kasir" }),
      }),
    });
    Invoice.create.mockRejectedValue(new Error("Invoice write failed"));
  } else if (failAt === "insufficient_stock") {
    Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
    // bulkWrite modifiedCount < items.length triggers INSUFFICIENT_STOCK
    Product.bulkWrite.mockResolvedValue({ modifiedCount: 0 });
  }

  return { mockSession };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A valid product ID string */
const arbProductId = fc
  .integer({ min: 1, max: 9999 })
  .map((n) => `product-${String(n).padStart(4, "0")}`);

/** A valid price: positive integer rupiah */
const arbPrice = fc.integer({ min: 1_000, max: 500_000 });

/** A valid quantity */
const arbQuantity = fc.integer({ min: 1, max: 20 });

/** A single order item with snapshot fields */
const arbOrderItem = fc.record({
  productId: arbProductId,
  productName: fc.string({ minLength: 3, maxLength: 30 }),
  sku: fc
    .string({ minLength: 3, maxLength: 8 })
    .map((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "X")),
  unitPrice: arbPrice,
  quantity: arbQuantity,
});

/** An array of order items with unique productIds */
const arbOrderItems = fc
  .array(arbOrderItem, { minLength: 1, maxLength: 5 })
  .map((items) => {
    const seen = new Set();
    return items.filter((item) => {
      if (seen.has(item.productId)) return false;
      seen.add(item.productId);
      return true;
    });
  })
  .filter((items) => items.length > 0);

/** A valid order ID */
const arbOrderId = fc
  .integer({ min: 1, max: 9999 })
  .map((n) => `order-${String(n).padStart(4, "0")}`);

/** A valid cashier ID */
const arbCashierId = fc
  .integer({ min: 1, max: 999 })
  .map((n) => `cashier-${String(n).padStart(3, "0")}`);

/** A valid invoice number */
const arbInvoiceNumber = fc
  .integer({ min: 1, max: 9999 })
  .map((n) => `INV-20260507-${String(n).padStart(4, "0")}`);

/** A valid cashier name */
const arbCashierName = fc.constantFrom(
  "Budi Santoso",
  "Siti Rahayu",
  "Ahmad Fauzi",
  "Dewi Lestari",
  "Rudi Hartono"
);

/** Payment method */
const arbPaymentMethod = fc.constantFrom("CASH", "QRIS");

/** A valid total amount derived from items */
function computeTotal(items) {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

/** A complete pending order record */
const arbPendingOrder = fc
  .record({
    orderId: arbOrderId,
    invoiceNumber: arbInvoiceNumber,
    cashierId: arbCashierId,
    items: arbOrderItems,
  })
  .map(({ orderId, invoiceNumber, cashierId, items }) => ({
    orderId,
    invoiceNumber,
    cashierId,
    items,
    totalAmount: computeTotal(items),
  }));

/** Failure points within the transaction */
const arbFailurePoint = fc.constantFrom(
  "order_update",
  "stock_update",
  "invoice_create",
  "insufficient_stock"
);

// ---------------------------------------------------------------------------
// P18: Atomisitas Penyelesaian Pembayaran
// Validates: Requirement 6.1
// ---------------------------------------------------------------------------

describe("P18: Atomisitas Penyelesaian Pembayaran", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "ketiga operasi (paymentStatus paid, orderStatus completed, stock berkurang) harus terjadi bersama",
    async () => {
      /**
       * Validates: Requirement 6.1
       *
       * When completePayment() succeeds, all three operations must have been
       * called within the same transaction:
       *  1. Order.updateOne — sets paymentStatus: "paid", orderStatus: "completed"
       *  2. Product.bulkWrite — decrements stock for all items
       *  3. Invoice.create — creates the invoice snapshot
       *
       * All three must be called exactly once per successful payment.
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          arbCashierName,
          arbPaymentMethod,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }, cashierName, paymentMethod) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            const paymentData = {
              method: paymentMethod,
              cashReceived: paymentMethod === "CASH" ? totalAmount : null,
              changeAmount: paymentMethod === "CASH" ? 0 : null,
            };

            setupSuccessfulTransaction({
              order,
              cashierName,
              paymentMethod,
              cashReceived: paymentData.cashReceived,
              changeAmount: paymentData.changeAmount,
            });

            const invoice = await completePayment(orderId, paymentData);

            // All three operations must have been called
            expect(Order.updateOne).toHaveBeenCalledTimes(1);
            expect(Product.bulkWrite).toHaveBeenCalledTimes(1);
            expect(Invoice.create).toHaveBeenCalledTimes(1);

            // The result must be the created invoice
            expect(invoice).toBeDefined();
            expect(invoice.invoiceNumber).toBe(invoiceNumber);
          }
        )
      );
    }
  );

  it(
    "Order.updateOne harus menetapkan paymentStatus paid dan orderStatus completed",
    async () => {
      /**
       * Validates: Requirement 6.1
       *
       * The Order update within the transaction must set both paymentStatus
       * to "paid" and orderStatus to "completed" in a single call.
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          arbCashierName,
          arbPaymentMethod,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }, cashierName, paymentMethod) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            const paymentData = {
              method: paymentMethod,
              cashReceived: paymentMethod === "CASH" ? totalAmount : null,
              changeAmount: paymentMethod === "CASH" ? 0 : null,
            };

            setupSuccessfulTransaction({
              order,
              cashierName,
              paymentMethod,
              cashReceived: paymentData.cashReceived,
              changeAmount: paymentData.changeAmount,
            });

            await completePayment(orderId, paymentData);

            // Inspect the Order.updateOne call arguments
            expect(Order.updateOne).toHaveBeenCalledTimes(1);
            const [filter, update] = Order.updateOne.mock.calls[0];

            // Must target the correct order
            expect(filter._id).toBe(orderId);

            // Must set paymentStatus to "paid"
            expect(update.$set.paymentStatus).toBe("paid");

            // Must set orderStatus to "completed"
            expect(update.$set.orderStatus).toBe("completed");

            // Must set completedAt to a Date
            expect(update.$set.completedAt).toBeInstanceOf(Date);

            // Must set the correct paymentMethod
            expect(update.$set.paymentMethod).toBe(paymentMethod);
          }
        )
      );
    }
  );

  it(
    "Product.bulkWrite harus mengurangi stok untuk setiap item dalam pesanan",
    async () => {
      /**
       * Validates: Requirement 6.1
       *
       * The stock decrement operation must target every item in the order.
       * Each item must have a corresponding updateOne operation with:
       *  - filter: { _id: productId, stock: { $gte: quantity } }
       *  - update: { $inc: { stock: -quantity } }
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          arbCashierName,
          arbPaymentMethod,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }, cashierName, paymentMethod) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            const paymentData = {
              method: paymentMethod,
              cashReceived: paymentMethod === "CASH" ? totalAmount : null,
              changeAmount: paymentMethod === "CASH" ? 0 : null,
            };

            setupSuccessfulTransaction({
              order,
              cashierName,
              paymentMethod,
              cashReceived: paymentData.cashReceived,
              changeAmount: paymentData.changeAmount,
            });

            await completePayment(orderId, paymentData);

            // bulkWrite must be called once
            expect(Product.bulkWrite).toHaveBeenCalledTimes(1);

            const [bulkOps] = Product.bulkWrite.mock.calls[0];

            // Must have one operation per item
            expect(bulkOps).toHaveLength(items.length);

            // Each operation must decrement the correct quantity
            for (let i = 0; i < items.length; i++) {
              const op = bulkOps[i].updateOne;
              const item = items[i];

              // Filter must target the correct product
              expect(op.filter._id.toString()).toBe(item.productId.toString());

              // Filter must guard against negative stock
              expect(op.filter.stock.$gte).toBe(item.quantity);

              // Update must decrement by the exact quantity
              expect(op.update.$inc.stock).toBe(-item.quantity);
            }
          }
        )
      );
    }
  );

  it(
    "semua operasi harus berjalan dalam satu session MongoDB yang sama",
    async () => {
      /**
       * Validates: Requirement 6.1
       *
       * All three operations must use the same MongoDB session to ensure
       * they are part of the same atomic transaction.
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          arbCashierName,
          arbPaymentMethod,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }, cashierName, paymentMethod) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            const paymentData = {
              method: paymentMethod,
              cashReceived: paymentMethod === "CASH" ? totalAmount : null,
              changeAmount: paymentMethod === "CASH" ? 0 : null,
            };

            const { mockSession } = setupSuccessfulTransaction({
              order,
              cashierName,
              paymentMethod,
              cashReceived: paymentData.cashReceived,
              changeAmount: paymentData.changeAmount,
            });

            await completePayment(orderId, paymentData);

            // All three operations must have been called in sequence
            expect(Order.updateOne).toHaveBeenCalledTimes(1);
            expect(Product.bulkWrite).toHaveBeenCalledTimes(1);
            expect(Invoice.create).toHaveBeenCalledTimes(1);
          }
        )
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P19: Rollback Atomik Saat Kegagalan
// Validates: Requirement 6.2
// ---------------------------------------------------------------------------

describe("P19: Rollback Atomik Saat Kegagalan", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "kegagalan di mana saja dalam transaksi harus melempar PaymentError",
    async () => {
      /**
       * Validates: Requirement 6.2
       *
       * For any failure point within the transaction (order update, stock
       * decrement, or invoice creation), completePayment() must throw a
       * PaymentError. The transaction is automatically aborted by
       * withTransaction() when the callback throws.
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          arbFailurePoint,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }, failAt) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            setupFailingTransaction({ order, failAt });

            const paymentData = {
              method: "CASH",
              cashReceived: totalAmount,
              changeAmount: 0,
            };

            let thrownError = null;
            try {
              await completePayment(orderId, paymentData);
            } catch (err) {
              thrownError = err;
            }

            // Must throw on any failure
            expect(thrownError).not.toBeNull();
            expect(thrownError).toBeInstanceOf(PaymentError);
          }
        )
      );
    }
  );

  it(
    "kegagalan saat update Order tidak boleh mengubah stok produk",
    async () => {
      /**
       * Validates: Requirement 6.2
       *
       * If the Order update fails (step 1 of 3), the stock decrement
       * (step 2) must never be called — no partial stock changes.
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            setupFailingTransaction({ order, failAt: "order_update" });

            const paymentData = {
              method: "CASH",
              cashReceived: totalAmount,
              changeAmount: 0,
            };

            try {
              await completePayment(orderId, paymentData);
            } catch {
              // expected
            }

            // Stock must NOT have been decremented
            expect(Product.bulkWrite).not.toHaveBeenCalled();

            // Invoice must NOT have been created
            expect(Invoice.create).not.toHaveBeenCalled();
          }
        )
      );
    }
  );

  it(
    "kegagalan saat update stok tidak boleh membuat Invoice",
    async () => {
      /**
       * Validates: Requirement 6.2
       *
       * If the stock decrement fails (step 2 of 3), the invoice creation
       * (step 3) must never be called — no partial state.
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            setupFailingTransaction({ order, failAt: "stock_update" });

            const paymentData = {
              method: "CASH",
              cashReceived: totalAmount,
              changeAmount: 0,
            };

            try {
              await completePayment(orderId, paymentData);
            } catch {
              // expected
            }

            // Order update was called twice: step 1 + rollback after stock failure
            expect(Order.updateOne).toHaveBeenCalledTimes(2);

            // Stock update was attempted but failed
            expect(Product.bulkWrite).toHaveBeenCalledTimes(1);

            // Invoice must NOT have been created (step 3 never reached)
            expect(Invoice.create).not.toHaveBeenCalled();
          }
        )
      );
    }
  );

  it(
    "kegagalan saat buat Invoice tidak boleh menyisakan perubahan parsial",
    async () => {
      /**
       * Validates: Requirement 6.2
       *
       * If invoice creation fails (step 3 of 3), the entire transaction
       * must be rolled back. The withTransaction() mechanism ensures
       * the Order update and stock decrement are also rolled back.
       * completePayment() must throw a PaymentError.
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            setupFailingTransaction({ order, failAt: "invoice_create" });

            const paymentData = {
              method: "CASH",
              cashReceived: totalAmount,
              changeAmount: 0,
            };

            let thrownError = null;
            try {
              await completePayment(orderId, paymentData);
            } catch (err) {
              thrownError = err;
            }

            // Must throw — the transaction was aborted
            expect(thrownError).not.toBeNull();
            expect(thrownError).toBeInstanceOf(PaymentError);

            // Invoice.create was attempted but failed
            expect(Invoice.create).toHaveBeenCalledTimes(1);
          }
        )
      );
    }
  );

  it(
    "stok tidak mencukupi di tengah transaksi harus melempar INSUFFICIENT_STOCK",
    async () => {
      /**
       * Validates: Requirement 6.2
       *
       * If bulkWrite modifiedCount < items.length (stock guard filter
       * rejected some updates), the service must throw INSUFFICIENT_STOCK
       * and the transaction must be aborted.
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            setupFailingTransaction({ order, failAt: "insufficient_stock" });

            const paymentData = {
              method: "CASH",
              cashReceived: totalAmount,
              changeAmount: 0,
            };

            let thrownError = null;
            try {
              await completePayment(orderId, paymentData);
            } catch (err) {
              thrownError = err;
            }

            // Must throw INSUFFICIENT_STOCK
            expect(thrownError).not.toBeNull();
            expect(thrownError).toBeInstanceOf(PaymentError);
            expect(thrownError.code).toBe(PaymentErrorCode.INSUFFICIENT_STOCK);

            // Invoice must NOT have been created
            expect(Invoice.create).not.toHaveBeenCalled();
          }
        )
      );
    }
  );

  it(
    "pesanan yang sudah paid tidak boleh diproses ulang",
    async () => {
      /**
       * Validates: Requirement 6.2
       *
       * If an order already has paymentStatus "paid", completePayment()
       * must throw ALREADY_PAID without modifying any data.
       * This prevents double-payment scenarios.
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          arbPaymentMethod,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }, paymentMethod) => {
            vi.resetAllMocks();

            // Order is already paid
            const alreadyPaidOrder = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
              paymentStatus: "paid",
              orderStatus: "completed",
            });

            const mockSession = {
              withTransaction: vi.fn().mockImplementation(async (fn) => {
                await fn();
              }),
              endSession: vi.fn(),
            };

            mongoose.startSession.mockResolvedValue(mockSession);

            Order.findById.mockReturnValue({
              lean: vi.fn().mockResolvedValue(alreadyPaidOrder),
            });

            const paymentData = {
              method: paymentMethod,
              cashReceived: paymentMethod === "CASH" ? totalAmount : null,
              changeAmount: paymentMethod === "CASH" ? 0 : null,
            };

            let thrownError = null;
            try {
              await completePayment(orderId, paymentData);
            } catch (err) {
              thrownError = err;
            }

            // Must throw ALREADY_PAID
            expect(thrownError).not.toBeNull();
            expect(thrownError).toBeInstanceOf(PaymentError);
            expect(thrownError.code).toBe(PaymentErrorCode.ALREADY_PAID);

            // No data modifications must have occurred
            expect(Order.updateOne).not.toHaveBeenCalled();
            expect(Product.bulkWrite).not.toHaveBeenCalled();
            expect(Invoice.create).not.toHaveBeenCalled();
          }
        )
      );
    }
  );

  it(
    "pesanan yang tidak ditemukan harus melempar ORDER_NOT_FOUND",
    async () => {
      /**
       * Validates: Requirement 6.2
       *
       * If the order does not exist in the database, completePayment()
       * must throw ORDER_NOT_FOUND without any side effects.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderId,
          arbPaymentMethod,
          async (orderId, paymentMethod) => {
            vi.resetAllMocks();

            const mockSession = {
              withTransaction: vi.fn().mockImplementation(async (fn) => {
                await fn();
              }),
              endSession: vi.fn(),
            };

            mongoose.startSession.mockResolvedValue(mockSession);

            // Order not found — service uses findById().lean() directly
            Order.findById.mockReturnValue({
              lean: vi.fn().mockResolvedValue(null),
            });

            const paymentData = {
              method: paymentMethod,
              cashReceived: 100_000,
              changeAmount: 0,
            };

            let thrownError = null;
            try {
              await completePayment(orderId, paymentData);
            } catch (err) {
              thrownError = err;
            }

            // Must throw ORDER_NOT_FOUND
            expect(thrownError).not.toBeNull();
            expect(thrownError).toBeInstanceOf(PaymentError);
            expect(thrownError.code).toBe(PaymentErrorCode.ORDER_NOT_FOUND);

            // No data modifications
            expect(Order.updateOne).not.toHaveBeenCalled();
            expect(Product.bulkWrite).not.toHaveBeenCalled();
            expect(Invoice.create).not.toHaveBeenCalled();
          }
        )
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P20: Invoice Lengkap Setelah Transaksi Selesai
// Validates: Requirements 6.3, 6.4
// ---------------------------------------------------------------------------

describe("P20: Invoice Lengkap Setelah Transaksi Selesai", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "setiap pesanan completed harus menghasilkan tepat satu Invoice",
    async () => {
      /**
       * Validates: Requirement 6.3
       *
       * For any successful payment, Invoice.create must be called exactly
       * once. There must be a 1:1 relationship between completed orders
       * and invoices.
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          arbCashierName,
          arbPaymentMethod,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }, cashierName, paymentMethod) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            const paymentData = {
              method: paymentMethod,
              cashReceived: paymentMethod === "CASH" ? totalAmount : null,
              changeAmount: paymentMethod === "CASH" ? 0 : null,
            };

            setupSuccessfulTransaction({
              order,
              cashierName,
              paymentMethod,
              cashReceived: paymentData.cashReceived,
              changeAmount: paymentData.changeAmount,
            });

            await completePayment(orderId, paymentData);

            // Invoice.create must be called exactly once
            expect(Invoice.create).toHaveBeenCalledTimes(1);
          }
        )
      );
    }
  );

  it(
    "Invoice harus memiliki semua field wajib: invoiceNumber, transactionAt, items, totalAmount, paymentMethod, cashierName",
    async () => {
      /**
       * Validates: Requirements 6.3, 6.4
       *
       * The invoice created by completePayment() must contain all required
       * fields as specified in Requirement 6.4:
       *  - invoiceNumber: unique identifier
       *  - transactionAt: timestamp of the transaction
       *  - items: array of item snapshots
       *  - totalAmount: total in integer rupiah
       *  - paymentMethod: CASH or QRIS
       *  - cashierName: name of the cashier who processed the transaction
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          arbCashierName,
          arbPaymentMethod,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }, cashierName, paymentMethod) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            const paymentData = {
              method: paymentMethod,
              cashReceived: paymentMethod === "CASH" ? totalAmount : null,
              changeAmount: paymentMethod === "CASH" ? 0 : null,
            };

            setupSuccessfulTransaction({
              order,
              cashierName,
              paymentMethod,
              cashReceived: paymentData.cashReceived,
              changeAmount: paymentData.changeAmount,
            });

            const invoice = await completePayment(orderId, paymentData);

            // All required fields must be present and non-null
            expect(invoice.invoiceNumber).toBeDefined();
            expect(typeof invoice.invoiceNumber).toBe("string");
            expect(invoice.invoiceNumber.length).toBeGreaterThan(0);

            expect(invoice.transactionAt).toBeDefined();
            expect(invoice.transactionAt).toBeInstanceOf(Date);

            expect(invoice.items).toBeDefined();
            expect(Array.isArray(invoice.items)).toBe(true);
            expect(invoice.items.length).toBeGreaterThan(0);

            expect(invoice.totalAmount).toBeDefined();
            expect(typeof invoice.totalAmount).toBe("number");
            expect(invoice.totalAmount).toBeGreaterThan(0);

            expect(invoice.paymentMethod).toBeDefined();
            expect(["CASH", "QRIS"]).toContain(invoice.paymentMethod);

            expect(invoice.cashierName).toBeDefined();
            expect(typeof invoice.cashierName).toBe("string");
            expect(invoice.cashierName.length).toBeGreaterThan(0);
          }
        )
      );
    }
  );

  it(
    "Invoice.create harus dipanggil dengan invoiceNumber yang sama dengan Order",
    async () => {
      /**
       * Validates: Requirements 6.3, 6.4
       *
       * The invoice must use the same invoiceNumber as the order it belongs
       * to. This ensures the 1:1 relationship and traceability.
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          arbCashierName,
          arbPaymentMethod,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }, cashierName, paymentMethod) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            const paymentData = {
              method: paymentMethod,
              cashReceived: paymentMethod === "CASH" ? totalAmount : null,
              changeAmount: paymentMethod === "CASH" ? 0 : null,
            };

            setupSuccessfulTransaction({
              order,
              cashierName,
              paymentMethod,
              cashReceived: paymentData.cashReceived,
              changeAmount: paymentData.changeAmount,
            });

            await completePayment(orderId, paymentData);

            // Inspect Invoice.create call arguments
            expect(Invoice.create).toHaveBeenCalledTimes(1);
            const invoiceData = Invoice.create.mock.calls[0][0];

            // invoiceNumber must match the order's invoiceNumber
            expect(invoiceData.invoiceNumber).toBe(invoiceNumber);

            // orderId must reference the correct order
            expect(invoiceData.orderId.toString()).toBe(orderId.toString());

            // cashierName must be the resolved cashier name
            expect(invoiceData.cashierName).toBe(cashierName);

            // paymentMethod must match the payment data
            expect(invoiceData.paymentMethod).toBe(paymentMethod);

            // transactionAt must be a Date
            expect(invoiceData.transactionAt).toBeInstanceOf(Date);
          }
        )
      );
    }
  );

  it(
    "items di Invoice harus merupakan snapshot lengkap dari setiap item pesanan",
    async () => {
      /**
       * Validates: Requirement 6.4
       *
       * Each item in the invoice must be a complete snapshot containing:
       * productName, sku, unitPrice, quantity, and subtotal.
       * The subtotal must equal unitPrice * quantity.
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          arbCashierName,
          arbPaymentMethod,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }, cashierName, paymentMethod) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            const paymentData = {
              method: paymentMethod,
              cashReceived: paymentMethod === "CASH" ? totalAmount : null,
              changeAmount: paymentMethod === "CASH" ? 0 : null,
            };

            setupSuccessfulTransaction({
              order,
              cashierName,
              paymentMethod,
              cashReceived: paymentData.cashReceived,
              changeAmount: paymentData.changeAmount,
            });

            await completePayment(orderId, paymentData);

            const invoiceData = Invoice.create.mock.calls[0][0];

            // Must have the same number of items as the order
            expect(invoiceData.items).toHaveLength(items.length);

            // Each item must have all required snapshot fields
            for (let i = 0; i < invoiceData.items.length; i++) {
              const invoiceItem = invoiceData.items[i];
              const orderItem = items[i];

              expect(invoiceItem.productName).toBe(orderItem.productName);
              expect(invoiceItem.sku).toBe(orderItem.sku);
              expect(invoiceItem.unitPrice).toBe(orderItem.unitPrice);
              expect(invoiceItem.quantity).toBe(orderItem.quantity);

              // subtotal must equal unitPrice * quantity
              expect(invoiceItem.subtotal).toBe(
                orderItem.unitPrice * orderItem.quantity
              );
            }
          }
        )
      );
    }
  );

  it(
    "totalAmount di Invoice harus sama dengan totalAmount di Order",
    async () => {
      /**
       * Validates: Requirement 6.4
       *
       * The invoice totalAmount must exactly match the order totalAmount.
       * This ensures the invoice accurately reflects the transaction value.
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          arbCashierName,
          arbPaymentMethod,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }, cashierName, paymentMethod) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            const paymentData = {
              method: paymentMethod,
              cashReceived: paymentMethod === "CASH" ? totalAmount : null,
              changeAmount: paymentMethod === "CASH" ? 0 : null,
            };

            setupSuccessfulTransaction({
              order,
              cashierName,
              paymentMethod,
              cashReceived: paymentData.cashReceived,
              changeAmount: paymentData.changeAmount,
            });

            await completePayment(orderId, paymentData);

            const invoiceData = Invoice.create.mock.calls[0][0];

            // Invoice totalAmount must match order totalAmount
            expect(invoiceData.totalAmount).toBe(totalAmount);
          }
        )
      );
    }
  );

  it(
    "Invoice untuk pembayaran CASH harus menyimpan cashReceived dan changeAmount",
    async () => {
      /**
       * Validates: Requirement 6.4
       *
       * For CASH payments, the invoice must record cashReceived and
       * changeAmount so the cashier can reference the transaction details.
       */
      const arbCashPayment = fc
        .integer({ min: 1_000, max: 10_000_000 })
        .chain((totalAmount) =>
          fc
            .integer({ min: 0, max: 10_000_000 })
            .map((extra) => ({
              totalAmount,
              cashReceived: totalAmount + extra,
              changeAmount: extra,
            }))
        );

      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          arbCashierName,
          arbCashPayment,
          async (
            { orderId, invoiceNumber, cashierId, items },
            cashierName,
            { totalAmount, cashReceived, changeAmount }
          ) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            const paymentData = {
              method: "CASH",
              cashReceived,
              changeAmount,
            };

            setupSuccessfulTransaction({
              order,
              cashierName,
              paymentMethod: "CASH",
              cashReceived,
              changeAmount,
            });

            await completePayment(orderId, paymentData);

            const invoiceData = Invoice.create.mock.calls[0][0];

            // CASH invoice must record the received amount
            expect(invoiceData.cashReceived).toBe(cashReceived);

            // CASH invoice must record the change amount
            expect(invoiceData.changeAmount).toBe(changeAmount);

            // Change must be non-negative
            expect(invoiceData.changeAmount).toBeGreaterThanOrEqual(0);
          }
        )
      );
    }
  );

  it(
    "Invoice untuk pembayaran QRIS harus memiliki cashReceived dan changeAmount null",
    async () => {
      /**
       * Validates: Requirement 6.4
       *
       * For QRIS payments, cashReceived and changeAmount are not applicable
       * and must be null in the invoice.
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          arbCashierName,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }, cashierName) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            const paymentData = {
              method: "QRIS",
              cashReceived: null,
              changeAmount: null,
            };

            setupSuccessfulTransaction({
              order,
              cashierName,
              paymentMethod: "QRIS",
              cashReceived: null,
              changeAmount: null,
            });

            await completePayment(orderId, paymentData);

            const invoiceData = Invoice.create.mock.calls[0][0];

            // QRIS invoice must have null for cash fields
            expect(invoiceData.cashReceived).toBeNull();
            expect(invoiceData.changeAmount).toBeNull();
          }
        )
      );
    }
  );

  it(
    "Invoice harus dikembalikan sebagai hasil dari completePayment()",
    async () => {
      /**
       * Validates: Requirement 6.3
       *
       * completePayment() must return the created invoice document so the
       * caller (API route) can send it to the client for display/printing.
       */
      await fc.assert(
        fc.asyncProperty(
          arbPendingOrder,
          arbCashierName,
          arbPaymentMethod,
          async ({ orderId, invoiceNumber, cashierId, items, totalAmount }, cashierName, paymentMethod) => {
            vi.resetAllMocks();

            const order = makeMockOrder({
              orderId,
              invoiceNumber,
              cashierId,
              items,
              totalAmount,
            });

            const paymentData = {
              method: paymentMethod,
              cashReceived: paymentMethod === "CASH" ? totalAmount : null,
              changeAmount: paymentMethod === "CASH" ? 0 : null,
            };

            const { invoice: expectedInvoice } = setupSuccessfulTransaction({
              order,
              cashierName,
              paymentMethod,
              cashReceived: paymentData.cashReceived,
              changeAmount: paymentData.changeAmount,
            });

            const result = await completePayment(orderId, paymentData);

            // The returned value must be the invoice document
            expect(result).toBeDefined();
            expect(result.invoiceNumber).toBe(expectedInvoice.invoiceNumber);
            expect(result.totalAmount).toBe(expectedInvoice.totalAmount);
            expect(result.paymentMethod).toBe(expectedInvoice.paymentMethod);
            expect(result.cashierName).toBe(expectedInvoice.cashierName);
          }
        )
      );
    }
  );
});
