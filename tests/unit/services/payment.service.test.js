/**
 * Unit Tests: PaymentService
 *
 * Validates: Requirements 5.2, 5.5, 6.1, 6.2
 *
 * Tests:
 *   1. completePayment CASH — semua tiga operasi berhasil, invoice dibuat
 *   2. completePayment — stok tidak cukup di tengah proses → rollback, status tidak berubah
 *   3. completePayment — order sudah `paid` → ditolak
 *   4. QRIS expiry — pesanan dengan qrisExpiresAt lampau → status `expired`
 *
 * NOTE: completePayment menggunakan idempotency-lock via findOneAndUpdate
 * (bukan MongoDB multi-document transaction). Mock harus mencerminkan pola ini.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — harus dideklarasikan sebelum import service
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

vi.mock("@/lib/whatsapp", () => ({
  notifyOrderConfirmed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/services/product.service", () => ({
  recordStockOutMovements: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/Order", () => {
  const mockOrder = {
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
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
// Imports setelah mocks
// ---------------------------------------------------------------------------

import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import Invoice from "@/models/Invoice";
import sseManager from "@/lib/sse";
import {
  completePayment,
  expireQRISOrders,
  PaymentError,
  PaymentErrorCode,
} from "@/server/services/payment.service";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockCashier = {
  _id: "cashier-id-001",
  name: "Budi Santoso",
};

const mockOrderItems = [
  {
    productId: "product-id-001",
    productName: "Kopi Arabika",
    sku: "KOP-001",
    unitPrice: 25000,
    quantity: 2,
  },
  {
    productId: "product-id-002",
    productName: "Teh Hijau",
    sku: "TEH-001",
    unitPrice: 15000,
    quantity: 1,
  },
];

const mockOrder = {
  _id: "order-id-001",
  invoiceNumber: "INV-20260507-0001",
  cashierId: "cashier-id-001",
  items: mockOrderItems,
  totalAmount: 65000, // 25000×2 + 15000×1
  orderStatus: "ready",
  paymentStatus: "pending",
  orderType: "DINE_IN",
  createdAt: new Date("2026-05-07"),
  updatedAt: new Date("2026-05-07"),
};

const mockInvoiceDoc = {
  _id: "invoice-id-001",
  orderId: "order-id-001",
  invoiceNumber: "INV-20260507-0001",
  cashierName: "Budi Santoso",
  items: mockOrderItems.map((item) => ({
    ...item,
    discountPercent: 0,
    discountAmount: 0,
    subtotal: item.unitPrice * item.quantity,
  })),
  totalAmount: 65000,
  discountTotal: 0,
  paymentMethod: "CASH",
  cashReceived: 70000,
  changeAmount: 5000,
  transactionAt: new Date(),
};

// ---------------------------------------------------------------------------
// Helper: setup mock untuk success path
// Idempotency lock: findOneAndUpdate mengembalikan dokumen LAMA (sebelum diupdate)
// ---------------------------------------------------------------------------

function setupSuccessMocks() {
  // Step 0: idempotency lock — findOneAndUpdate().lean() mengembalikan dokumen order lama
  Order.findOneAndUpdate.mockReturnValue({
    lean: vi.fn().mockResolvedValue(mockOrder),
  });

  // Step 1: stock decrement berhasil (modifiedCount === items.length)
  Product.bulkWrite.mockResolvedValue({ modifiedCount: mockOrderItems.length });

  // Step 2: cashier lookup untuk invoice
  User.findById.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockCashier),
    }),
  });

  // Step 2: invoice creation
  Invoice.create.mockResolvedValue({ toObject: () => ({ ...mockInvoiceDoc }) });

  // Step 3: finalize order
  Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
}

// ---------------------------------------------------------------------------
// completePayment — CASH success path
// Validates: Requirements 6.1, 5.2
// ---------------------------------------------------------------------------

describe("PaymentService — completePayment CASH (sukses)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessMocks();
  });

  it("harus mengembalikan invoice yang dibuat", async () => {
    const result = await completePayment("order-id-001", {
      method: "CASH",
      cashReceived: 70000,
      changeAmount: 5000,
    });

    expect(result).toBeDefined();
    expect(result.invoiceNumber).toBe("INV-20260507-0001");
    expect(result.paymentMethod).toBe("CASH");
  });

  it("harus memanggil Order.updateOne dengan paymentStatus: paid dan orderStatus: completed", async () => {
    await completePayment("order-id-001", {
      method: "CASH",
      cashReceived: 70000,
      changeAmount: 5000,
    });

    expect(Order.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "order-id-001" }),
      expect.objectContaining({
        $set: expect.objectContaining({
          paymentStatus: "paid",
          orderStatus: "completed",
          paymentMethod: "CASH",
          cashReceived: 70000,
          changeAmount: 5000,
        }),
      })
    );
  });

  it("harus memanggil Product.bulkWrite untuk mengurangi stok setiap item", async () => {
    await completePayment("order-id-001", {
      method: "CASH",
      cashReceived: 70000,
      changeAmount: 5000,
    });

    expect(Product.bulkWrite).toHaveBeenCalledTimes(1);

    const bulkOps = Product.bulkWrite.mock.calls[0][0];
    expect(bulkOps).toHaveLength(mockOrderItems.length);

    // Setiap operasi harus mengurangi stok sebesar quantity yang dipesan
    bulkOps.forEach((op, idx) => {
      expect(op.updateOne.filter._id).toBe(mockOrderItems[idx].productId);
      expect(op.updateOne.update.$inc.stock).toBe(-mockOrderItems[idx].quantity);
      // Filter harus melindungi dari stok negatif
      expect(op.updateOne.filter.stock.$gte).toBe(mockOrderItems[idx].quantity);
    });
  });

  it("harus membuat Invoice dengan snapshot data yang benar", async () => {
    await completePayment("order-id-001", {
      method: "CASH",
      cashReceived: 70000,
      changeAmount: 5000,
    });

    expect(Invoice.create).toHaveBeenCalledTimes(1);

    const invoiceData = Invoice.create.mock.calls[0][0];

    expect(invoiceData.orderId).toBe(mockOrder._id);
    expect(invoiceData.invoiceNumber).toBe(mockOrder.invoiceNumber);
    expect(invoiceData.cashierName).toBe(mockCashier.name);
    expect(invoiceData.totalAmount).toBe(mockOrder.totalAmount);
    expect(invoiceData.paymentMethod).toBe("CASH");
    expect(invoiceData.cashReceived).toBe(70000);
    expect(invoiceData.changeAmount).toBe(5000);
  });

  it("invoice items harus menyertakan subtotal yang benar (unitPrice × quantity)", async () => {
    await completePayment("order-id-001", {
      method: "CASH",
      cashReceived: 70000,
      changeAmount: 5000,
    });

    const invoiceData = Invoice.create.mock.calls[0][0];
    const { items } = invoiceData;

    expect(items).toHaveLength(mockOrderItems.length);
    items.forEach((item, idx) => {
      const expected = mockOrderItems[idx];
      expect(item.productName).toBe(expected.productName);
      expect(item.sku).toBe(expected.sku);
      expect(item.unitPrice).toBe(expected.unitPrice);
      expect(item.quantity).toBe(expected.quantity);
      expect(item.subtotal).toBe(expected.unitPrice * expected.quantity);
    });
  });

  it("harus memanggil SSE broadcastToRole setelah transaksi berhasil", async () => {
    await completePayment("order-id-001", {
      method: "CASH",
      cashReceived: 70000,
      changeAmount: 5000,
    });

    expect(sseManager.broadcastToRole).toHaveBeenCalledWith(
      expect.objectContaining({ type: "order_completed" }),
      expect.arrayContaining(["CASHIER", "WAREHOUSE"])
    );
  });
});

// ---------------------------------------------------------------------------
// completePayment — stok tidak cukup → rollback via releaseLock
// Validates: Requirements 6.1, 6.2
// ---------------------------------------------------------------------------

describe("PaymentService — completePayment stok tidak cukup (rollback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Step 0: idempotency lock berhasil — mendapat snapshot order lama
    Order.findOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockOrder),
    });

    // Step 1: bulkWrite gagal — hanya 0 dari 2 item berhasil diperbarui
    Product.bulkWrite.mockResolvedValue({ modifiedCount: 0 });

    // releaseLock: Order.updateOne akan dipanggil untuk mengembalikan status ke "pending"
    Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("harus melempar PaymentError dengan code INSUFFICIENT_STOCK", async () => {
    let thrownError = null;
    try {
      await completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 70000,
        changeAmount: 5000,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError).toBeInstanceOf(PaymentError);
    expect(thrownError.code).toBe(PaymentErrorCode.INSUFFICIENT_STOCK);
  });

  it("TIDAK boleh membuat Invoice ketika stok tidak cukup", async () => {
    try {
      await completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 70000,
        changeAmount: 5000,
      });
    } catch {
      // expected
    }

    expect(Invoice.create).not.toHaveBeenCalled();
  });

  it("TIDAK boleh memanggil SSE broadcast ketika transaksi gagal", async () => {
    try {
      await completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 70000,
        changeAmount: 5000,
      });
    } catch {
      // expected
    }

    expect(sseManager.broadcastToRole).not.toHaveBeenCalled();
  });

  it("harus memanggil releaseLock (Order.updateOne) untuk mengembalikan paymentStatus ke pending", async () => {
    try {
      await completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 70000,
        changeAmount: 5000,
      });
    } catch {
      // expected
    }

    // releaseLock memanggil Order.updateOne dengan paymentStatus: "pending"
    expect(Order.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "order-id-001" }),
      expect.objectContaining({
        $set: expect.objectContaining({ paymentStatus: "pending" }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// completePayment — order sudah paid → idempotency guard menolak
// Validates: Requirement 6.1 (idempotency guard)
// ---------------------------------------------------------------------------

describe("PaymentService — completePayment order sudah paid", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Step 0: findOneAndUpdate().lean() mengembalikan null (order tidak lagi "pending")
    Order.findOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });

    // Fallback lookup: service memanggil findById().select().lean()
    Order.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: "order-id-001",
          paymentStatus: "paid",
        }),
      }),
    });
  });

  it("harus melempar PaymentError dengan code ALREADY_PAID", async () => {
    let thrownError = null;
    try {
      await completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 70000,
        changeAmount: 5000,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError).toBeInstanceOf(PaymentError);
    expect(thrownError.code).toBe(PaymentErrorCode.ALREADY_PAID);
  });

  it("TIDAK boleh memanggil Product.bulkWrite ketika order sudah paid", async () => {
    try {
      await completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 70000,
        changeAmount: 5000,
      });
    } catch {
      // expected
    }

    expect(Product.bulkWrite).not.toHaveBeenCalled();
  });

  it("TIDAK boleh membuat Invoice ketika order sudah paid", async () => {
    try {
      await completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 70000,
        changeAmount: 5000,
      });
    } catch {
      // expected
    }

    expect(Invoice.create).not.toHaveBeenCalled();
  });

  it("TIDAK boleh memanggil SSE broadcast ketika order sudah paid", async () => {
    try {
      await completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 70000,
        changeAmount: 5000,
      });
    } catch {
      // expected
    }

    expect(sseManager.broadcastToRole).not.toHaveBeenCalled();
  });

  it("TIDAK boleh memanggil Order.updateOne (step 3) ketika order sudah paid", async () => {
    try {
      await completePayment("order-id-001", {
        method: "CASH",
        cashReceived: 70000,
        changeAmount: 5000,
      });
    } catch {
      // expected
    }

    expect(Order.updateOne).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// QRIS expiry — pesanan dengan qrisExpiresAt lampau → status expired
// Validates: Requirement 5.5
// ---------------------------------------------------------------------------

describe("PaymentService — expireQRISOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("harus mengembalikan jumlah pesanan yang diubah menjadi expired", async () => {
    Order.updateMany.mockResolvedValue({ modifiedCount: 3 });

    const result = await expireQRISOrders();

    expect(result).toBe(3);
  });

  it("harus memanggil Order.updateMany dengan query paymentStatus: pending", async () => {
    Order.updateMany.mockResolvedValue({ modifiedCount: 0 });

    await expireQRISOrders();

    expect(Order.updateMany).toHaveBeenCalledTimes(1);
    const [query] = Order.updateMany.mock.calls[0];
    expect(query.paymentStatus).toBe("pending");
  });

  it("harus memfilter berdasarkan qrisExpiresAt < sekarang", async () => {
    Order.updateMany.mockResolvedValue({ modifiedCount: 0 });

    const before = Date.now();
    await expireQRISOrders();
    const after = Date.now();

    const [query] = Order.updateMany.mock.calls[0];
    expect(query.qrisExpiresAt).toBeDefined();
    expect(query.qrisExpiresAt.$lt).toBeInstanceOf(Date);

    // Cutoff timestamp harus berada dalam jendela eksekusi test
    const cutoff = query.qrisExpiresAt.$lt.getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before);
    expect(cutoff).toBeLessThanOrEqual(after);
  });

  it("harus memfilter hanya pesanan yang memiliki qrisCode (bukan null)", async () => {
    Order.updateMany.mockResolvedValue({ modifiedCount: 0 });

    await expireQRISOrders();

    const [query] = Order.updateMany.mock.calls[0];
    expect(query.qrisCode).toBeDefined();
    expect(query.qrisCode.$ne).toBeNull();
  });

  it("harus mengubah paymentStatus menjadi expired dan menghapus qrisCode", async () => {
    Order.updateMany.mockResolvedValue({ modifiedCount: 2 });

    await expireQRISOrders();

    const [, update] = Order.updateMany.mock.calls[0];
    expect(update.$set.paymentStatus).toBe("expired");
    expect(update.$set.qrisCode).toBeNull();
  });

  it("harus mengembalikan 0 ketika tidak ada pesanan yang kedaluwarsa", async () => {
    Order.updateMany.mockResolvedValue({ modifiedCount: 0 });

    const result = await expireQRISOrders();

    expect(result).toBe(0);
    expect(typeof result).toBe("number");
  });

  it("pesanan dengan paymentStatus bukan pending TIDAK boleh diubah oleh job", async () => {
    Order.updateMany.mockResolvedValue({ modifiedCount: 0 });

    await expireQRISOrders();

    // Verifikasi query hanya menargetkan "pending" — bukan "paid" atau "expired"
    const [query] = Order.updateMany.mock.calls[0];
    expect(query.paymentStatus).toBe("pending");
    expect(query.paymentStatus).not.toBe("paid");
    expect(query.paymentStatus).not.toBe("expired");
  });
});
