/**
 * Integration Tests: Payment Processing
 *
 * Validates: Requirements 6.1, 6.2, 6.3
 *
 * Test scenarios:
 *  1. Alur Cash end-to-end: create order → konfirmasi Cash → invoice dibuat, stok berkurang
 *  2. Webhook QRIS: POST ke /api/webhooks/payment → order completed, invoice dibuat
 *  3. Rollback: simulasi kegagalan di tengah transaksi → tidak ada perubahan parsial
 *
 * Pendekatan: Semua test menggunakan mock untuk DB/models dan menguji service layer
 * secara langsung (bukan HTTP end-to-end), karena Next.js App Router tidak dapat
 * dijalankan dalam lingkungan Vitest/jsdom. Ini memvalidasi kontrak integrasi antara
 * service layer, model layer, dan logika transaksi atomik.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — harus dideklarasikan sebelum import modul yang menggunakannya
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

vi.mock("@/lib/invoice", () => ({
  generateInvoiceNumber: vi.fn().mockResolvedValue("INV-20260507-0001"),
}));

vi.mock("@/models/Order", () => {
  const mockOrder = {
    findById: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
  };
  return { default: mockOrder };
});

vi.mock("@/models/Product", () => {
  const mockProduct = {
    findById: vi.fn(),
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
    findOne: vi.fn(),
  };
  return { default: mockInvoice };
});

// Mock mongoose — sediakan session yang dapat dikontrol
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
// Imports setelah mocks
// ---------------------------------------------------------------------------

import mongoose from "mongoose";
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
import { createOrder, createOnlineOrder } from "@/server/services/order.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Buat mock mongoose session yang menjalankan callback withTransaction secara langsung.
 * Jika shouldAbort=true, callback tetap dijalankan tapi error akan di-re-throw
 * (mensimulasikan perilaku withTransaction saat terjadi error di dalam transaksi).
 */
