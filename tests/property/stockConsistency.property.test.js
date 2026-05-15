/**
 * Property-Based Tests: Konsistensi Stok pada Penyelesaian Pembayaran Online
 *
 * **Validates: Requirements 7.2, 8.1**
 *
 * Property 1: Konsistensi Stok pada Penyelesaian Pembayaran Online
 *
 * Setelah completePayment() berhasil dipanggil, stok setiap produk harus
 * berkurang tepat sebesar quantity yang dipesan:
 *
 *   stok_setelah === stok_sebelum - quantity
 *
 * Sub-properties yang diuji:
 *   P1a: Argumen yang dikirim ke Product.bulkWrite mengandung
 *        $inc: { stock: -quantity } yang tepat untuk setiap item.
 *   P1b: Untuk berbagai kombinasi item (1–5 item, kuantitas 1–100,
 *        stok awal ≥ kuantitas), invariant konsistensi stok selalu terpenuhi.
 *   P1c: Jika stok tidak mencukupi (stok_awal < quantity), completePayment()
 *        harus gagal atau bulkWrite menggunakan guard { stock: { $gte: quantity } }
 *        sehingga stok tidak pernah negatif.
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
 * Menyiapkan semua mock untuk satu panggilan completePayment() yang berhasil.
 * bulkWrite dikonfigurasi agar mengembalikan modifiedCount === items.length
 * (semua stok berhasil dikurangi).
 */
function setupSuccessfulPaymentMocks(order) {
  const invoice = makeMockInvoice(
    order._id,
    order.invoiceNumber,
    order.items,
    order.paymentMethod
  );

  Order.findById.mockReturnValueOnce({
    lean: vi.fn().mockResolvedValue(order),
  });

  Order.updateOne.mockResolvedValue({ modifiedCount: 1 });

  // bulkWrite berhasil — semua item stoknya mencukupi
  Product.bulkWrite.mockResolvedValue({ modifiedCount: order.items.length });

  User.findById.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: "cashier-001", name: "Kasir" }),
    }),
  });

  Invoice.create.mockResolvedValue({ toObject: () => invoice });

  return invoice;
}

/**
 * Menyiapkan mock untuk skenario stok tidak mencukupi:
 * bulkWrite mengembalikan modifiedCount < items.length.
 */
