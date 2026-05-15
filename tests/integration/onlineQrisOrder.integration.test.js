/**
 * Integration Tests: Alur Lengkap Pesanan QRIS Online
 *
 * Validates: Requirements 7.1, 7.2, 7.4
 *
 * Skenario yang diuji:
 *  1. Buat pesanan QRIS online → verifikasi state awal (orderType ONLINE, status waiting_preparation, paymentStatus pending)
 *  2. Setelah webhook diterima → verifikasi Order.updateOne dipanggil dengan status completed + paid
 *  3. Verifikasi Product.bulkWrite dipanggil dengan pengurangan stok yang benar
 *  4. Verifikasi Invoice.create dipanggil dengan data pesanan yang lengkap
 *  5. Alur end-to-end lengkap dalam satu test
 *
 * Pendekatan: Semua test menggunakan mock untuk DB/models dan menguji service layer
 * secara langsung (bukan HTTP end-to-end). Ini memvalidasi kontrak integrasi antara
 * createOnlineOrder() dan completePayment() sesuai alur bisnis nyata.
 *
 * Catatan alur bisnis:
 *  - createOnlineOrder() → orderStatus: "waiting_preparation", paymentStatus: "pending"
 *  - Warehouse tandai siap → orderStatus: "ready" (disimulasikan via mock)
 *  - completePayment() (webhook QRIS) → orderStatus: "completed", paymentStatus: "paid"
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
    broadcastToToken: vi.fn(),
  },
}));

vi.mock("@/lib/invoice", () => ({
  generateInvoiceNumber: vi.fn().mockResolvedValue("INV-20260507-0010"),
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
  PaymentError,
  PaymentErrorCode,
} from "@/server/services/payment.service";
import { createOnlineOrder } from "@/server/services/order.service";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ONLINE_ORDER_ID = "online-order-qris-001";
const INVOICE_NUMBER = "INV-20260507-0010";

const mockProductA = {
  _id: "product-id-001",
  name: "Kopi Arabika",
  sku: "KOP-001",
  price: 25000,
  stock: 10,
  isActive: true,
};

const mockProductB = {
  _id: "product-id-002",
  name: "Teh Hijau",
  sku: "TEH-001",
  price: 15000,
  stock: 5,
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
  {
    productId: "product-id-002",
    productName: "Teh Hijau",
    sku: "TEH-001",
    unitPrice: 15000,
    quantity: 1,
  },
];

// Total: (25000 × 2) + (15000 × 1) = 65000
const TOTAL_AMOUNT = 65000;

const mockCustomer = {
  customerName: "Andi Pratama",
  customerWhatsapp: "081234567890",
  shippingAddress: "Jl. Mawar No. 9, Jakarta Selatan",
};

/**
 * Mock Order yang dikembalikan oleh Order.create (state awal setelah createOnlineOrder).
 * orderStatus: "waiting_preparation" — belum siap, menunggu warehouse
 */
const mockCreatedOnlineOrder = {
  _id: ONLINE_ORDER_ID,
  invoiceNumber: INVOICE_NUMBER,
  cashierId: null,
  orderType: "ONLINE",
  customerName: mockCustomer.customerName,
  customerWhatsapp: mockCustomer.customerWhatsapp,
  shippingAddress: mockCustomer.shippingAddress,
  paymentMethod: "QRIS",
  items: mockOrderItems,
  totalAmount: TOTAL_AMOUNT,
  orderStatus: "waiting_preparation",
  paymentStatus: "pending",
  sseToken: "sse-token-qris-test-001",
  qrisCode: null,
  qrisExpiresAt: null,
  createdAt: new Date("2026-05-07T09:00:00.000Z"),
  updatedAt: new Date("2026-05-07T09:00:00.000Z"),
  completedAt: null,
};

/**
 * Mock Order dalam state "ready" — setelah warehouse tandai siap.
 * Ini adalah state yang diperlukan oleh completePayment().
 */
const mockReadyOnlineOrder = {
  ...mockCreatedOnlineOrder,
  orderStatus: "ready",
  updatedAt: new Date("2026-05-07T09:05:00.000Z"),
};

/**
 * Mock Invoice yang dibuat setelah completePayment() berhasil.
 */
