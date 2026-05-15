/**
 * Property-Based Tests: Idempoten completePayment() — Property 2
 *
 * **Validates: Requirements 7.5**
 *
 * Property 2: Idempoten Webhook Pembayaran
 *
 * Memanggil completePayment() dua kali dengan orderId yang sama tidak boleh
 * mengubah state sistem lebih dari sekali:
 *
 *   P2a: Stok tidak berkurang dua kali — Product.bulkWrite dipanggil tepat sekali
 *        untuk berbagai kombinasi orderId dan item yang valid.
 *   P2b: Tidak ada duplicate Invoice — Invoice.create dipanggil tepat sekali
 *        untuk berbagai kombinasi orderId yang valid.
 *   P2c: Panggilan kedua tidak melempar error yang tidak terduga — harus
 *        mengembalikan PaymentError dengan code ALREADY_PAID (graceful idempotency).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Mocks — harus dideklarasikan sebelum import service
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
// Import setelah mocks
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
// Helper factories
// ---------------------------------------------------------------------------

/**
 * Membuat mock item pesanan.
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
 * Membuat mock pesanan dalam state "ready" + "pending"
 * (eligible untuk completePayment).
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
 * Membuat mock pesanan dalam state "completed" + "paid"
 * (sudah diproses — state setelah panggilan pertama berhasil).
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
 * Membuat mock dokumen Invoice.
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
 * Menyiapkan mock untuk panggilan PERTAMA completePayment() yang berhasil.
 * Setelah panggilan ini, pesanan berstatus "paid".
 */
function setupFirstCallMocks(order) {
  const invoice = makeMockInvoice(
    order._id,
    order.invoiceNumber,
    order.items,
    order.paymentMethod
  );

  // findById mengembalikan pesanan pending (panggilan pertama)
  Order.findById.mockReturnValueOnce({
    lean: vi.fn().mockResolvedValue(order),
  });

  // Update Order berhasil
  Order.updateOne.mockResolvedValue({ modifiedCount: 1 });

  // Pengurangan stok berhasil untuk semua item
  Product.bulkWrite.mockResolvedValue({ modifiedCount: order.items.length });

  // Lookup User untuk cashierName
  User.findById.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: "cashier-001", name: "Kasir" }),
    }),
  });

  // Pembuatan Invoice berhasil
  Invoice.create.mockResolvedValue({ toObject: () => invoice });

  return invoice;
}

/**
 * Menyiapkan mock untuk panggilan KEDUA completePayment() dengan orderId yang sama.
 * Pesanan sudah "paid" — guard idempotency harus menolaknya.
 */