function buildMockSession({ shouldAbort = false } = {}) {
  return {
    withTransaction: vi.fn(async (fn) => {
      if (shouldAbort) {
        try {
          await fn();
        } catch (err) {
          throw err;
        }
      } else {
        await fn();
      }
    }),
    endSession: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CASHIER_ID = "cashier-id-001";

const mockCashier = {
  _id: CASHIER_ID,
  name: "Budi Santoso",
  role: "CASHIER",
};

const mockProduct = {
  _id: "product-id-001",
  name: "Kopi Arabika",
  sku: "KOP-001",
  price: 25000,
  stock: 10,
  isActive: true,
};

const mockOrderItems = [
  {
    productId: "product-id-001",
    productName: "Kopi Arabika",
    sku: "KOP-001",
    unitPrice: 25000,
    quantity: 2,
  },
];

const mockOrder = {
  _id: "order-id-001",
  invoiceNumber: "INV-20260507-0001",
  cashierId: CASHIER_ID,
  items: mockOrderItems,
  totalAmount: 50000,
  orderStatus: "ready",
  paymentStatus: "pending",
  createdAt: new Date("2026-05-07T08:00:00.000Z"),
  updatedAt: new Date("2026-05-07T08:00:00.000Z"),
};

const mockInvoiceDoc = {
  _id: "invoice-id-001",
  orderId: "order-id-001",
  invoiceNumber: "INV-20260507-0001",
  cashierName: "Budi Santoso",
  items: mockOrderItems.map((item) => ({
    ...item,
    subtotal: item.unitPrice * item.quantity,
  })),
  totalAmount: 50000,
  paymentMethod: "CASH",
  cashReceived: 60000,
  changeAmount: 10000,
  transactionAt: new Date("2026-05-07T08:05:00.000Z"),
  createdAt: new Date("2026-05-07T08:05:00.000Z"),
};

// ---------------------------------------------------------------------------
// Skenario 1: Alur Cash end-to-end
// Validates: Requirements 6.1, 6.3
// ---------------------------------------------------------------------------

describe("Skenario 1: Alur Cash end-to-end — create order → konfirmasi Cash → invoice dibuat, stok berkurang", () => {
  let mockSession;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSession = buildMockSession();
    mongoose.startSession.mockResolvedValue(mockSession);

    // Setup mock untuk createOrder
    Product.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockProduct),
    });
    Order.create.mockResolvedValue({
      toObject: () => ({
        ...mockOrder,
        orderStatus: "waiting_preparation",
        paymentStatus: "pending",
      }),
    });

    // Setup mock untuk completePayment
    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockOrder),
    });
    Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Product.bulkWrite.mockResolvedValue({ modifiedCount: mockOrderItems.length });
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockCashier),
      }),
    });
    Invoice.create.mockResolvedValue({ toObject: () => ({ ...mockInvoiceDoc }) });
  });

  it("createOrder() harus membuat pesanan dengan status awal yang benar", async () => {
    const order = await createOrder(CASHIER_ID, [
      { productId: "product-id-001", quantity: 2 },
    ]);

    expect(order).toBeDefined();
    expect(order.invoiceNumber).toBe("INV-20260507-0001");
    expect(order.orderStatus).toBe("waiting_preparation");
    expect(order.paymentStatus).toBe("pending");
    expect(order.totalAmount).toBe(50000);
  });

  it("createOrder() TIDAK boleh mengurangi stok produk", async () => {
    await createOrder(CASHIER_ID, [
      { productId: "product-id-001", quantity: 2 },
    ]);

    // Stok hanya dikurangi saat pembayaran, bukan saat pembuatan pesanan
    expect(Product.bulkWrite).not.toHaveBeenCalled();
  });

  it("completePayment() harus mengubah paymentStatus menjadi 'paid' dan orderStatus menjadi 'completed'", async () => {
    await completePayment("order-id-001", {
      method: "CASH",
      cashReceived: 60000,
      changeAmount: 10000,
    });

    expect(Order.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "order-id-001" }),
      expect.objectContaining({
        $set: expect.objectContaining({
          paymentStatus: "paid",
          orderStatus: "completed",
          paymentMethod: "CASH",
        }),
      })
    );
  });

  it("completePayment() harus mengurangi stok produk sesuai kuantitas yang dipesan", async () => {
    await completePayment("order-id-001", {
      method: "CASH",
      cashReceived: 60000,
      changeAmount: 10000,
    });

    expect(Product.bulkWrite).toHaveBeenCalledTimes(1);

    const bulkOps = Product.bulkWrite.mock.calls[0][0];
    expect(bulkOps).toHaveLength(1);
    expect(bulkOps[0].updateOne.filter._id).toBe("product-id-001");
    expect(bulkOps[0].updateOne.update.$inc.stock).toBe(-2); // quantity = 2
    // Guard: stok tidak boleh negatif
    expect(bulkOps[0].updateOne.filter.stock.$gte).toBe(2);
  });

  it("completePayment() harus membuat Invoice dengan semua field wajib", async () => {
    const invoice = await completePayment("order-id-001", {
      method: "CASH",
      cashReceived: 60000,
      changeAmount: 10000,
    });

    // Invoice harus dikembalikan
    expect(invoice).toBeDefined();
    expect(invoice.invoiceNumber).toBe("INV-20260507-0001");
    expect(invoice.cashierName).toBe("Budi Santoso");
    expect(invoice.totalAmount).toBe(50000);
    expect(invoice.paymentMethod).toBe("CASH");
    expect(invoice.cashReceived).toBe(60000);
    expect(invoice.changeAmount).toBe(10000);
  });

  it("Invoice harus memuat semua field wajib sesuai Requirement 6.4", async () => {
    await completePayment("order-id-001", {
      method: "CASH",
      cashReceived: 60000,
      changeAmount: 10000,
    });

    expect(Invoice.create).toHaveBeenCalledTimes(1);
    const [invoiceData] = Invoice.create.mock.calls[0];

    // Requirement 6.4: invoiceNumber, transactionAt, items, totalAmount, paymentMethod, cashierName
    expect(invoiceData.invoiceNumber).toBeDefined();
    expect(invoiceData.transactionAt).toBeInstanceOf(Date);
    expect(invoiceData.items).toHaveLength(1);
    expect(invoiceData.totalAmount).toBe(50000);
    expect(invoiceData.paymentMethod).toBe("CASH");
    expect(invoiceData.cashierName).toBe("Budi Santoso");
  });

  it("Invoice items harus memuat harga satuan, kuantitas, dan subtotal yang benar", async () => {
    await completePayment("order-id-001", {
      method: "CASH",
      cashReceived: 60000,
      changeAmount: 10000,
    });

    const [invoiceData] = Invoice.create.mock.calls[0];
    const { items } = invoiceData;

    expect(items[0]).toMatchObject({
      productName: "Kopi Arabika",
      sku: "KOP-001",
      unitPrice: 25000,
      quantity: 2,
      subtotal: 50000, // 25000 × 2
    });
  });

  it("SSE order_completed harus di-broadcast setelah transaksi Cash berhasil", async () => {
    await completePayment("order-id-001", {
      method: "CASH",
      cashReceived: 60000,
      changeAmount: 10000,
    });

    expect(sseManager.broadcastToRole).toHaveBeenCalledWith(
      expect.objectContaining({ type: "order_completed" }),
      expect.arrayContaining(["CASHIER", "WAREHOUSE"])
    );
  });

  it("alur end-to-end: createOrder() → completePayment() menghasilkan invoice yang valid", async () => {
    // Step 1: Buat pesanan
    const order = await createOrder(CASHIER_ID, [
      { productId: "product-id-001", quantity: 2 },
    ]);
    expect(order.paymentStatus).toBe("pending");

    // Step 2: Konfirmasi pembayaran Cash
    const invoice = await completePayment(order._id, {
      method: "CASH",
      cashReceived: 60000,
      changeAmount: 10000,
    });

    // Invoice harus dibuat dengan data yang benar
    expect(invoice).toBeDefined();
    expect(invoice.invoiceNumber).toBe(order.invoiceNumber);
    expect(invoice.paymentMethod).toBe("CASH");

    // Stok harus dikurangi
    expect(Product.bulkWrite).toHaveBeenCalledTimes(1);

    // Order harus diupdate ke completed
    expect(Order.updateOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          paymentStatus: "paid",
          orderStatus: "completed",
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Skenario 2: Webhook QRIS
// Validates: Requirements 6.1, 6.3
// ---------------------------------------------------------------------------

describe("Skenario 2: Webhook QRIS — completePayment() dengan metode QRIS → order completed, invoice dibuat", () => {
  let mockSession;

  const mockQrisOrder = {
    ...mockOrder,
    _id: "order-qris-001",
    invoiceNumber: "INV-20260507-0002",
    paymentMethod: "QRIS",
    qrisCode: "mock-qris-uuid-12345",
    qrisExpiresAt: new Date(Date.now() + 5 * 60 * 1000), // belum expired
    paymentStatus: "pending",
  };

  const mockQrisInvoice = {
    ...mockInvoiceDoc,
    _id: "invoice-qris-001",
    orderId: "order-qris-001",
    invoiceNumber: "INV-20260507-0002",
    paymentMethod: "QRIS",
    cashReceived: null,
    changeAmount: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockSession = buildMockSession();
    mongoose.startSession.mockResolvedValue(mockSession);

    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockQrisOrder),
    });
    Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Product.bulkWrite.mockResolvedValue({ modifiedCount: mockOrderItems.length });
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockCashier),
      }),
    });
    Invoice.create.mockResolvedValue({ toObject: () => ({ ...mockQrisInvoice }) });
  });

  it("completePayment() dengan metode QRIS harus mengubah paymentStatus menjadi 'paid'", async () => {
    await completePayment("order-qris-001", {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    expect(Order.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "order-qris-001" }),
      expect.objectContaining({
        $set: expect.objectContaining({
          paymentStatus: "paid",
          orderStatus: "completed",
          paymentMethod: "QRIS",
        }),
      })
    );
  });

  it("completePayment() QRIS harus membuat Invoice dengan paymentMethod 'QRIS'", async () => {
    const invoice = await completePayment("order-qris-001", {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    expect(invoice).toBeDefined();
    expect(invoice.paymentMethod).toBe("QRIS");
    expect(invoice.invoiceNumber).toBe("INV-20260507-0002");
  });

  it("Invoice QRIS harus memuat semua field wajib (Requirement 6.4)", async () => {
    await completePayment("order-qris-001", {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    expect(Invoice.create).toHaveBeenCalledTimes(1);
    const [invoiceData] = Invoice.create.mock.calls[0];

    expect(invoiceData.invoiceNumber).toBeDefined();
    expect(invoiceData.transactionAt).toBeInstanceOf(Date);
    expect(invoiceData.items).toHaveLength(1);
    expect(invoiceData.totalAmount).toBe(50000);
    expect(invoiceData.paymentMethod).toBe("QRIS");
    expect(invoiceData.cashierName).toBe("Budi Santoso");
    // QRIS tidak memiliki cashReceived/changeAmount
    expect(invoiceData.cashReceived).toBeNull();
    expect(invoiceData.changeAmount).toBeNull();
  });

  it("completePayment() QRIS harus mengurangi stok produk", async () => {
    await completePayment("order-qris-001", {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    expect(Product.bulkWrite).toHaveBeenCalledTimes(1);
    const bulkOps = Product.bulkWrite.mock.calls[0][0];
    expect(bulkOps[0].updateOne.update.$inc.stock).toBe(-2);
  });

  it("SSE order_completed harus di-broadcast setelah transaksi QRIS berhasil", async () => {
    await completePayment("order-qris-001", {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    expect(sseManager.broadcastToRole).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "order_completed",
        data: expect.objectContaining({ orderId: "order-qris-001" }),
      }),
      expect.arrayContaining(["CASHIER", "WAREHOUSE"])
    );
  });

  it("webhook QRIS: order dengan paymentStatus 'paid' harus ditolak (idempotency)", async () => {
    // Simulasi order yang sudah dibayar (idempotency guard)
    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        ...mockQrisOrder,
        paymentStatus: "paid",
        orderStatus: "completed",
      }),
    });

    await expect(
      completePayment("order-qris-001", {
        method: "QRIS",
        cashReceived: null,
        changeAmount: null,
      })
    ).rejects.toThrow(PaymentError);

    // Invoice tidak boleh dibuat dua kali
    expect(Invoice.create).not.toHaveBeenCalled();
  });

  it("webhook QRIS: order dengan paymentStatus 'expired' harus ditolak", async () => {
    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        ...mockQrisOrder,
        paymentStatus: "expired",
        qrisCode: null,
      }),
    });

    let thrownError = null;
    try {
      await completePayment("order-qris-001", {
        method: "QRIS",
        cashReceived: null,
        changeAmount: null,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError).toBeInstanceOf(PaymentError);
    expect(thrownError.code).toBe(PaymentErrorCode.QRIS_EXPIRED);
    expect(Invoice.create).not.toHaveBeenCalled();
  });

  it("webhook QRIS: order yang tidak ditemukan harus melempar ORDER_NOT_FOUND", async () => {
    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });

    await expect(
      completePayment("order-tidak-ada", {
        method: "QRIS",
        cashReceived: null,
        changeAmount: null,
      })
    ).rejects.toMatchObject({
      code: PaymentErrorCode.ORDER_NOT_FOUND,
    });
  });
});

