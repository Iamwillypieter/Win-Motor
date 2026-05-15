/**
 * Property-Based Tests: completePayment() Idempotency (Property 2)
 *
 * **Validates: Requirements 7.5**
 *
 * Property 2: Idempoten Webhook Pembayaran
 *
 * Memanggil completePayment() dua kali dengan orderId yang sama tidak boleh
 * mengubah state sistem lebih dari sekali:
 *   - Stok tidak berkurang dua kali (Product.bulkWrite dipanggil tepat sekali)
 *   - Tidak ada duplicate Invoice (Invoice.create dipanggil tepat sekali)
 *   - Panggilan kedua mengembalikan error ALREADY_PAID (HTTP 200 idempoten)
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
    broadcastToToken: vi.fn(),
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

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import Invoice from "@/models/Invoice";
import sseManager from "@/lib/sse";
import {
  completePayment,
  PaymentError,
  PaymentErrorCode,
} from "@/server/services/payment.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock order item.
 */
function makeMockItem(productId, quantity, unitPrice) {
  return {
    productId,
    productName: `Produk-${productId}`,
    sku: `SKU-${productId}`,
    unitPrice,
    quantity,
  };
}

/**
 * Build a mock order in "ready" + "pending" state (eligible for completePayment).
 */
function makePendingOrder(orderId, invoiceNumber, items, paymentMethod = "QRIS") {
  return {
    _id: orderId,
    invoiceNumber,
    cashierId: "cashier-001",
    items,
    totalAmount: items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    orderStatus: "ready",
    paymentStatus: "pending",
    paymentMethod,
    orderType: "ONLINE",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Build a mock order in "completed" + "paid" state (already processed).
 */
function makePaidOrder(pendingOrder) {
  return {
    ...pendingOrder,
    orderStatus: "completed",
    paymentStatus: "paid",
    completedAt: new Date(),
  };
}

/**
 * Build a mock invoice document.
 */
function makeMockInvoice(orderId, invoiceNumber, items, paymentMethod) {
  return {
    _id: `invoice-${orderId}`,
    orderId,
    invoiceNumber,
    cashierName: "Kasir",
    items: items.map((i) => ({
      ...i,
      subtotal: i.unitPrice * i.quantity,
    })),
    totalAmount: items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    paymentMethod,
    cashReceived: null,
    changeAmount: null,
    transactionAt: new Date(),
  };
}

/**
 * Set up mocks for a SUCCESSFUL first call to completePayment().
 * After this call, the order is "paid".
 */
function setupFirstCallMocks(order) {
  const invoice = makeMockInvoice(order._id, order.invoiceNumber, order.items, order.paymentMethod);

  // findById returns the pending order (first call)
  Order.findById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(order) });

  // Order update succeeds
  Order.updateOne.mockResolvedValue({ modifiedCount: 1 });

  // Stock decrement succeeds for all items
  Product.bulkWrite.mockResolvedValue({ modifiedCount: order.items.length });

  // User lookup for cashierName
  User.findById.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: "cashier-001", name: "Kasir" }),
    }),
  });

  // Invoice creation succeeds
  Invoice.create.mockResolvedValue({ toObject: () => invoice });

  return invoice;
}

/**
 * Set up mocks for a SECOND call to completePayment() with the same orderId.
 * The order is now "paid" — the idempotency guard should reject it.
 */
function setupSecondCallMocks(order) {
  const paidOrder = makePaidOrder(order);
  // findById returns the already-paid order (second call)
  Order.findById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(paidOrder) });
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

/** A valid stock level */
const arbStock = fc.integer({ min: 1, max: 100 });

/** A single order item with valid quantity (≤ stock) */
const arbOrderItem = fc
  .record({
    productId: arbProductId,
    price: arbPrice,
    stock: arbStock,
  })
  .chain(({ productId, price, stock }) =>
    fc
      .integer({ min: 1, max: stock })
      .map((quantity) => makeMockItem(productId, quantity, price))
  );

/** An array of order items with unique productIds (1–5 items) */
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

/** A valid invoice number */
const arbInvoiceNumber = fc
  .integer({ min: 1, max: 9999 })
  .map((n) => `INV-20260507-${String(n).padStart(4, "0")}`);

/** A valid digital payment method for online orders */
const arbPaymentMethod = fc.constantFrom("QRIS", "EWALLET_DANA", "EWALLET_OVO", "EWALLET_GOPAY");

/** A complete order configuration */
const arbOrderConfig = fc.record({
  orderId: arbOrderId,
  invoiceNumber: arbInvoiceNumber,
  items: arbOrderItems,
  paymentMethod: arbPaymentMethod,
});

// ---------------------------------------------------------------------------
// Property 2: Idempoten Webhook Pembayaran
// Validates: Requirements 7.5
// ---------------------------------------------------------------------------

