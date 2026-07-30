/**
 * Integration Tests: COD Online Order Flow
 *
 * Validates the end-to-end flow for Cash-on-Delivery (COD) online orders:
 * - Order creation by customer
 * - Warehouse marking order as ready
 * - Warehouse confirming COD payment (completes order, decrements stock)
 *
 * These are unit-level integration tests using mocked DB — not live DB tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sse", () => ({
  default: { broadcastToRole: vi.fn(), broadcastToToken: vi.fn(), broadcastToUser: vi.fn() },
}));
vi.mock("@/lib/whatsapp", () => ({
  notifyOrderConfirmed: vi.fn().mockResolvedValue({ success: true }),
  notifyOrderReady: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/models/Order", () => {
  const mockOrder = { findById: vi.fn(), updateOne: vi.fn(), create: vi.fn() };
  return { default: mockOrder };
});
vi.mock("@/models/Product", () => ({
  default: { bulkWrite: vi.fn() },
}));
vi.mock("@/models/User", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("@/models/Invoice", () => ({
  default: { create: vi.fn() },
}));

import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import Invoice from "@/models/Invoice";
import { completePayment, PaymentError, PaymentErrorCode } from "@/server/services/payment.service";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeOnlineCODOrder(overrides = {}) {
  return {
    _id: "order-cod-001",
    invoiceNumber: "INV-20260730-0001",
    orderType: "ONLINE",
    orderStatus: "ready",
    paymentStatus: "pending",
    paymentMethod: "CASH",
    cashierId: null,
    customerName: "Budi Santoso",
    customerWhatsapp: "081234567890",
    shippingAddress: "Jl. Merdeka No. 1",
    totalAmount: 75_000,
    sseToken: "test-sse-token-001",
    items: [
      { productId: "prod-001", productName: "Kopi Arabika", sku: "KOP-001", unitPrice: 25_000, quantity: 3 },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    ...overrides,
  };
}

function setupMocksForSuccess(order, cashierName = "Kasir") {
  Order.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(order) });
  Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Product.bulkWrite.mockResolvedValue({ modifiedCount: order.items.length });
  User.findById.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(cashierName ? { name: cashierName } : null),
    }),
  });
  const mockInvoice = {
    _id: "invoice-001",
    orderId: order._id,
    invoiceNumber: order.invoiceNumber,
    cashierName: cashierName ?? "Kasir",
    items: order.items.map((i) => ({ ...i, subtotal: i.unitPrice * i.quantity })),
    totalAmount: order.totalAmount,
    paymentMethod: "CASH",
    cashReceived: order.totalAmount,
    changeAmount: 0,
    transactionAt: new Date(),
    createdAt: new Date(),
  };
  Invoice.create.mockResolvedValue({ toObject: () => mockInvoice });
  return mockInvoice;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("COD Online Order: Warehouse Confirmation Flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("completePayment dengan CASH berhasil untuk pesanan COD online yang sudah ready", async () => {
    const order = makeOnlineCODOrder();
    const mockInvoice = setupMocksForSuccess(order);

    const result = await completePayment(order._id, {
      method: "CASH",
      cashReceived: order.totalAmount,
      changeAmount: 0,
    });

    // Harus return invoice
    expect(result).toBeDefined();
    expect(result.invoiceNumber).toBe(order.invoiceNumber);

    // Order harus di-update ke paid + completed
    expect(Order.updateOne).toHaveBeenCalledTimes(1);
    const [, update] = Order.updateOne.mock.calls[0];
    expect(update.$set.paymentStatus).toBe("paid");
    expect(update.$set.orderStatus).toBe("completed");
    expect(update.$set.paymentMethod).toBe("CASH");

    // Stok harus berkurang
    expect(Product.bulkWrite).toHaveBeenCalledTimes(1);
    const [bulkOps] = Product.bulkWrite.mock.calls[0];
    expect(bulkOps[0].updateOne.update.$inc.stock).toBe(-3);

    // Invoice harus dibuat
    expect(Invoice.create).toHaveBeenCalledTimes(1);
    const invoiceArg = Invoice.create.mock.calls[0][0];
    expect(invoiceArg.paymentMethod).toBe("CASH");
    expect(invoiceArg.cashReceived).toBe(order.totalAmount);
    expect(invoiceArg.totalAmount).toBe(order.totalAmount);
  });

  it("completePayment gagal jika pesanan belum berstatus ready", async () => {
    const order = makeOnlineCODOrder({ orderStatus: "waiting_preparation" });

    Order.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(order) });

    let error;
    try {
      await completePayment(order._id, { method: "CASH", cashReceived: order.totalAmount, changeAmount: 0 });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(PaymentError);
    expect(error.code).toBe(PaymentErrorCode.ORDER_NOT_READY);
    expect(Order.updateOne).not.toHaveBeenCalled();
    expect(Invoice.create).not.toHaveBeenCalled();
  });

  it("completePayment gagal jika pesanan sudah dibayar (ALREADY_PAID)", async () => {
    const order = makeOnlineCODOrder({ paymentStatus: "paid" });

    Order.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(order) });

    let error;
    try {
      await completePayment(order._id, { method: "CASH", cashReceived: order.totalAmount, changeAmount: 0 });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(PaymentError);
    expect(error.code).toBe(PaymentErrorCode.ALREADY_PAID);
    expect(Order.updateOne).not.toHaveBeenCalled();
  });

  it("completePayment gagal jika pesanan tidak ditemukan (ORDER_NOT_FOUND)", async () => {
    Order.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    let error;
    try {
      await completePayment("nonexistent-id", { method: "CASH", cashReceived: 50_000, changeAmount: 0 });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(PaymentError);
    expect(error.code).toBe(PaymentErrorCode.ORDER_NOT_FOUND);
    expect(Order.updateOne).not.toHaveBeenCalled();
  });

  it("invoice mencatat cashReceived dan changeAmount dengan benar", async () => {
    const order = makeOnlineCODOrder({ totalAmount: 50_000 });
    setupMocksForSuccess(order);

    await completePayment(order._id, {
      method: "CASH",
      cashReceived: 100_000,
      changeAmount: 50_000,
    });

    const invoiceArg = Invoice.create.mock.calls[0][0];
    expect(invoiceArg.cashReceived).toBe(100_000);
    expect(invoiceArg.changeAmount).toBe(50_000);
  });

  it("rollback dilakukan jika stok tidak cukup setelah order di-update", async () => {
    const order = makeOnlineCODOrder();

    Order.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(order) });
    Order.updateOne
      .mockResolvedValueOnce({ modifiedCount: 1 })  // step 1 OK
      .mockResolvedValueOnce({ modifiedCount: 1 });  // rollback OK
    Product.bulkWrite.mockResolvedValue({ modifiedCount: 0 }); // insufficient stock

    let error;
    try {
      await completePayment(order._id, { method: "CASH", cashReceived: order.totalAmount, changeAmount: 0 });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(PaymentError);
    expect(error.code).toBe(PaymentErrorCode.INSUFFICIENT_STOCK);

    // Order.updateOne dipanggil 2x: step 1 + rollback
    expect(Order.updateOne).toHaveBeenCalledTimes(2);

    // Rollback call harus mengembalikan ke status semula
    const rollbackCall = Order.updateOne.mock.calls[1];
    expect(rollbackCall[1].$set.paymentStatus).toBe("pending");

    // Invoice tidak boleh dibuat
    expect(Invoice.create).not.toHaveBeenCalled();
  });
});