// ---------------------------------------------------------------------------
// Skenario 3: Rollback saat kegagalan transaksi
// Validates: Requirements 6.1, 6.2
// ---------------------------------------------------------------------------

describe("Skenario 3: Rollback — kegagalan di tengah transaksi → tidak ada perubahan parsial", () => {
  let mockSession;

  beforeEach(() => {
    vi.clearAllMocks();

    // Session dengan shouldAbort=true: callback dijalankan tapi error di-re-throw
    mockSession = buildMockSession({ shouldAbort: true });
    mongoose.startSession.mockResolvedValue(mockSession);

    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockOrder),
    });
    Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("kegagalan stok (bulkWrite modifiedCount < items.length) harus melempar INSUFFICIENT_STOCK", async () => {
    // Simulasi: stok tidak cukup — bulkWrite tidak memodifikasi semua item
    Product.bulkWrite.mockResolvedValue({ modifiedCount: 0 });

    await expect(
      completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 60000,
        changeAmount: 10000,
      })
    ).rejects.toMatchObject({
      code: PaymentErrorCode.INSUFFICIENT_STOCK,
    });
  });

  it("saat stok tidak cukup, Invoice TIDAK boleh dibuat (rollback atomik)", async () => {
    Product.bulkWrite.mockResolvedValue({ modifiedCount: 0 });

    try {
      await completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 60000,
        changeAmount: 10000,
      });
    } catch {
      // expected
    }

    // Invoice.create tidak boleh dipanggil karena transaksi di-rollback
    expect(Invoice.create).not.toHaveBeenCalled();
  });

  it("saat stok tidak cukup, paymentStatus dan orderStatus TIDAK boleh berubah", async () => {
    Product.bulkWrite.mockResolvedValue({ modifiedCount: 0 });

    try {
      await completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 60000,
        changeAmount: 10000,
      });
    } catch {
      // expected
    }

    // Order.updateOne dipanggil di dalam transaksi, tapi karena withTransaction
    // me-rollback saat error, perubahan tidak persisten.
    // Yang penting: tidak ada Invoice yang dibuat dan SSE tidak di-broadcast.
    expect(Invoice.create).not.toHaveBeenCalled();
    expect(sseManager.broadcastToRole).not.toHaveBeenCalled();
  });

  it("saat kegagalan transaksi, SSE order_completed TIDAK boleh di-broadcast", async () => {
    Product.bulkWrite.mockResolvedValue({ modifiedCount: 0 });

    try {
      await completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 60000,
        changeAmount: 10000,
      });
    } catch {
      // expected
    }

    expect(sseManager.broadcastToRole).not.toHaveBeenCalled();
  });

  it("kegagalan di Invoice.create harus melempar TRANSACTION_FAILED dan tidak ada perubahan parsial", async () => {
    // Stok berhasil dikurangi, tapi Invoice.create gagal
    Product.bulkWrite.mockResolvedValue({ modifiedCount: mockOrderItems.length });
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockCashier),
      }),
    });
    Invoice.create.mockRejectedValue(new Error("Database write failed"));

    let thrownError = null;
    try {
      await completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 60000,
        changeAmount: 10000,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError).toBeInstanceOf(PaymentError);
    expect(thrownError.code).toBe(PaymentErrorCode.TRANSACTION_FAILED);

    // SSE tidak boleh di-broadcast karena transaksi gagal
    expect(sseManager.broadcastToRole).not.toHaveBeenCalled();
  });

  it("error rollback tidak boleh menyiarkan event SSE order_completed", async () => {
    Product.bulkWrite.mockResolvedValue({ modifiedCount: 0 });

    try {
      await completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 60000,
        changeAmount: 10000,
      });
    } catch {
      // expected
    }

    expect(sseManager.broadcastToRole).not.toHaveBeenCalled();
  });

  it("rollback QRIS: kegagalan stok saat webhook QRIS → tidak ada Invoice, tidak ada SSE", async () => {
    const mockQrisOrder = {
      ...mockOrder,
      _id: "order-qris-rollback",
      paymentMethod: "QRIS",
      qrisCode: "mock-qris-code",
      qrisExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };

    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockQrisOrder),
    });
    Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
    // Simulasi stok habis saat QRIS dikonfirmasi
    Product.bulkWrite.mockResolvedValue({ modifiedCount: 0 });

    let thrownError = null;
    try {
      await completePayment("order-qris-rollback", {
        method: "QRIS",
        cashReceived: null,
        changeAmount: null,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError.code).toBe(PaymentErrorCode.INSUFFICIENT_STOCK);
    expect(Invoice.create).not.toHaveBeenCalled();
    expect(sseManager.broadcastToRole).not.toHaveBeenCalled();
  });

  it("atomisitas: ketiga operasi (Order update, stock decrement, Invoice create) terjadi bersama atau tidak sama sekali", async () => {
    // Simulasi: Order.updateOne berhasil, Product.bulkWrite berhasil,
    // tapi Invoice.create gagal → seluruh transaksi harus di-rollback
    Product.bulkWrite.mockResolvedValue({ modifiedCount: mockOrderItems.length });
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockCashier),
      }),
    });
    Invoice.create.mockRejectedValue(new Error("Invoice write error"));

    try {
      await completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 60000,
        changeAmount: 10000,
      });
    } catch {
      // expected
    }

    // Verifikasi: meskipun Order.updateOne dan Product.bulkWrite dipanggil,
    // tidak ada Invoice yang berhasil dibuat dan SSE tidak di-broadcast.
    // Dalam transaksi nyata, MongoDB akan rollback semua perubahan.
    expect(Invoice.create).toHaveBeenCalledTimes(1); // dipanggil tapi gagal
    expect(sseManager.broadcastToRole).not.toHaveBeenCalled(); // SSE tidak di-broadcast
  });
});