describe("Property 2: Idempoten Webhook Pembayaran", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "panggilan kedua completePayment() dengan orderId yang sama harus mengembalikan error ALREADY_PAID",
    async () => {
      /**
       * **Validates: Requirements 7.5**
       *
       * Property: Untuk setiap konfigurasi pesanan yang valid, memanggil
       * completePayment() dua kali dengan orderId yang sama harus:
       * - Panggilan pertama: berhasil (mengembalikan invoice)
       * - Panggilan kedua: melempar PaymentError dengan code ALREADY_PAID
       *
       * Ini memastikan webhook duplikat tidak memproses ulang pembayaran.
       */
      await fc.assert(
        fc.asyncProperty(arbOrderConfig, async ({ orderId, invoiceNumber, items, paymentMethod }) => {
          vi.resetAllMocks();

          const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

          // First call: succeeds
          setupFirstCallMocks(order);
          const firstResult = await completePayment(orderId, { method: paymentMethod });
          expect(firstResult).toBeDefined();
          expect(firstResult.invoiceNumber).toBe(invoiceNumber);

          // Second call: order is now "paid" — must be rejected
          setupSecondCallMocks(order);

          let secondError = null;
          try {
            await completePayment(orderId, { method: paymentMethod });
          } catch (err) {
            secondError = err;
          }

          // The second call MUST throw ALREADY_PAID
          expect(secondError).not.toBeNull();
          expect(secondError).toBeInstanceOf(PaymentError);
          expect(secondError.code).toBe(PaymentErrorCode.ALREADY_PAID);
        })
      );
    }
  );

  it(
    "stok tidak boleh berkurang dua kali — Product.bulkWrite dipanggil tepat sekali",
    async () => {
      /**
       * **Validates: Requirements 7.5**
       *
       * Property: Untuk setiap konfigurasi pesanan yang valid, memanggil
       * completePayment() dua kali dengan orderId yang sama harus memastikan
       * Product.bulkWrite (pengurangan stok) hanya dipanggil TEPAT SEKALI.
       *
       * Ini adalah invariant utama: stok tidak boleh berkurang dua kali
       * akibat webhook duplikat.
       */
      await fc.assert(
        fc.asyncProperty(arbOrderConfig, async ({ orderId, invoiceNumber, items, paymentMethod }) => {
          vi.resetAllMocks();

          const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

          // First call: succeeds
          setupFirstCallMocks(order);
          await completePayment(orderId, { method: paymentMethod });

          // Second call: rejected by idempotency guard
          setupSecondCallMocks(order);
          try {
            await completePayment(orderId, { method: paymentMethod });
          } catch {
            // expected — ALREADY_PAID
          }

          // CRITICAL INVARIANT: bulkWrite must have been called exactly once
          // (not twice — no double stock decrement)
          expect(Product.bulkWrite).toHaveBeenCalledTimes(1);

          // Verify the single bulkWrite decremented the correct quantities
          const bulkOps = Product.bulkWrite.mock.calls[0][0];
          expect(bulkOps).toHaveLength(items.length);

          for (let i = 0; i < items.length; i++) {
            const op = bulkOps[i];
            expect(op.updateOne.update.$inc.stock).toBe(-items[i].quantity);
            // Guard against negative stock
            expect(op.updateOne.filter.stock.$gte).toBe(items[i].quantity);
          }
        })
      );
    }
  );

  it(
    "tidak ada duplicate Invoice — Invoice.create dipanggil tepat sekali",
    async () => {
      /**
       * **Validates: Requirements 7.5**
       *
       * Property: Untuk setiap konfigurasi pesanan yang valid, memanggil
       * completePayment() dua kali dengan orderId yang sama harus memastikan
       * Invoice.create hanya dipanggil TEPAT SEKALI.
       *
       * Ini mencegah pembuatan Invoice duplikat yang dapat menyebabkan
       * inkonsistensi data keuangan.
       */
      await fc.assert(
        fc.asyncProperty(arbOrderConfig, async ({ orderId, invoiceNumber, items, paymentMethod }) => {
          vi.resetAllMocks();

          const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

          // First call: succeeds
          setupFirstCallMocks(order);
          await completePayment(orderId, { method: paymentMethod });

          // Second call: rejected by idempotency guard
          setupSecondCallMocks(order);
          try {
            await completePayment(orderId, { method: paymentMethod });
          } catch {
            // expected — ALREADY_PAID
          }

          // CRITICAL INVARIANT: Invoice.create must have been called exactly once
          // (not twice — no duplicate invoice)
          expect(Invoice.create).toHaveBeenCalledTimes(1);
        })
      );
    }
  );

  it(
    "Order.updateOne tidak boleh dipanggil pada panggilan kedua",
    async () => {
      /**
       * **Validates: Requirements 7.5**
       *
       * Property: Panggilan kedua completePayment() harus dihentikan sebelum
       * mencapai langkah update Order. Ini memastikan tidak ada perubahan
       * state Order yang tidak diinginkan akibat webhook duplikat.
       */
      await fc.assert(
        fc.asyncProperty(arbOrderConfig, async ({ orderId, invoiceNumber, items, paymentMethod }) => {
          vi.resetAllMocks();

          const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

          // First call: succeeds — Order.updateOne called once
          setupFirstCallMocks(order);
          await completePayment(orderId, { method: paymentMethod });

          const updateCountAfterFirstCall = Order.updateOne.mock.calls.length;

          // Second call: rejected by idempotency guard
          setupSecondCallMocks(order);
          try {
            await completePayment(orderId, { method: paymentMethod });
          } catch {
            // expected — ALREADY_PAID
          }

          // Order.updateOne must NOT have been called again on the second call
          expect(Order.updateOne).toHaveBeenCalledTimes(updateCountAfterFirstCall);
        })
      );
    }
  );

  it(
    "SSE broadcast tidak boleh dipanggil dua kali untuk orderId yang sama",
    async () => {
      /**
       * **Validates: Requirements 7.5**
       *
       * Property: SSE broadcast 'order_completed' harus hanya dikirim sekali
       * per pesanan, meskipun webhook diterima dua kali.
       */
      await fc.assert(
        fc.asyncProperty(arbOrderConfig, async ({ orderId, invoiceNumber, items, paymentMethod }) => {
          vi.resetAllMocks();

          const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

          // First call: succeeds — SSE broadcast sent once
          setupFirstCallMocks(order);
          await completePayment(orderId, { method: paymentMethod });

          // Second call: rejected by idempotency guard
          setupSecondCallMocks(order);
          try {
            await completePayment(orderId, { method: paymentMethod });
          } catch {
            // expected — ALREADY_PAID
          }

          // SSE broadcast must have been called exactly once
          expect(sseManager.broadcastToRole).toHaveBeenCalledTimes(1);
        })
      );
    }
  );

  it(
    "hasil akhir sistem setelah dua panggilan identik dengan setelah satu panggilan",
    async () => {
      /**
       * **Validates: Requirements 7.5**
       *
       * Property: State akhir sistem setelah completePayment() dipanggil dua kali
       * harus identik dengan state setelah dipanggil sekali. Ini adalah definisi
       * formal dari idempotency.
       *
       * Diverifikasi dengan membandingkan jumlah operasi DB:
       * - bulkWrite: 1x (bukan 2x)
       * - Invoice.create: 1x (bukan 2x)
       * - Order.updateOne: 1x (bukan 2x)
       */
      await fc.assert(
        fc.asyncProperty(arbOrderConfig, async ({ orderId, invoiceNumber, items, paymentMethod }) => {
          vi.resetAllMocks();

          const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

          // First call: succeeds
          setupFirstCallMocks(order);
          const firstInvoice = await completePayment(orderId, { method: paymentMethod });

          // Capture state after first call
          const bulkWriteCallsAfterFirst = Product.bulkWrite.mock.calls.length;
          const invoiceCreateCallsAfterFirst = Invoice.create.mock.calls.length;
          const orderUpdateCallsAfterFirst = Order.updateOne.mock.calls.length;

          // Second call: rejected
          setupSecondCallMocks(order);
          let secondError = null;
          try {
            await completePayment(orderId, { method: paymentMethod });
          } catch (err) {
            secondError = err;
          }

          // State must not have changed after the second (rejected) call
          expect(Product.bulkWrite).toHaveBeenCalledTimes(bulkWriteCallsAfterFirst);
          expect(Invoice.create).toHaveBeenCalledTimes(invoiceCreateCallsAfterFirst);
          expect(Order.updateOne).toHaveBeenCalledTimes(orderUpdateCallsAfterFirst);

          // The second call must have been rejected
          expect(secondError).toBeInstanceOf(PaymentError);
          expect(secondError.code).toBe(PaymentErrorCode.ALREADY_PAID);

          // The first call must have returned a valid invoice
          expect(firstInvoice.invoiceNumber).toBe(invoiceNumber);
          expect(firstInvoice.paymentMethod).toBe(paymentMethod);
        })
      );
    }
  );
});