function setupSecondCallMocks(order) {
  const paidOrder = makePaidOrder(order);
  Order.findById.mockReturnValueOnce({
    lean: vi.fn().mockResolvedValue(paidOrder),
  });
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** ID produk yang valid */
const arbProductId = fc
  .integer({ min: 1, max: 9999 })
  .map((n) => `product-${String(n).padStart(4, "0")}`);

/** Harga satuan: integer rupiah positif */
const arbPrice = fc.integer({ min: 1_000, max: 500_000 });

/** Level stok yang valid */
const arbStock = fc.integer({ min: 1, max: 100 });

/** Satu item pesanan dengan kuantitas valid (≤ stok) */
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

/** Array item pesanan dengan productId unik (1–5 item) */
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

/** ID pesanan yang valid */
const arbOrderId = fc
  .integer({ min: 1, max: 9999 })
  .map((n) => `order-${String(n).padStart(4, "0")}`);

/** Nomor invoice yang valid */
const arbInvoiceNumber = fc
  .integer({ min: 1, max: 9999 })
  .map((n) => `INV-20260507-${String(n).padStart(4, "0")}`);

/** Metode pembayaran digital yang valid untuk pesanan online */
const arbPaymentMethod = fc.constantFrom(
  "QRIS",
  "EWALLET_DANA",
  "EWALLET_OVO",
  "EWALLET_GOPAY"
);

/** Konfigurasi pesanan lengkap */
const arbOrderConfig = fc.record({
  orderId: arbOrderId,
  invoiceNumber: arbInvoiceNumber,
  items: arbOrderItems,
  paymentMethod: arbPaymentMethod,
});

// ---------------------------------------------------------------------------
// P2a: Stok tidak berkurang dua kali
// Validates: Requirements 7.5
// ---------------------------------------------------------------------------

describe("P2a: Stok tidak berkurang dua kali — Product.bulkWrite dipanggil tepat sekali", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "untuk berbagai kombinasi orderId dan item valid, Product.bulkWrite hanya dipanggil sekali meskipun completePayment() dipanggil dua kali",
    async () => {
      /**
       * **Validates: Requirements 7.5**
       *
       * Invariant utama: untuk setiap konfigurasi pesanan yang valid,
       * memanggil completePayment() dua kali dengan orderId yang sama harus
       * memastikan Product.bulkWrite (pengurangan stok) hanya dipanggil
       * TEPAT SEKALI.
       *
       * Ini mencegah pengurangan stok ganda akibat webhook duplikat.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfig,
          async ({ orderId, invoiceNumber, items, paymentMethod }) => {
            vi.resetAllMocks();

            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            // Panggilan pertama: berhasil
            setupFirstCallMocks(order);
            await completePayment(orderId, { method: paymentMethod });

            // Panggilan kedua: ditolak oleh guard idempotency
            setupSecondCallMocks(order);
            try {
              await completePayment(orderId, { method: paymentMethod });
            } catch {
              // diharapkan — ALREADY_PAID
            }

            // INVARIANT KRITIS: bulkWrite harus dipanggil tepat sekali
            // (bukan dua kali — tidak ada pengurangan stok ganda)
            expect(Product.bulkWrite).toHaveBeenCalledTimes(1);

            // Verifikasi operasi bulkWrite mengurangi kuantitas yang benar
            const bulkOps = Product.bulkWrite.mock.calls[0][0];
            expect(bulkOps).toHaveLength(items.length);

            for (let i = 0; i < items.length; i++) {
              const op = bulkOps[i];
              // Pengurangan stok harus sebesar quantity item
              expect(op.updateOne.update.$inc.stock).toBe(-items[i].quantity);
              // Guard: hanya update jika stok mencukupi
              expect(op.updateOne.filter.stock.$gte).toBe(items[i].quantity);
            }
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    "jumlah operasi bulkWrite tidak bertambah setelah panggilan kedua yang ditolak",
    async () => {
      /**
       * **Validates: Requirements 7.5**
       *
       * Verifikasi bahwa panggilan kedua yang ditolak tidak menambah
       * jumlah operasi bulkWrite sama sekali.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfig,
          async ({ orderId, invoiceNumber, items, paymentMethod }) => {
            vi.resetAllMocks();

            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            // Panggilan pertama: berhasil
            setupFirstCallMocks(order);
            await completePayment(orderId, { method: paymentMethod });

            // Catat jumlah panggilan setelah panggilan pertama
            const bulkWriteCountAfterFirst = Product.bulkWrite.mock.calls.length;
            expect(bulkWriteCountAfterFirst).toBe(1);

            // Panggilan kedua: ditolak
            setupSecondCallMocks(order);
            try {
              await completePayment(orderId, { method: paymentMethod });
            } catch {
              // diharapkan — ALREADY_PAID
            }

            // Jumlah panggilan tidak boleh bertambah
            expect(Product.bulkWrite).toHaveBeenCalledTimes(bulkWriteCountAfterFirst);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P2b: Tidak ada duplicate Invoice
// Validates: Requirements 7.5
// ---------------------------------------------------------------------------

describe("P2b: Tidak ada duplicate Invoice — Invoice.create dipanggil tepat sekali", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "untuk berbagai kombinasi orderId valid, Invoice.create hanya dipanggil sekali meskipun completePayment() dipanggil dua kali",
    async () => {
      /**
       * **Validates: Requirements 7.5**
       *
       * Invariant: untuk setiap konfigurasi pesanan yang valid, memanggil
       * completePayment() dua kali dengan orderId yang sama harus memastikan
       * Invoice.create hanya dipanggil TEPAT SEKALI.
       *
       * Ini mencegah pembuatan Invoice duplikat yang dapat menyebabkan
       * inkonsistensi data keuangan.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfig,
          async ({ orderId, invoiceNumber, items, paymentMethod }) => {
            vi.resetAllMocks();

            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            // Panggilan pertama: berhasil
            setupFirstCallMocks(order);
            await completePayment(orderId, { method: paymentMethod });

            // Panggilan kedua: ditolak oleh guard idempotency
            setupSecondCallMocks(order);
            try {
              await completePayment(orderId, { method: paymentMethod });
            } catch {
              // diharapkan — ALREADY_PAID
            }

            // INVARIANT KRITIS: Invoice.create harus dipanggil tepat sekali
            // (bukan dua kali — tidak ada invoice duplikat)
            expect(Invoice.create).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    "Invoice yang dibuat harus memiliki invoiceNumber yang sesuai dengan pesanan",
    async () => {
      /**
       * **Validates: Requirements 7.5**
       *
       * Verifikasi bahwa Invoice yang dibuat pada panggilan pertama
       * memiliki invoiceNumber yang benar dan tidak ada invoice kedua
       * dengan invoiceNumber yang sama.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfig,
          async ({ orderId, invoiceNumber, items, paymentMethod }) => {
            vi.resetAllMocks();

            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            // Panggilan pertama: berhasil
            setupFirstCallMocks(order);
            const firstInvoice = await completePayment(orderId, { method: paymentMethod });

            // Panggilan kedua: ditolak
            setupSecondCallMocks(order);
            try {
              await completePayment(orderId, { method: paymentMethod });
            } catch {
              // diharapkan — ALREADY_PAID
            }

            // Invoice pertama harus memiliki invoiceNumber yang benar
            expect(firstInvoice.invoiceNumber).toBe(invoiceNumber);

            // Hanya satu Invoice yang dibuat
            expect(Invoice.create).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P2c: Panggilan kedua tidak melempar error yang tidak terduga (graceful idempotency)
// Validates: Requirements 7.5
// ---------------------------------------------------------------------------

describe("P2c: Panggilan kedua graceful — mengembalikan ALREADY_PAID bukan error sistem", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "panggilan kedua completePayment() dengan orderId yang sama harus melempar PaymentError dengan code ALREADY_PAID",
    async () => {
      /**
       * **Validates: Requirements 7.5**
       *
       * Untuk setiap konfigurasi pesanan yang valid, memanggil
       * completePayment() dua kali dengan orderId yang sama harus:
       * - Panggilan pertama: berhasil (mengembalikan invoice)
       * - Panggilan kedua: melempar PaymentError dengan code ALREADY_PAID
       *
       * Ini memastikan webhook duplikat tidak memproses ulang pembayaran
       * dan tidak melempar error sistem yang tidak terduga (HTTP 500).
       * Sesuai Requirement 7.5: webhook harus mengembalikan HTTP 200 idempoten.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfig,
          async ({ orderId, invoiceNumber, items, paymentMethod }) => {
            vi.resetAllMocks();

            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            // Panggilan pertama: berhasil
            setupFirstCallMocks(order);
            const firstResult = await completePayment(orderId, { method: paymentMethod });
            expect(firstResult).toBeDefined();
            expect(firstResult.invoiceNumber).toBe(invoiceNumber);

            // Panggilan kedua: pesanan sudah "paid" — harus ditolak dengan ALREADY_PAID
            setupSecondCallMocks(order);

            let secondError = null;
            try {
              await completePayment(orderId, { method: paymentMethod });
            } catch (err) {
              secondError = err;
            }

            // Panggilan kedua HARUS melempar ALREADY_PAID
            expect(secondError).not.toBeNull();
            expect(secondError).toBeInstanceOf(PaymentError);
            expect(secondError.code).toBe(PaymentErrorCode.ALREADY_PAID);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    "panggilan kedua tidak boleh melempar error sistem (TypeError, ReferenceError, dll.)",
    async () => {
      /**
       * **Validates: Requirements 7.5**
       *
       * Error yang dilempar pada panggilan kedua harus selalu berupa
       * PaymentError yang terkontrol, bukan error sistem yang tidak terduga.
       * Ini memastikan webhook handler dapat menangani duplikat dengan aman.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfig,
          async ({ orderId, invoiceNumber, items, paymentMethod }) => {
            vi.resetAllMocks();

            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            // Panggilan pertama: berhasil
            setupFirstCallMocks(order);
            await completePayment(orderId, { method: paymentMethod });

            // Panggilan kedua: harus melempar PaymentError yang terkontrol
            setupSecondCallMocks(order);

            let caughtError = null;
            try {
              await completePayment(orderId, { method: paymentMethod });
            } catch (err) {
              caughtError = err;
            }

            // Error harus berupa PaymentError (bukan TypeError, ReferenceError, dll.)
            expect(caughtError).toBeInstanceOf(PaymentError);
            expect(caughtError.name).toBe("PaymentError");
            // Error harus memiliki code yang valid
            expect(caughtError.code).toBeDefined();
            expect(typeof caughtError.code).toBe("string");
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    "Order.updateOne tidak boleh dipanggil pada panggilan kedua",
    async () => {
      /**
       * **Validates: Requirements 7.5**
       *
       * Panggilan kedua completePayment() harus dihentikan sebelum mencapai
       * langkah update Order. Ini memastikan tidak ada perubahan state Order
       * yang tidak diinginkan akibat webhook duplikat.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfig,
          async ({ orderId, invoiceNumber, items, paymentMethod }) => {
            vi.resetAllMocks();

            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            // Panggilan pertama: berhasil — Order.updateOne dipanggil sekali
            setupFirstCallMocks(order);
            await completePayment(orderId, { method: paymentMethod });

            const updateCountAfterFirst = Order.updateOne.mock.calls.length;

            // Panggilan kedua: ditolak oleh guard idempotency
            setupSecondCallMocks(order);
            try {
              await completePayment(orderId, { method: paymentMethod });
            } catch {
              // diharapkan — ALREADY_PAID
            }

            // Order.updateOne tidak boleh dipanggil lagi pada panggilan kedua
            expect(Order.updateOne).toHaveBeenCalledTimes(updateCountAfterFirst);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P2 (Combined): State akhir sistem identik setelah satu atau dua panggilan
// Validates: Requirements 7.5
// ---------------------------------------------------------------------------

describe("P2 (Combined): State akhir sistem identik setelah satu atau dua panggilan", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "state sistem setelah dua panggilan identik dengan setelah satu panggilan (definisi formal idempotency)",
    async () => {
      /**
       * **Validates: Requirements 7.5**
       *
       * Definisi formal idempotency: f(f(x)) = f(x)
       *
       * State akhir sistem setelah completePayment() dipanggil dua kali
       * harus identik dengan state setelah dipanggil sekali. Diverifikasi
       * dengan membandingkan jumlah operasi DB:
       * - Product.bulkWrite: 1x (bukan 2x) → stok tidak berkurang dua kali
       * - Invoice.create: 1x (bukan 2x) → tidak ada invoice duplikat
       * - Order.updateOne: 1x (bukan 2x) → status order tidak diubah dua kali
       * - SSE broadcast: 1x (bukan 2x) → notifikasi tidak dikirim dua kali
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfig,
          async ({ orderId, invoiceNumber, items, paymentMethod }) => {
            vi.resetAllMocks();

            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            // Panggilan pertama: berhasil
            setupFirstCallMocks(order);
            const firstInvoice = await completePayment(orderId, { method: paymentMethod });

            // Catat state setelah panggilan pertama
            const bulkWriteCallsAfterFirst = Product.bulkWrite.mock.calls.length;
            const invoiceCreateCallsAfterFirst = Invoice.create.mock.calls.length;
            const orderUpdateCallsAfterFirst = Order.updateOne.mock.calls.length;
            const sseBroadcastCallsAfterFirst = sseManager.broadcastToRole.mock.calls.length;

            // Panggilan kedua: ditolak
            setupSecondCallMocks(order);
            let secondError = null;
            try {
              await completePayment(orderId, { method: paymentMethod });
            } catch (err) {
              secondError = err;
            }

            // State tidak boleh berubah setelah panggilan kedua yang ditolak
            expect(Product.bulkWrite).toHaveBeenCalledTimes(bulkWriteCallsAfterFirst);
            expect(Invoice.create).toHaveBeenCalledTimes(invoiceCreateCallsAfterFirst);
            expect(Order.updateOne).toHaveBeenCalledTimes(orderUpdateCallsAfterFirst);
            expect(sseManager.broadcastToRole).toHaveBeenCalledTimes(sseBroadcastCallsAfterFirst);

            // Panggilan kedua harus ditolak dengan ALREADY_PAID
            expect(secondError).toBeInstanceOf(PaymentError);
            expect(secondError.code).toBe(PaymentErrorCode.ALREADY_PAID);

            // Invoice dari panggilan pertama harus valid
            expect(firstInvoice.invoiceNumber).toBe(invoiceNumber);
            expect(firstInvoice.paymentMethod).toBe(paymentMethod);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