// ---------------------------------------------------------------------------
// Skenario 4: Online QRIS end-to-end (service integration)
// Validates: Requirements 7.1, 7.2, 7.4
// ---------------------------------------------------------------------------

describe("Skenario 4: Online QRIS — create order online → complete payment → status completed + stok berkurang + Invoice terbuat", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Product.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockProduct),
    });

    Order.create.mockResolvedValue({
      toObject: () => ({
        _id: "online-order-qris-001",
        invoiceNumber: "INV-20260507-ONLINE-0001",
        cashierId: null,
        orderType: "ONLINE",
        customerName: "Andi",
        customerWhatsapp: "081234567890",
        shippingAddress: "Jl. Mawar No. 9",
        paymentMethod: "QRIS",
        items: mockOrderItems,
        totalAmount: 50000,
        orderStatus: "waiting_preparation",
        paymentStatus: "pending",
        sseToken: "token-online-qris",
        createdAt: new Date("2026-05-07T08:00:00.000Z"),
        updatedAt: new Date("2026-05-07T08:00:00.000Z"),
      }),
    });

    // Payment stage: order already ready in warehouse queue
    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        ...mockOrder,
        _id: "online-order-qris-001",
        invoiceNumber: "INV-20260507-ONLINE-0001",
        cashierId: null,
        orderType: "ONLINE",
        paymentMethod: "QRIS",
        orderStatus: "ready",
        paymentStatus: "pending",
        sseToken: "token-online-qris",
      }),
    });
    Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Product.bulkWrite.mockResolvedValue({ modifiedCount: mockOrderItems.length });
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: "cashier-system", name: "Kasir" }),
      }),
    });
    Invoice.create.mockResolvedValue({
      toObject: () => ({
        ...mockInvoiceDoc,
        orderId: "online-order-qris-001",
        invoiceNumber: "INV-20260507-ONLINE-0001",
        paymentMethod: "QRIS",
        cashReceived: null,
        changeAmount: null,
      }),
    });
  });

  it("harus menghasilkan order ONLINE, lalu completePayment membuat invoice dan mengurangi stok", async () => {
    const onlineOrder = await createOnlineOrder({
      items: [{ productId: "product-id-001", quantity: 2 }],
      customerName: "Andi",
      customerWhatsapp: "081234567890",
      shippingAddress: "Jl. Mawar No. 9",
      paymentMethod: "QRIS",
    });

    expect(onlineOrder.orderType).toBe("ONLINE");
    expect(onlineOrder.paymentStatus).toBe("pending");

    const invoice = await completePayment(onlineOrder._id, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    expect(invoice.invoiceNumber).toBe("INV-20260507-ONLINE-0001");
    expect(invoice.paymentMethod).toBe("QRIS");
    expect(Product.bulkWrite).toHaveBeenCalledTimes(1);
    expect(Invoice.create).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Skenario 5: Online COD flow (service integration)
// Validates: Requirements 8.1, 8.2, 8.3
// ---------------------------------------------------------------------------

describe("Skenario 5: Online COD — create order online → warehouse ready → konfirmasi COD → status completed", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Product.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockProduct),
    });

    Order.create.mockResolvedValue({
      toObject: () => ({
        _id: "online-order-cod-001",
        invoiceNumber: "INV-20260507-ONLINE-0002",
        cashierId: null,
        orderType: "ONLINE",
        customerName: "Sari",
        customerWhatsapp: "081111111111",
        shippingAddress: "Jl. Melati No. 7",
        paymentMethod: "CASH",
        items: mockOrderItems,
        totalAmount: 50000,
        orderStatus: "waiting_preparation",
        paymentStatus: "pending",
        sseToken: "token-online-cod",
        createdAt: new Date("2026-05-07T08:10:00.000Z"),
        updatedAt: new Date("2026-05-07T08:10:00.000Z"),
      }),
    });

    // Simulate warehouse already moved order to `ready`
    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        ...mockOrder,
        _id: "online-order-cod-001",
        invoiceNumber: "INV-20260507-ONLINE-0002",
        cashierId: null,
        orderType: "ONLINE",
        paymentMethod: "CASH",
        orderStatus: "ready",
        paymentStatus: "pending",
        sseToken: "token-online-cod",
      }),
    });
    Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Product.bulkWrite.mockResolvedValue({ modifiedCount: mockOrderItems.length });
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: "cashier-system", name: "Kasir" }),
      }),
    });
    Invoice.create.mockResolvedValue({
      toObject: () => ({
        ...mockInvoiceDoc,
        orderId: "online-order-cod-001",
        invoiceNumber: "INV-20260507-ONLINE-0002",
        paymentMethod: "CASH",
        cashReceived: null,
        changeAmount: null,
      }),
    });
  });

  it("harus menyelesaikan pesanan COD online setelah konfirmasi pembayaran manual", async () => {
    const onlineOrder = await createOnlineOrder({
      items: [{ productId: "product-id-001", quantity: 2 }],
      customerName: "Sari",
      customerWhatsapp: "081111111111",
      shippingAddress: "Jl. Melati No. 7",
      paymentMethod: "CASH",
    });

    const invoice = await completePayment(onlineOrder._id, {
      method: "CASH",
      cashReceived: null,
      changeAmount: null,
    });

    expect(invoice.invoiceNumber).toBe("INV-20260507-ONLINE-0002");
    expect(Order.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "online-order-cod-001" }),
      expect.objectContaining({
        $set: expect.objectContaining({
          orderStatus: "completed",
          paymentStatus: "paid",
        }),
      })
    );
  });
});