const mockCreatedInvoice = {
  _id: "invoice-online-qris-001",
  orderId: ONLINE_ORDER_ID,
  invoiceNumber: INVOICE_NUMBER,
  cashierName: "Kasir",
  items: mockOrderItems.map((item) => ({
    ...item,
    subtotal: item.unitPrice * item.quantity,
  })),
  totalAmount: TOTAL_AMOUNT,
  paymentMethod: "QRIS",
  cashReceived: null,
  changeAmount: null,
  transactionAt: new Date("2026-05-07T09:10:00.000Z"),
  createdAt: new Date("2026-05-07T09:10:00.000Z"),
};

// ---------------------------------------------------------------------------
// Test 1: Buat pesanan QRIS online → verifikasi state awal
// Validates: Requirements 7.1
// ---------------------------------------------------------------------------

describe("Test 1: createOnlineOrder() — verifikasi state awal pesanan QRIS online", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Product.findById untuk setiap produk dalam cart
    Product.findById
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(mockProductA) })
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(mockProductB) });

    Order.create.mockResolvedValue({
      toObject: () => ({ ...mockCreatedOnlineOrder }),
    });
  });

  it("harus membuat pesanan dengan orderType ONLINE (Req 7.1)", async () => {
    const order = await createOnlineOrder({
      items: [
        { productId: "product-id-001", quantity: 2 },
        { productId: "product-id-002", quantity: 1 },
      ],
      ...mockCustomer,
      paymentMethod: "QRIS",
    });

    expect(order.orderType).toBe("ONLINE");
  });

  it("harus membuat pesanan dengan cashierId null (Req 7.1)", async () => {
    const order = await createOnlineOrder({
      items: [
        { productId: "product-id-001", quantity: 2 },
        { productId: "product-id-002", quantity: 1 },
      ],
      ...mockCustomer,
      paymentMethod: "QRIS",
    });

    expect(order.cashierId).toBeNull();
  });

  it("harus membuat pesanan dengan orderStatus 'waiting_preparation' (Req 7.1)", async () => {
    const order = await createOnlineOrder({
      items: [
        { productId: "product-id-001", quantity: 2 },
        { productId: "product-id-002", quantity: 1 },
      ],
      ...mockCustomer,
      paymentMethod: "QRIS",
    });

    expect(order.orderStatus).toBe("waiting_preparation");
  });

  it("harus membuat pesanan dengan paymentStatus 'pending' (Req 7.1)", async () => {
    const order = await createOnlineOrder({
      items: [
        { productId: "product-id-001", quantity: 2 },
        { productId: "product-id-002", quantity: 1 },
      ],
      ...mockCustomer,
      paymentMethod: "QRIS",
    });

    expect(order.paymentStatus).toBe("pending");
  });

  it("harus menyimpan data pelanggan pada pesanan", async () => {
    const order = await createOnlineOrder({
      items: [
        { productId: "product-id-001", quantity: 2 },
        { productId: "product-id-002", quantity: 1 },
      ],
      ...mockCustomer,
      paymentMethod: "QRIS",
    });

    expect(order.customerName).toBe(mockCustomer.customerName);
    expect(order.customerWhatsapp).toBe(mockCustomer.customerWhatsapp);
    expect(order.shippingAddress).toBe(mockCustomer.shippingAddress);
  });

  it("harus menghasilkan invoiceNumber yang valid", async () => {
    const order = await createOnlineOrder({
      items: [
        { productId: "product-id-001", quantity: 2 },
        { productId: "product-id-002", quantity: 1 },
      ],
      ...mockCustomer,
      paymentMethod: "QRIS",
    });

    expect(order.invoiceNumber).toBe(INVOICE_NUMBER);
  });

  it("harus menghasilkan sseToken untuk koneksi real-time pelanggan", async () => {
    const order = await createOnlineOrder({
      items: [
        { productId: "product-id-001", quantity: 2 },
        { productId: "product-id-002", quantity: 1 },
      ],
      ...mockCustomer,
      paymentMethod: "QRIS",
    });

    expect(order.sseToken).toBeDefined();
    expect(typeof order.sseToken).toBe("string");
    expect(order.sseToken.length).toBeGreaterThan(0);
  });

  it("TIDAK boleh mengurangi stok saat pesanan dibuat (Req 7.1)", async () => {
    await createOnlineOrder({
      items: [
        { productId: "product-id-001", quantity: 2 },
        { productId: "product-id-002", quantity: 1 },
      ],
      ...mockCustomer,
      paymentMethod: "QRIS",
    });

    // Stok hanya dikurangi saat webhook diterima, bukan saat pembuatan pesanan
    expect(Product.bulkWrite).not.toHaveBeenCalled();
  });

  it("harus broadcast SSE new_order ke WAREHOUSE setelah pesanan dibuat", async () => {
    await createOnlineOrder({
      items: [
        { productId: "product-id-001", quantity: 2 },
        { productId: "product-id-002", quantity: 1 },
      ],
      ...mockCustomer,
      paymentMethod: "QRIS",
    });

    expect(sseManager.broadcastToRole).toHaveBeenCalledWith(
      expect.objectContaining({ type: "new_order" }),
      expect.arrayContaining(["WAREHOUSE"])
    );
  });
});