// ---------------------------------------------------------------------------
// Property 1: Konsistensi Stok pada Penyelesaian Pembayaran Online
// Validates: Requirements 7.2, 8.1
// ---------------------------------------------------------------------------

describe("Property 1: Konsistensi Stok pada Penyelesaian Pembayaran Online", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "untuk setiap item valid, completePayment() harus mengurangi stok sebesar quantity (stok_setelah = stok_sebelum - quantity)",
    async () => {
      await fc.assert(
        fc.asyncProperty(arbOrderConfig, async ({ orderId, invoiceNumber, items, paymentMethod }) => {
          vi.resetAllMocks();

          const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

          // completePayment() success path
          setupFirstCallMocks(order);
          await completePayment(orderId, { method: paymentMethod });

          // Verify generated stock operations follow invariant:
          // stock_after = stock_before - quantity
          expect(Product.bulkWrite).toHaveBeenCalledTimes(1);
          const bulkOps = Product.bulkWrite.mock.calls[0][0];
          expect(bulkOps).toHaveLength(items.length);

          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const op = bulkOps[i].updateOne;

            // Guard: update only allowed if stock_before >= quantity
            expect(op.filter.stock.$gte).toBe(item.quantity);
            // Transition: stock_after = stock_before - quantity
            expect(op.update.$inc.stock).toBe(-item.quantity);
          }
        })
      );
    }
  );
});
