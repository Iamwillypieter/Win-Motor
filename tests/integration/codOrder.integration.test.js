/**
 * Integration Tests: Alur Pesanan COD (Cash on Delivery)
 *
 * Validates: Requirements 8.1, 8.2, 8.3
 *
 * Skenario yang diuji:
 *  Test 1: Buat pesanan COD → verifikasi state awal
 *           (orderType: ONLINE, paymentMethod: CASH, status waiting_preparation)
 *  Test 2: WAREHOUSE tandai ready → verifikasi status berubah ke ready,
 *           paymentStatus tetap pending
 *  Test 3: WAREHOUSE konfirmasi COD (tandai completed) → verifikasi completePayment() dipanggil
 *  Test 4: Setelah konfirmasi COD → verifikasi stok berkurang dan Invoice terbuat
 *  Test 5: Alur lengkap end-to-end dalam satu test
 *
 * Pendekatan: Semua test menggunakan mock untuk DB/models dan menguji service layer
 * secara langsung (bukan HTTP end-to-end), karena Next.js App Router tidak dapat
 * dijalankan dalam lingkungan Vitest/jsdom. Ini memvalidasi kontrak integrasi antara
 * createOnlineOrder(), status update logic, dan completePayment().
 *
 * Req 8.1: Stok dikurangi saat WAREHOUSE konfirmasi COD (bukan saat pesanan dibuat)
 * Req 8.2: WAREHOUSE dapat mengubah status pesanan COD ke `ready`
 * Req 8.3: WAREHOUSE konfirmasi COD memicu completePayment() yang mengurangi stok
 *           dan membuat Invoice
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
    broadcastToToken: vi.fn(),
  },
}));

vi.mock("@/lib/invoice", () => ({
  generateInvoiceNumber: vi.fn().mockResolvedValue("INV-20260507-COD-0001"),
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
import { createOnlineOrder, OrderError, OrderErrorCode } from "@/server/services/order.service";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CUSTOMER_NAME = "Sari Dewi";
const CUSTOMER_WHATSAPP = "081234567890";
const SHIPPING_ADDRESS = "Jl. Melati No. 7, Jakarta Selatan";

const mockProduct = {
  _id: "product-cod-001",
  name: "Kopi Arabika Premium",
  sku: "KOP-ARABIKA-001",
  price: 35000,
  stock: 15,
  isActive: true,
};

const mockOrderItems = [
  {
    productId: "product-cod-001",
    productName: "Kopi Arabika Premium",
    sku: "KOP-ARABIKA-001",
    unitPrice: 35000,
    quantity: 3,
  },
];

/** Pesanan COD dalam state awal setelah dibuat */
const mockCodOrderCreated = {
  _id: "cod-order-001",
  invoiceNumber: "INV-20260507-COD-0001",
  cashierId: null,
  orderType: "ONLINE",
  customerName: CUSTOMER_NAME,
  customerWhatsapp: CUSTOMER_WHATSAPP,
  shippingAddress: SHIPPING_ADDRESS,
  paymentMethod: "CASH",
  items: mockOrderItems,
  totalAmount: 105000, // 35000 × 3
  orderStatus: "waiting_preparation",
  paymentStatus: "pending",
  sseToken: "sse-token-cod-001",
  createdAt: new Date("2026-05-07T09:00:00.000Z"),
  updatedAt: new Date("2026-05-07T09:00:00.000Z"),
  completedAt: null,
};

/** Pesanan COD setelah WAREHOUSE tandai ready */
const mockCodOrderReady = {
  ...mockCodOrderCreated,
  orderStatus: "ready",
  updatedAt: new Date("2026-05-07T09:15:00.000Z"),
};

/** Invoice yang dibuat setelah konfirmasi COD */
const mockCodInvoice = {
  _id: "invoice-cod-001",
  orderId: "cod-order-001",
  invoiceNumber: "INV-20260507-COD-0001",
  cashierName: "Kasir",
  items: mockOrderItems.map((item) => ({
    ...item,
    subtotal: item.unitPrice * item.quantity,
  })),
  totalAmount: 105000,
  paymentMethod: "CASH",
  cashReceived: null,
  changeAmount: null,
  transactionAt: new Date("2026-05-07T09:30:00.000Z"),
  createdAt: new Date("2026-05-07T09:30:00.000Z"),
};

// ---------------------------------------------------------------------------
// Helper: setup mock untuk createOnlineOrder()
// ---------------------------------------------------------------------------

function setupCreateOrderMocks() {
  Product.findById.mockReturnValue({
    lean: vi.fn().mockResolvedValue(mockProduct),
  });

  Order.create.mockResolvedValue({
    toObject: () => ({ ...mockCodOrderCreated }),
  });
}

// ---------------------------------------------------------------------------
// Helper: setup mock untuk completePayment() pada pesanan COD yang sudah ready
// ---------------------------------------------------------------------------

function setupCompletePaymentMocks() {
  Order.findById.mockReturnValue({
    lean: vi.fn().mockResolvedValue({ ...mockCodOrderReady }),
  });
  Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Product.bulkWrite.mockResolvedValue({ modifiedCount: mockOrderItems.length });
  User.findById.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: null, name: "Kasir" }),
    }),
  });
  Invoice.create.mockResolvedValue({
    toObject: () => ({ ...mockCodInvoice }),
  });
}