// ---------------------------------------------------------------------------
// Test 2: Webhook diterima → verifikasi Order diupdate ke completed + paid
// Validates: Requirements 7.1, 7.2
// ---------------------------------------------------------------------------

describe("Test 2: completePayment() via webhook QRIS — verifikasi status completed + paid", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Order sudah dalam state "ready" (warehouse sudah tandai siap)
    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockReadyOnlineOrder),
    });
    Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Product.bulkWrite.mockResolvedValue({ modifiedCount: mockOrderItems.length });
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null), // cashierId null untuk online order
      }),
    });
    Invoice.create.mockResolvedValue({
      toObject: () => ({ ...mockCreatedInvoice }),
    });
  });

  it("harus mengubah paymentStatus menjadi 'paid' setelah webhook QRIS (Req 7.2)", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    expect(Order.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: ONLINE_ORDER_ID }),
      expect.objectContaining({
        $set: expect.objectContaining({
          paymentStatus: "paid",
        }),
      })
    );
  });

  it("harus mengubah orderStatus menjadi 'completed' setelah webhook QRIS (Req 7.2)", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    expect(Order.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: ONLINE_ORDER_ID }),
      expect.objectContaining({
        $set: expect.objectContaining({
          orderStatus: "completed",
        }),
      })
    );
  });

  it("harus menyimpan paymentMethod 'QRIS' pada Order setelah webhook", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    expect(Order.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: ONLINE_ORDER_ID }),
      expect.objectContaining({
        $set: expect.objectContaining({
          paymentMethod: "QRIS",
        }),
      })
    );
  });

  it("harus menyimpan completedAt pada Order setelah webhook", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    const updateCall = Order.updateOne.mock.calls[0];
    expect(updateCall[1].$set.completedAt).toBeInstanceOf(Date);
  });

  it("webhook QRIS idempoten: order yang sudah 'paid' harus melempar ALREADY_PAID (Req 7.4)", async () => {
    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        ...mockReadyOnlineOrder,
        paymentStatus: "paid",
        orderStatus: "completed",
      }),
    });

    await expect(
      completePayment(ONLINE_ORDER_ID, {
        method: "QRIS",
        cashReceived: null,
        changeAmount: null,
      })
    ).rejects.toMatchObject({
      code: PaymentErrorCode.ALREADY_PAID,
    });

    // Invoice tidak boleh dibuat dua kali
    expect(Invoice.create).not.toHaveBeenCalled();
  });

  it("webhook QRIS: order dengan paymentStatus 'expired' harus ditolak (Req 7.4)", async () => {
    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        ...mockReadyOnlineOrder,
        paymentStatus: "expired",
      }),
    });

    await expect(
      completePayment(ONLINE_ORDER_ID, {
        method: "QRIS",
        cashReceived: null,
        changeAmount: null,
      })
    ).rejects.toMatchObject({
      code: PaymentErrorCode.QRIS_EXPIRED,
    });

    expect(Invoice.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 3: Verifikasi stok berkurang setelah webhook QRIS
// Validates: Requirements 7.2
// ---------------------------------------------------------------------------

describe("Test 3: completePayment() — verifikasi stok berkurang sesuai kuantitas yang dipesan", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockReadyOnlineOrder),
    });
    Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Product.bulkWrite.mockResolvedValue({ modifiedCount: mockOrderItems.length });
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    });
    Invoice.create.mockResolvedValue({
      toObject: () => ({ ...mockCreatedInvoice }),
    });
  });

  it("harus memanggil Product.bulkWrite untuk mengurangi stok (Req 7.2)", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    expect(Product.bulkWrite).toHaveBeenCalledTimes(1);
  });

  it("harus mengurangi stok Kopi Arabika sebesar 2 (quantity yang dipesan)", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    const bulkOps = Product.bulkWrite.mock.calls[0][0];
    const kopiOp = bulkOps.find(
      (op) => op.updateOne.filter._id.toString() === "product-id-001"
    );

    expect(kopiOp).toBeDefined();
    expect(kopiOp.updateOne.update.$inc.stock).toBe(-2);
  });

  it("harus mengurangi stok Teh Hijau sebesar 1 (quantity yang dipesan)", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    const bulkOps = Product.bulkWrite.mock.calls[0][0];
    const tehOp = bulkOps.find(
      (op) => op.updateOne.filter._id.toString() === "product-id-002"
    );

    expect(tehOp).toBeDefined();
    expect(tehOp.updateOne.update.$inc.stock).toBe(-1);
  });

  it("operasi bulkWrite harus memiliki guard stok tidak negatif ($gte: quantity)", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    const bulkOps = Product.bulkWrite.mock.calls[0][0];

    // Setiap operasi harus memiliki filter stock.$gte untuk mencegah stok negatif
    for (const op of bulkOps) {
      expect(op.updateOne.filter.stock).toBeDefined();
      expect(op.updateOne.filter.stock.$gte).toBeGreaterThan(0);
    }
  });

  it("jumlah operasi bulkWrite harus sama dengan jumlah item pesanan", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    const bulkOps = Product.bulkWrite.mock.calls[0][0];
    expect(bulkOps).toHaveLength(mockOrderItems.length); // 2 items
  });

  it("stok TIDAK boleh dikurangi jika stok tidak mencukupi (bulkWrite modifiedCount < items.length)", async () => {
    // Simulasi: stok tidak cukup untuk salah satu produk
    Product.bulkWrite.mockResolvedValue({ modifiedCount: 1 }); // hanya 1 dari 2 yang berhasil

    await expect(
      completePayment(ONLINE_ORDER_ID, {
        method: "QRIS",
        cashReceived: null,
        changeAmount: null,
      })
    ).rejects.toMatchObject({
      code: PaymentErrorCode.INSUFFICIENT_STOCK,
    });

    // Invoice tidak boleh dibuat jika stok tidak cukup
    expect(Invoice.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 4: Verifikasi Invoice terbuat setelah webhook QRIS
// Validates: Requirements 7.2, 7.4
// ---------------------------------------------------------------------------

describe("Test 4: completePayment() — verifikasi Invoice terbuat dengan data lengkap", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockReadyOnlineOrder),
    });
    Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Product.bulkWrite.mockResolvedValue({ modifiedCount: mockOrderItems.length });
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null), // online order: cashierId null
      }),
    });
    Invoice.create.mockResolvedValue({
      toObject: () => ({ ...mockCreatedInvoice }),
    });
  });

  it("harus memanggil Invoice.create tepat satu kali (Req 7.2)", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    expect(Invoice.create).toHaveBeenCalledTimes(1);
  });

  it("Invoice harus memuat invoiceNumber yang benar (Req 7.4)", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    const [invoiceData] = Invoice.create.mock.calls[0];
    expect(invoiceData.invoiceNumber).toBe(INVOICE_NUMBER);
  });

  it("Invoice harus memuat orderId yang benar (Req 7.4)", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    const [invoiceData] = Invoice.create.mock.calls[0];
    expect(invoiceData.orderId.toString()).toBe(ONLINE_ORDER_ID);
  });

  it("Invoice harus memuat paymentMethod 'QRIS' (Req 7.4)", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    const [invoiceData] = Invoice.create.mock.calls[0];
    expect(invoiceData.paymentMethod).toBe("QRIS");
  });

  it("Invoice harus memuat totalAmount yang benar (Req 7.4)", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    const [invoiceData] = Invoice.create.mock.calls[0];
    expect(invoiceData.totalAmount).toBe(TOTAL_AMOUNT); // 65000
  });

  it("Invoice harus memuat transactionAt sebagai Date (Req 7.4)", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    const [invoiceData] = Invoice.create.mock.calls[0];
    expect(invoiceData.transactionAt).toBeInstanceOf(Date);
  });

  it("Invoice harus memuat semua item pesanan dengan subtotal yang benar (Req 7.4)", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    const [invoiceData] = Invoice.create.mock.calls[0];
    expect(invoiceData.items).toHaveLength(2);

    // Kopi Arabika: 25000 × 2 = 50000
    const kopiItem = invoiceData.items.find((i) => i.sku === "KOP-001");
    expect(kopiItem).toBeDefined();
    expect(kopiItem.unitPrice).toBe(25000);
    expect(kopiItem.quantity).toBe(2);
    expect(kopiItem.subtotal).toBe(50000);

    // Teh Hijau: 15000 × 1 = 15000
    const tehItem = invoiceData.items.find((i) => i.sku === "TEH-001");
    expect(tehItem).toBeDefined();
    expect(tehItem.unitPrice).toBe(15000);
    expect(tehItem.quantity).toBe(1);
    expect(tehItem.subtotal).toBe(15000);
  });

  it("Invoice QRIS tidak boleh memuat cashReceived atau changeAmount", async () => {
    await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    const [invoiceData] = Invoice.create.mock.calls[0];
    expect(invoiceData.cashReceived).toBeNull();
    expect(invoiceData.changeAmount).toBeNull();
  });

  it("completePayment() harus mengembalikan Invoice yang dibuat (Req 7.2)", async () => {
    const invoice = await completePayment(ONLINE_ORDER_ID, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    expect(invoice).toBeDefined();
    expect(invoice.invoiceNumber).toBe(INVOICE_NUMBER);
    expect(invoice.paymentMethod).toBe("QRIS");
    expect(invoice.totalAmount).toBe(TOTAL_AMOUNT);
  });
});