function setupInsufficientStockMocks(order, modifiedCount = 0) {
  Order.findById.mockReturnValueOnce({
    lean: vi.fn().mockResolvedValue(order),
  });

  Order.updateOne.mockResolvedValue({ modifiedCount: 1 });

  // bulkWrite gagal — stok tidak mencukupi (modifiedCount < items.length)
  Product.bulkWrite.mockResolvedValue({ modifiedCount });

  // Rollback: Order.updateOne dipanggil lagi untuk rollback
  Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
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

/** Stok awal yang valid (≥ 1) */
const arbInitialStock = fc.integer({ min: 1, max: 100 });

/**
 * Satu item pesanan dengan kuantitas valid (1 ≤ quantity ≤ stock).
 * Menghasilkan { item, initialStock } agar bisa diverifikasi konsistensi stok.
 */
const arbOrderItemWithStock = fc
  .record({
    productId: arbProductId,
    price: arbPrice,
    stock: arbInitialStock,
  })
  .chain(({ productId, price, stock }) =>
    fc
      .integer({ min: 1, max: stock })
      .map((quantity) => ({
        item: makeMockItem(productId, quantity, price),
        initialStock: stock,
      }))
  );

/**
 * Array item pesanan dengan productId unik (1–5 item), stok awal ≥ kuantitas.
 * Menghasilkan { items, stockMap } di mana stockMap[productId] = initialStock.
 */
const arbOrderItemsWithStock = fc
  .array(arbOrderItemWithStock, { minLength: 1, maxLength: 5 })
  .map((entries) => {
    const seen = new Set();
    const filtered = entries.filter(({ item }) => {
      if (seen.has(item.productId)) return false;
      seen.add(item.productId);
      return true;
    });
    const items = filtered.map((e) => e.item);
    const stockMap = {};
    filtered.forEach(({ item, initialStock }) => {
      stockMap[item.productId] = initialStock;
    });
    return { items, stockMap };
  })
  .filter(({ items }) => items.length > 0);

/** ID pesanan yang valid */
const arbOrderId = fc
  .integer({ min: 1, max: 9999 })
  .map((n) => `order-${String(n).padStart(4, "0")}`);

/** Nomor invoice yang valid */
const arbInvoiceNumber = fc
  .integer({ min: 1, max: 9999 })
  .map((n) => `INV-20260507-${String(n).padStart(4, "0")}`);

/** Metode pembayaran yang valid untuk pesanan online */
const arbPaymentMethod = fc.constantFrom(
  "QRIS",
  "EWALLET_DANA",
  "EWALLET_OVO",
  "EWALLET_GOPAY",
  "CASH",
  "BANK_TRANSFER"
);

/** Konfigurasi pesanan lengkap dengan data stok */
const arbOrderConfigWithStock = fc.record({
  orderId: arbOrderId,
  invoiceNumber: arbInvoiceNumber,
  itemsWithStock: arbOrderItemsWithStock,
  paymentMethod: arbPaymentMethod,
});

// ---------------------------------------------------------------------------
// P1a: Argumen bulkWrite mengandung $inc: { stock: -quantity } yang tepat
// Validates: Requirements 7.2, 8.1
// ---------------------------------------------------------------------------

describe("P1a: Argumen bulkWrite — $inc: { stock: -quantity } tepat untuk setiap item", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "untuk setiap item dalam pesanan, bulkWrite harus menerima $inc: { stock: -quantity } yang tepat",
    async () => {
      /**
       * **Validates: Requirements 7.2, 8.1**
       *
       * Invariant: untuk setiap item dalam pesanan, argumen yang dikirim ke
       * Product.bulkWrite harus mengandung operasi pengurangan stok yang tepat:
       *   op.updateOne.update.$inc.stock === -item.quantity
       *
       * Ini memverifikasi bahwa completePayment() mengirimkan instruksi
       * pengurangan stok yang benar ke database untuk setiap item.
       * Requirement 7.2: stok_setelah === stok_sebelum - quantity.
       * Requirement 8.1: pengurangan stok hanya terjadi saat completePayment().
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfigWithStock,
          async ({ orderId, invoiceNumber, itemsWithStock, paymentMethod }) => {
            vi.resetAllMocks();

            const { items } = itemsWithStock;
            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            setupSuccessfulPaymentMocks(order);
            await completePayment(orderId, { method: paymentMethod });

            // Verifikasi bulkWrite dipanggil tepat sekali
            expect(Product.bulkWrite).toHaveBeenCalledTimes(1);

            const bulkOps = Product.bulkWrite.mock.calls[0][0];

            // Jumlah operasi harus sama dengan jumlah item
            expect(bulkOps).toHaveLength(items.length);

            // Setiap operasi harus mengandung pengurangan stok yang tepat
            for (let i = 0; i < items.length; i++) {
              const op = bulkOps[i];
              const item = items[i];

              // Pengurangan stok harus tepat sebesar quantity item
              expect(op.updateOne.update.$inc.stock).toBe(-item.quantity);

              // Filter harus menarget productId yang benar
              expect(op.updateOne.filter._id).toBe(item.productId);
            }
          }
        ),
        { numRuns: 200 }
      );
    }
  );

  it(
    "setiap operasi bulkWrite harus menarget productId yang sesuai dengan item pesanan",
    async () => {
      /**
       * **Validates: Requirements 7.2**
       *
       * Verifikasi bahwa setiap operasi bulkWrite menarget productId yang
       * benar — tidak ada stok produk lain yang ikut berkurang.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfigWithStock,
          async ({ orderId, invoiceNumber, itemsWithStock, paymentMethod }) => {
            vi.resetAllMocks();

            const { items } = itemsWithStock;
            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            setupSuccessfulPaymentMocks(order);
            await completePayment(orderId, { method: paymentMethod });

            const bulkOps = Product.bulkWrite.mock.calls[0][0];

            // Kumpulkan semua productId yang ditarget oleh bulkWrite
            const targetedProductIds = bulkOps.map((op) => op.updateOne.filter._id);
            const expectedProductIds = items.map((item) => item.productId);

            // Setiap productId dalam pesanan harus ada dalam operasi bulkWrite
            for (const productId of expectedProductIds) {
              expect(targetedProductIds).toContain(productId);
            }

            // Tidak ada productId ekstra yang tidak ada dalam pesanan
            expect(targetedProductIds).toHaveLength(expectedProductIds.length);
          }
        ),
        { numRuns: 200 }
      );
    }
  );

  it(
    "jumlah total pengurangan stok harus sama dengan total quantity yang dipesan",
    async () => {
      /**
       * **Validates: Requirements 7.2**
       *
       * Verifikasi bahwa jumlah total unit yang dikurangi dari stok
       * sama persis dengan total quantity yang dipesan.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfigWithStock,
          async ({ orderId, invoiceNumber, itemsWithStock, paymentMethod }) => {
            vi.resetAllMocks();

            const { items } = itemsWithStock;
            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            setupSuccessfulPaymentMocks(order);
            await completePayment(orderId, { method: paymentMethod });

            const bulkOps = Product.bulkWrite.mock.calls[0][0];

            // Total pengurangan stok dari semua operasi
            const totalDecrement = bulkOps.reduce(
              (sum, op) => sum + Math.abs(op.updateOne.update.$inc.stock),
              0
            );

            // Total quantity yang dipesan
            const totalQuantityOrdered = items.reduce(
              (sum, item) => sum + item.quantity,
              0
            );

            expect(totalDecrement).toBe(totalQuantityOrdered);
          }
        ),
        { numRuns: 200 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P1b: Invariant konsistensi stok untuk berbagai kombinasi item
// Validates: Requirements 7.2, 8.1
// ---------------------------------------------------------------------------

describe("P1b: Invariant konsistensi stok — stok_setelah === stok_sebelum - quantity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "untuk berbagai kombinasi item (1–5 item, kuantitas 1–100, stok ≥ kuantitas), stok_setelah === stok_sebelum - quantity",
    async () => {
      /**
       * **Validates: Requirements 7.2, 8.1**
       *
       * Invariant utama konsistensi stok:
       *   stok_setelah === stok_sebelum - quantity
       *
       * Diverifikasi dengan mensimulasikan pengurangan stok berdasarkan
       * argumen yang dikirim ke Product.bulkWrite:
       *   stok_setelah = stok_sebelum + $inc.stock
       *                = stok_sebelum + (-quantity)
       *                = stok_sebelum - quantity
       *
       * Requirement 7.2: stok dikurangi secara atomik saat pembayaran dikonfirmasi.
       * Requirement 8.1: pengurangan stok hanya terjadi saat completePayment().
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfigWithStock,
          async ({ orderId, invoiceNumber, itemsWithStock, paymentMethod }) => {
            vi.resetAllMocks();

            const { items, stockMap } = itemsWithStock;
            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            setupSuccessfulPaymentMocks(order);
            await completePayment(orderId, { method: paymentMethod });

            const bulkOps = Product.bulkWrite.mock.calls[0][0];

            // Verifikasi invariant untuk setiap item
            for (const op of bulkOps) {
              const productId = op.updateOne.filter._id;
              const decrement = op.updateOne.update.$inc.stock; // nilai negatif

              const stockBefore = stockMap[productId];
              const stockAfter = stockBefore + decrement; // stok_sebelum - quantity

              // Invariant: stok_setelah === stok_sebelum - quantity
              const item = items.find((i) => i.productId === productId);
              expect(stockAfter).toBe(stockBefore - item.quantity);

              // Stok setelah tidak boleh negatif (karena stok_awal ≥ quantity)
              expect(stockAfter).toBeGreaterThanOrEqual(0);
            }
          }
        ),
        { numRuns: 300 }
      );
    }
  );

  it(
    "completePayment() berhasil dan mengembalikan invoice yang valid untuk semua kombinasi item valid",
    async () => {
      /**
       * **Validates: Requirements 7.2, 8.1**
       *
       * Verifikasi bahwa completePayment() berhasil (tidak melempar error)
       * dan mengembalikan invoice yang valid untuk semua kombinasi item
       * dengan stok yang mencukupi.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfigWithStock,
          async ({ orderId, invoiceNumber, itemsWithStock, paymentMethod }) => {
            vi.resetAllMocks();

            const { items } = itemsWithStock;
            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            setupSuccessfulPaymentMocks(order);

            let invoice;
            let error = null;
            try {
              invoice = await completePayment(orderId, { method: paymentMethod });
            } catch (err) {
              error = err;
            }

            // Tidak boleh ada error untuk pesanan dengan stok mencukupi
            expect(error).toBeNull();

            // Invoice harus valid
            expect(invoice).toBeDefined();
            expect(invoice.invoiceNumber).toBe(invoiceNumber);
            expect(invoice.paymentMethod).toBe(paymentMethod);

            // bulkWrite harus dipanggil tepat sekali
            expect(Product.bulkWrite).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 200 }
      );
    }
  );

  it(
    "pengurangan stok hanya terjadi sekali per item — tidak ada double decrement",
    async () => {
      /**
       * **Validates: Requirements 8.1**
       *
       * Requirement 8.1: pengurangan stok hanya terjadi saat completePayment()
       * dipanggil, bukan saat pesanan dibuat.
       *
       * Verifikasi bahwa setiap productId hanya muncul sekali dalam operasi
       * bulkWrite — tidak ada pengurangan ganda untuk produk yang sama.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfigWithStock,
          async ({ orderId, invoiceNumber, itemsWithStock, paymentMethod }) => {
            vi.resetAllMocks();

            const { items } = itemsWithStock;
            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            setupSuccessfulPaymentMocks(order);
            await completePayment(orderId, { method: paymentMethod });

            const bulkOps = Product.bulkWrite.mock.calls[0][0];

            // Kumpulkan semua productId yang ditarget
            const targetedProductIds = bulkOps.map((op) => op.updateOne.filter._id);
            const uniqueProductIds = new Set(targetedProductIds);

            // Setiap productId harus unik — tidak ada double decrement
            expect(targetedProductIds.length).toBe(uniqueProductIds.size);
          }
        ),
        { numRuns: 200 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P1c: Stok tidak pernah negatif — guard { stock: { $gte: quantity } }
// Validates: Requirements 7.2
// ---------------------------------------------------------------------------

describe("P1c: Stok tidak pernah negatif — guard $gte mencegah pengurangan berlebih", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "setiap operasi bulkWrite harus menggunakan guard { stock: { $gte: quantity } }",
    async () => {
      /**
       * **Validates: Requirements 7.2**
       *
       * Untuk mencegah stok negatif, setiap operasi bulkWrite harus
       * menggunakan filter guard:
       *   { _id: productId, stock: { $gte: quantity } }
       *
       * Guard ini memastikan pengurangan hanya terjadi jika stok mencukupi,
       * sehingga stok tidak pernah menjadi negatif.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfigWithStock,
          async ({ orderId, invoiceNumber, itemsWithStock, paymentMethod }) => {
            vi.resetAllMocks();

            const { items } = itemsWithStock;
            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            setupSuccessfulPaymentMocks(order);
            await completePayment(orderId, { method: paymentMethod });

            const bulkOps = Product.bulkWrite.mock.calls[0][0];

            // Setiap operasi harus memiliki guard $gte
            for (let i = 0; i < bulkOps.length; i++) {
              const op = bulkOps[i];
              const item = items[i];

              // Guard: hanya update jika stok mencukupi
              expect(op.updateOne.filter.stock).toBeDefined();
              expect(op.updateOne.filter.stock.$gte).toBe(item.quantity);
            }
          }
        ),
        { numRuns: 200 }
      );
    }
  );

  it(
    "jika stok tidak mencukupi (bulkWrite modifiedCount < items.length), completePayment() harus gagal dengan INSUFFICIENT_STOCK",
    async () => {
      /**
       * **Validates: Requirements 7.2**
       *
       * Jika stok tidak mencukupi untuk satu atau lebih item (bulkWrite
       * mengembalikan modifiedCount < items.length), completePayment() harus
       * melempar PaymentError dengan code INSUFFICIENT_STOCK.
       *
       * Ini memastikan stok tidak pernah negatif — pengurangan yang gagal
       * di-rollback dan pesanan dikembalikan ke status sebelumnya.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfigWithStock,
          async ({ orderId, invoiceNumber, itemsWithStock, paymentMethod }) => {
            vi.resetAllMocks();

            const { items } = itemsWithStock;
            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            // Simulasi stok tidak mencukupi: modifiedCount = 0
            setupInsufficientStockMocks(order, 0);

            let caughtError = null;
            try {
              await completePayment(orderId, { method: paymentMethod });
            } catch (err) {
              caughtError = err;
            }

            // Harus melempar PaymentError dengan code INSUFFICIENT_STOCK
            expect(caughtError).not.toBeNull();
            expect(caughtError).toBeInstanceOf(PaymentError);
            expect(caughtError.code).toBe(PaymentErrorCode.INSUFFICIENT_STOCK);
          }
        ),
        { numRuns: 150 }
      );
    }
  );

  it(
    "jika stok tidak mencukupi, Invoice tidak boleh dibuat",
    async () => {
      /**
       * **Validates: Requirements 7.2**
       *
       * Jika pengurangan stok gagal (stok tidak mencukupi), Invoice tidak
       * boleh dibuat — rollback harus mencegah pembuatan Invoice yang tidak
       * valid.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfigWithStock,
          async ({ orderId, invoiceNumber, itemsWithStock, paymentMethod }) => {
            vi.resetAllMocks();

            const { items } = itemsWithStock;
            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            // Simulasi stok tidak mencukupi
            setupInsufficientStockMocks(order, 0);

            try {
              await completePayment(orderId, { method: paymentMethod });
            } catch {
              // diharapkan — INSUFFICIENT_STOCK
            }

            // Invoice tidak boleh dibuat jika stok tidak mencukupi
            expect(Invoice.create).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 150 }
      );
    }
  );

  it(
    "guard $gte memastikan nilai pengurangan tidak melebihi stok yang tersedia",
    async () => {
      /**
       * **Validates: Requirements 7.2**
       *
       * Verifikasi bahwa nilai guard $gte dalam setiap operasi bulkWrite
       * sama persis dengan quantity item — tidak lebih kecil (yang bisa
       * memungkinkan stok negatif) dan tidak lebih besar (yang bisa
       * menolak pengurangan yang valid).
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfigWithStock,
          async ({ orderId, invoiceNumber, itemsWithStock, paymentMethod }) => {
            vi.resetAllMocks();

            const { items } = itemsWithStock;
            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            setupSuccessfulPaymentMocks(order);
            await completePayment(orderId, { method: paymentMethod });

            const bulkOps = Product.bulkWrite.mock.calls[0][0];

            for (const op of bulkOps) {
              const productId = op.updateOne.filter._id;
              const item = items.find((i) => i.productId === productId);
              const guardValue = op.updateOne.filter.stock.$gte;
              const decrementValue = Math.abs(op.updateOne.update.$inc.stock);

              // Guard harus sama persis dengan quantity
              expect(guardValue).toBe(item.quantity);

              // Decrement harus sama persis dengan quantity
              expect(decrementValue).toBe(item.quantity);

              // Guard dan decrement harus konsisten satu sama lain
              expect(guardValue).toBe(decrementValue);
            }
          }
        ),
        { numRuns: 200 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P1 (Combined): Konsistensi stok end-to-end
// Validates: Requirements 7.2, 8.1
// ---------------------------------------------------------------------------

describe("P1 (Combined): Konsistensi stok end-to-end setelah completePayment()", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "setelah completePayment() berhasil, semua invariant konsistensi stok terpenuhi sekaligus",
    async () => {
      /**
       * **Validates: Requirements 7.2, 8.1**
       *
       * Verifikasi gabungan semua invariant konsistensi stok dalam satu
       * property test:
       *
       * 1. bulkWrite dipanggil tepat sekali (Req 8.1 — hanya saat completePayment)
       * 2. Jumlah operasi = jumlah item (setiap item dikurangi)
       * 3. Setiap operasi: $inc.stock === -quantity (Req 7.2 — tepat sebesar quantity)
       * 4. Setiap operasi: guard $gte === quantity (stok tidak pernah negatif)
       * 5. stok_setelah = stok_sebelum - quantity ≥ 0 (Req 7.2 — konsistensi)
       * 6. Invoice berhasil dibuat dengan data yang benar
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderConfigWithStock,
          async ({ orderId, invoiceNumber, itemsWithStock, paymentMethod }) => {
            vi.resetAllMocks();

            const { items, stockMap } = itemsWithStock;
            const order = makePendingOrder(orderId, invoiceNumber, items, paymentMethod);

            setupSuccessfulPaymentMocks(order);
            const invoice = await completePayment(orderId, { method: paymentMethod });

            // Invariant 1: bulkWrite dipanggil tepat sekali
            expect(Product.bulkWrite).toHaveBeenCalledTimes(1);

            const bulkOps = Product.bulkWrite.mock.calls[0][0];

            // Invariant 2: jumlah operasi = jumlah item
            expect(bulkOps).toHaveLength(items.length);

            for (const op of bulkOps) {
              const productId = op.updateOne.filter._id;
              const item = items.find((i) => i.productId === productId);
              const stockBefore = stockMap[productId];

              // Invariant 3: $inc.stock === -quantity
              expect(op.updateOne.update.$inc.stock).toBe(-item.quantity);

              // Invariant 4: guard $gte === quantity
              expect(op.updateOne.filter.stock.$gte).toBe(item.quantity);

              // Invariant 5: stok_setelah = stok_sebelum - quantity ≥ 0
              const stockAfter = stockBefore - item.quantity;
              expect(stockAfter).toBeGreaterThanOrEqual(0);
              expect(stockAfter).toBe(stockBefore + op.updateOne.update.$inc.stock);
            }

            // Invariant 6: Invoice valid
            expect(invoice).toBeDefined();
            expect(invoice.invoiceNumber).toBe(invoiceNumber);
          }
        ),
        { numRuns: 300 }
      );
    }
  );
});