// ---------------------------------------------------------------------------
// Test 5: Alur end-to-end lengkap — buat pesanan → webhook → verifikasi semua
// Validates: Requirements 7.1, 7.2, 7.4
// ---------------------------------------------------------------------------

describe("Test 5: Alur end-to-end QRIS online — buat pesanan → webhook → completed + stok berkurang + Invoice terbuat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("alur lengkap: createOnlineOrder() → completePayment() → semua invariant terpenuhi (Req 7.1, 7.2, 7.4)", async () => {
    // ── Step 1: Setup mock untuk createOnlineOrder ──────────────────────────
    Product.findById
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(mockProductA) })
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(mockProductB) });

    Order.create.mockResolvedValue({
      toObject: () => ({ ...mockCreatedOnlineOrder }),
    });

    // ── Step 2: Buat pesanan QRIS online ────────────────────────────────────
    const order = await createOnlineOrder({
      items: [
        { productId: "product-id-001", quantity: 2 },
        { productId: "product-id-002", quantity: 1 },
      ],
      ...mockCustomer,
      paymentMethod: "QRIS",
    });

    // Verifikasi state awal pesanan (Req 7.1)
    expect(order.orderType).toBe("ONLINE");
    expect(order.orderStatus).toBe("waiting_preparation");
    expect(order.paymentStatus).toBe("pending");
    expect(order.cashierId).toBeNull();
    expect(order.sseToken).toBeDefined();

    // Stok belum dikurangi saat pesanan dibuat
    expect(Product.bulkWrite).not.toHaveBeenCalled();

    // SSE new_order dikirim ke WAREHOUSE
    expect(sseManager.broadcastToRole).toHaveBeenCalledWith(
      expect.objectContaining({ type: "new_order" }),
      expect.arrayContaining(["WAREHOUSE"])
    );

    // ── Step 3: Simulasi warehouse tandai siap (state transisi) ─────────────
    // (Dalam alur nyata: PATCH /api/orders/[id]/status → orderStatus: "ready")
    // Di sini kita setup mock agar completePayment() melihat order dalam state "ready"

    vi.clearAllMocks(); // Reset call counts untuk verifikasi yang bersih

    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockReadyOnlineOrder),
    });
    Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Product.bulkWrite.mockResolvedValue({ modifiedCount: mockOrderItems.length });
    User.findById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    });
    Invoice.create.mockResolvedValue({
      toObject: () => ({ ...mockCreatedInvoice }),
    });

    // ── Step 4: Simulasi webhook QRIS diterima → completePayment() ──────────
    const invoice = await completePayment(order._id, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    // ── Verifikasi 1: Order status berubah ke completed + paid (Req 7.2) ────
    expect(Order.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: order._id }),
      expect.objectContaining({
        $set: expect.objectContaining({
          paymentStatus: "paid",
          orderStatus: "completed",
          paymentMethod: "QRIS",
        }),
      })
    );

    // ── Verifikasi 2: Stok berkurang sesuai kuantitas (Req 7.2) ─────────────
    expect(Product.bulkWrite).toHaveBeenCalledTimes(1);
    const bulkOps = Product.bulkWrite.mock.calls[0][0];
    expect(bulkOps).toHaveLength(2);

    const kopiOp = bulkOps.find(
      (op) => op.updateOne.filter._id.toString() === "product-id-001"
    );
    expect(kopiOp.updateOne.update.$inc.stock).toBe(-2); // Kopi Arabika: -2

    const tehOp = bulkOps.find(
      (op) => op.updateOne.filter._id.toString() === "product-id-002"
    );
    expect(tehOp.updateOne.update.$inc.stock).toBe(-1); // Teh Hijau: -1

    // ── Verifikasi 3: Invoice terbuat dengan data lengkap (Req 7.4) ──────────
    expect(Invoice.create).toHaveBeenCalledTimes(1);
    const [invoiceData] = Invoice.create.mock.calls[0];

    expect(invoiceData.invoiceNumber).toBe(INVOICE_NUMBER);
    expect(invoiceData.orderId.toString()).toBe(ONLINE_ORDER_ID);
    expect(invoiceData.paymentMethod).toBe("QRIS");
    expect(invoiceData.totalAmount).toBe(TOTAL_AMOUNT);
    expect(invoiceData.transactionAt).toBeInstanceOf(Date);
    expect(invoiceData.items).toHaveLength(2);

    // Invoice dikembalikan oleh completePayment()
    expect(invoice).toBeDefined();
    expect(invoice.invoiceNumber).toBe(INVOICE_NUMBER);

    // ── Verifikasi 4: SSE order_completed di-broadcast (Req 7.2) ────────────
    expect(sseManager.broadcastToRole).toHaveBeenCalledWith(
      expect.objectContaining({ type: "order_completed" }),
      expect.arrayContaining(["CASHIER", "WAREHOUSE"])
    );
  });

  it("alur end-to-end: stok tidak dikurangi dua kali jika webhook duplikat (idempoten, Req 7.4)", async () => {
    // Setup: order sudah dalam state "paid" (sudah diproses sebelumnya)
    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        ...mockReadyOnlineOrder,
        paymentStatus: "paid",
        orderStatus: "completed",
      }),
    });

    // Webhook duplikat harus ditolak dengan ALREADY_PAID
    await expect(
      completePayment(ONLINE_ORDER_ID, {
        method: "QRIS",
        cashReceived: null,
        changeAmount: null,
      })
    ).rejects.toMatchObject({
      code: PaymentErrorCode.ALREADY_PAID,
    });

    // Stok tidak boleh dikurangi lagi
    expect(Product.bulkWrite).not.toHaveBeenCalled();

    // Invoice tidak boleh dibuat lagi
    expect(Invoice.create).not.toHaveBeenCalled();
  });

  it("alur end-to-end: rollback jika stok habis saat webhook diterima", async () => {
    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockReadyOnlineOrder),
    });
    Order.updateOne.mockResolvedValue({ modifiedCount: 1 });

    // Simulasi: stok habis saat webhook diterima (race condition)
    Product.bulkWrite.mockResolvedValue({ modifiedCount: 0 });

    await expect(
      completePayment(ONLINE_ORDER_ID, {
        method: "QRIS",
        cashReceived: null,
        changeAmount: null,
      })
    ).rejects.toMatchObject({
      code: PaymentErrorCode.INSUFFICIENT_STOCK,
    });

    // Invoice tidak boleh dibuat jika stok gagal dikurangi
    expect(Invoice.create).not.toHaveBeenCalled();

    // Order harus di-rollback ke state sebelumnya
    // (Order.updateOne dipanggil dua kali: sekali untuk update, sekali untuk rollback)
    expect(Order.updateOne).toHaveBeenCalledTimes(2);
    const rollbackCall = Order.updateOne.mock.calls[1];
    expect(rollbackCall[1].$set.paymentStatus).toBe("pending");
    expect(rollbackCall[1].$set.orderStatus).toBe("ready");
  });
});
