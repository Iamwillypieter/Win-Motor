/**
 * Integration Tests: SSE (Server-Sent Events)
 *
 * Validates: Requirements 4.1, 4.4
 *
 * Test scenarios:
 *  1. createOrder() → event `new_order` di-broadcast ke klien WAREHOUSE
 *  2. PATCH status → "ready" → event `order_ready` dikirim ke cashier yang tepat
 *  3. Klien yang disconnect di-unregister dari SSEManager
 *
 * Pendekatan: Semua test menggunakan SSEManager singleton secara langsung
 * (bukan HTTP end-to-end) karena Next.js App Router tidak dapat dijalankan
 * dalam lingkungan Vitest/jsdom. Ini memvalidasi kontrak integrasi antara
 * service layer dan SSEManager.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — harus dideklarasikan sebelum import modul yang menggunakannya
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/Order", () => {
  const mockOrder = {
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
  };
  return { default: mockOrder };
});

vi.mock("@/models/Product", () => ({
  default: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock("@/lib/invoice", () => ({
  generateInvoiceNumber: vi.fn().mockResolvedValue("INV-20260507-0001"),
}));

// ---------------------------------------------------------------------------
// Imports setelah mocks
// ---------------------------------------------------------------------------

import Order from "@/models/Order";
import Product from "@/models/Product";
import { createOrder } from "@/server/services/order.service";
import { updateProduct } from "@/server/services/product.service";
import sseManager from "@/lib/sse";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Buat mock ReadableStreamDefaultController yang merekam semua payload.
 */
function createMockController() {
  const enqueued = [];
  const ctrl = {
    enqueue: vi.fn((payload) => enqueued.push(payload)),
    close: vi.fn(),
    error: vi.fn(),
    get enqueued() {
      return enqueued;
    },
  };
  return ctrl;
}

/**
 * Parse payload SSE dari array enqueued controller.
 * Mengembalikan array objek JSON dari baris `data: {...}\n\n`.
 *
 * @param {string[]} enqueued
 * @returns {Array<{type: string, data: unknown}>}
 */
function parseSSEPayloads(enqueued) {
  return enqueued
    .filter((p) => typeof p === "string" && p.startsWith("data:"))
    .map((p) => {
      const jsonStr = p.replace(/^data:\s*/, "").trim();
      try {
        return JSON.parse(jsonStr);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Daftarkan klien ke SSEManager dan kembalikan controller-nya.
 * Membersihkan enqueued setelah event "connected" awal.
 *
 * @param {string} clientId
 * @param {string} userId
 * @param {string} role
 * @returns {{ ctrl: ReturnType<typeof createMockController> }}
 */
function registerClient(clientId, userId, role) {
  const ctrl = createMockController();
  sseManager.register(clientId, userId, role, ctrl);
  // Bersihkan event "connected" awal agar assertion lebih bersih
  ctrl.enqueue.mockClear();
  ctrl.enqueued.length = 0;
  return { ctrl };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CASHIER_ID = "cashier-user-001";
const WAREHOUSE_USER_ID = "warehouse-user-001";

const mockProduct = {
  _id: "product-001",
  name: "Kopi Susu",
  sku: "KS-001",
  price: 25000,
  stock: 10,
  isActive: true,
};

const mockOrderDoc = {
  _id: "order-001",
  invoiceNumber: "INV-20260507-0001",
  cashierId: CASHIER_ID,
  items: [
    {
      productId: "product-001",
      productName: "Kopi Susu",
      sku: "KS-001",
      unitPrice: 25000,
      quantity: 2,
    },
  ],
  totalAmount: 50000,
  orderStatus: "waiting_preparation",
  paymentStatus: "pending",
  createdAt: new Date("2026-05-07T08:00:00.000Z"),
};

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Mulai setiap test dengan state SSEManager yang bersih
  sseManager.clients.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  sseManager.clients.clear();
});

// ---------------------------------------------------------------------------
// Skenario 1: createOrder() → event new_order ke klien WAREHOUSE
// Validates: Requirement 4.1
// ---------------------------------------------------------------------------

describe("Skenario 1: createOrder() mem-broadcast new_order ke klien WAREHOUSE", () => {
  beforeEach(() => {
    Product.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockProduct),
    });
    Order.create.mockResolvedValue({
      toObject: () => ({ ...mockOrderDoc }),
    });
  });

  it("harus mengirim event new_order ke semua klien WAREHOUSE yang terhubung", async () => {
    const { ctrl: warehouseCtrl } = registerClient("wh-1", WAREHOUSE_USER_ID, "WAREHOUSE");

    await createOrder(CASHIER_ID, [{ productId: "product-001", quantity: 2 }]);

    const payloads = parseSSEPayloads(warehouseCtrl.enqueued);
    const newOrderEvent = payloads.find((p) => p.type === "new_order");

    expect(newOrderEvent).toBeDefined();
  });

  it("event new_order harus memuat data pesanan yang benar", async () => {
    const { ctrl: warehouseCtrl } = registerClient("wh-1", WAREHOUSE_USER_ID, "WAREHOUSE");

    await createOrder(CASHIER_ID, [{ productId: "product-001", quantity: 2 }]);

    const payloads = parseSSEPayloads(warehouseCtrl.enqueued);
    const newOrderEvent = payloads.find((p) => p.type === "new_order");

    expect(newOrderEvent.data).toMatchObject({
      invoiceNumber: "INV-20260507-0001",
      orderStatus: "waiting_preparation",
      paymentStatus: "pending",
      totalAmount: 50000,
      cashierId: CASHIER_ID,
    });
  });

  it("event new_order harus dikirim ke semua klien WAREHOUSE yang aktif (multi-client)", async () => {
    const { ctrl: wh1Ctrl } = registerClient("wh-1", "warehouse-user-001", "WAREHOUSE");
    const { ctrl: wh2Ctrl } = registerClient("wh-2", "warehouse-user-002", "WAREHOUSE");

    await createOrder(CASHIER_ID, [{ productId: "product-001", quantity: 2 }]);

    const wh1Payloads = parseSSEPayloads(wh1Ctrl.enqueued);
    const wh2Payloads = parseSSEPayloads(wh2Ctrl.enqueued);

    expect(wh1Payloads.find((p) => p.type === "new_order")).toBeDefined();
    expect(wh2Payloads.find((p) => p.type === "new_order")).toBeDefined();
  });

  it("klien CASHIER TIDAK boleh menerima event new_order", async () => {
    const { ctrl: cashierCtrl } = registerClient("cs-1", CASHIER_ID, "CASHIER");
    registerClient("wh-1", WAREHOUSE_USER_ID, "WAREHOUSE");

    await createOrder(CASHIER_ID, [{ productId: "product-001", quantity: 2 }]);

    const cashierPayloads = parseSSEPayloads(cashierCtrl.enqueued);
    const newOrderEvent = cashierPayloads.find((p) => p.type === "new_order");

    expect(newOrderEvent).toBeUndefined();
  });

  it("event new_order harus memuat items dengan snapshot produk yang benar", async () => {
    const { ctrl: warehouseCtrl } = registerClient("wh-1", WAREHOUSE_USER_ID, "WAREHOUSE");

    await createOrder(CASHIER_ID, [{ productId: "product-001", quantity: 2 }]);

    const payloads = parseSSEPayloads(warehouseCtrl.enqueued);
    const newOrderEvent = payloads.find((p) => p.type === "new_order");

    expect(newOrderEvent.data.items).toHaveLength(1);
    expect(newOrderEvent.data.items[0]).toMatchObject({
      productName: "Kopi Susu",
      sku: "KS-001",
      unitPrice: 25000,
      quantity: 2,
    });
  });

  it("kegagalan SSE broadcast TIDAK boleh menggagalkan createOrder()", async () => {
    // Daftarkan klien dengan controller yang akan melempar error saat enqueue
    const faultyCtrl = createMockController();
    faultyCtrl.enqueue.mockImplementation(() => {
      throw new Error("Stream closed");
    });
    sseManager.register("wh-broken", WAREHOUSE_USER_ID, "WAREHOUSE", faultyCtrl);

    // createOrder harus tetap berhasil meskipun SSE broadcast gagal
    await expect(
      createOrder(CASHIER_ID, [{ productId: "product-001", quantity: 2 }])
    ).resolves.toMatchObject({
      invoiceNumber: "INV-20260507-0001",
      orderStatus: "waiting_preparation",
    });
  });
});

// ---------------------------------------------------------------------------
// Skenario 2: PATCH status → "ready" → event order_ready ke cashier yang tepat
// Validates: Requirement 4.4
// ---------------------------------------------------------------------------

describe("Skenario 2: broadcastToUser() mengirim order_ready ke cashier yang tepat", () => {
  /**
   * Simulasi logika dari PATCH /api/orders/[id]/status route:
   * ketika orderStatus menjadi "ready", panggil sseManager.broadcastToUser()
   * ke cashierId pesanan tersebut.
   *
   * Ini memvalidasi kontrak integrasi antara route handler dan SSEManager
   * tanpa perlu menjalankan HTTP server.
   */
  function simulateStatusReadyBroadcast(orderId, invoiceNumber, cashierId) {
    sseManager.broadcastToUser(
      {
        type: "order_ready",
        data: {
          orderId,
          invoiceNumber,
          orderStatus: "ready",
        },
      },
      cashierId
    );
  }

  it("harus mengirim event order_ready hanya ke cashier yang membuat pesanan", () => {
    const { ctrl: cashier1Ctrl } = registerClient("cs-1", "cashier-001", "CASHIER");
    const { ctrl: cashier2Ctrl } = registerClient("cs-2", "cashier-002", "CASHIER");
    const { ctrl: warehouseCtrl } = registerClient("wh-1", WAREHOUSE_USER_ID, "WAREHOUSE");

    simulateStatusReadyBroadcast("order-001", "INV-20260507-0001", "cashier-001");

    // Hanya cashier-001 yang harus menerima event
    const cashier1Payloads = parseSSEPayloads(cashier1Ctrl.enqueued);
    expect(cashier1Payloads.find((p) => p.type === "order_ready")).toBeDefined();

    // cashier-002 TIDAK boleh menerima event
    const cashier2Payloads = parseSSEPayloads(cashier2Ctrl.enqueued);
    expect(cashier2Payloads.find((p) => p.type === "order_ready")).toBeUndefined();

    // Klien WAREHOUSE TIDAK boleh menerima event
    const warehousePayloads = parseSSEPayloads(warehouseCtrl.enqueued);
    expect(warehousePayloads.find((p) => p.type === "order_ready")).toBeUndefined();
  });

  it("event order_ready harus memuat data pesanan yang benar", () => {
    const { ctrl: cashierCtrl } = registerClient("cs-1", "cashier-001", "CASHIER");

    simulateStatusReadyBroadcast("order-001", "INV-20260507-0001", "cashier-001");

    const payloads = parseSSEPayloads(cashierCtrl.enqueued);
    const readyEvent = payloads.find((p) => p.type === "order_ready");

    expect(readyEvent).toBeDefined();
    expect(readyEvent.data).toMatchObject({
      orderId: "order-001",
      invoiceNumber: "INV-20260507-0001",
      orderStatus: "ready",
    });
  });

  it("harus mengirim order_ready ke semua tab/koneksi aktif cashier yang sama", () => {
    // Kasir yang sama bisa membuka beberapa tab
    const { ctrl: tab1Ctrl } = registerClient("cs-tab1", "cashier-001", "CASHIER");
    const { ctrl: tab2Ctrl } = registerClient("cs-tab2", "cashier-001", "CASHIER");

    simulateStatusReadyBroadcast("order-001", "INV-20260507-0001", "cashier-001");

    const tab1Payloads = parseSSEPayloads(tab1Ctrl.enqueued);
    const tab2Payloads = parseSSEPayloads(tab2Ctrl.enqueued);

    expect(tab1Payloads.find((p) => p.type === "order_ready")).toBeDefined();
    expect(tab2Payloads.find((p) => p.type === "order_ready")).toBeDefined();
  });

  it("TIDAK boleh mengirim event apapun jika cashier tidak terhubung ke SSE", () => {
    // Tidak ada klien yang terdaftar untuk cashier-999
    const { ctrl: otherCashierCtrl } = registerClient("cs-other", "cashier-other", "CASHIER");

    // Broadcast ke cashier yang tidak terhubung — tidak boleh melempar error
    expect(() =>
      simulateStatusReadyBroadcast("order-001", "INV-20260507-0001", "cashier-999")
    ).not.toThrow();

    // Klien lain tidak boleh menerima event
    const otherPayloads = parseSSEPayloads(otherCashierCtrl.enqueued);
    expect(otherPayloads.find((p) => p.type === "order_ready")).toBeUndefined();
  });

  it("event order_status_updated harus di-broadcast ke semua klien WAREHOUSE saat status berubah", () => {
    const { ctrl: wh1Ctrl } = registerClient("wh-1", "warehouse-001", "WAREHOUSE");
    const { ctrl: wh2Ctrl } = registerClient("wh-2", "warehouse-002", "WAREHOUSE");

    // Simulasi broadcast order_status_updated (selalu dikirim ke WAREHOUSE)
    sseManager.broadcastToRole(
      {
        type: "order_status_updated",
        data: { orderId: "order-001", orderStatus: "ready" },
      },
      ["WAREHOUSE"]
    );

    const wh1Payloads = parseSSEPayloads(wh1Ctrl.enqueued);
    const wh2Payloads = parseSSEPayloads(wh2Ctrl.enqueued);

    expect(wh1Payloads.find((p) => p.type === "order_status_updated")).toBeDefined();
    expect(wh2Payloads.find((p) => p.type === "order_status_updated")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Skenario 3: Klien yang disconnect di-unregister dari SSEManager
// Validates: Requirement 4.1 (cleanup koneksi)
// ---------------------------------------------------------------------------

describe("Skenario 3: Klien yang disconnect di-unregister dari SSEManager", () => {
  it("unregister() harus menghapus klien dari SSEManager", () => {
    const { ctrl } = registerClient("wh-1", WAREHOUSE_USER_ID, "WAREHOUSE");

    expect(sseManager.clients.has("wh-1")).toBe(true);
    expect(sseManager.clientCount).toBe(1);

    sseManager.unregister("wh-1");

    expect(sseManager.clients.has("wh-1")).toBe(false);
    expect(sseManager.clientCount).toBe(0);
  });

  it("klien yang sudah disconnect TIDAK boleh menerima broadcast berikutnya", () => {
    const { ctrl: warehouseCtrl } = registerClient("wh-1", WAREHOUSE_USER_ID, "WAREHOUSE");

    // Simulasi disconnect (seperti stream.cancel() atau request abort)
    sseManager.unregister("wh-1");

    // Broadcast setelah disconnect
    sseManager.broadcastToRole({ type: "new_order", data: {} }, ["WAREHOUSE"]);

    // Controller tidak boleh menerima payload apapun setelah unregister
    expect(warehouseCtrl.enqueue).not.toHaveBeenCalled();
  });

  it("unregister() pada clientId yang tidak ada TIDAK boleh melempar error", () => {
    expect(() => sseManager.unregister("client-tidak-ada")).not.toThrow();
  });

  it("disconnect satu klien TIDAK boleh mempengaruhi klien lain yang masih aktif", () => {
    const { ctrl: wh1Ctrl } = registerClient("wh-1", "warehouse-001", "WAREHOUSE");
    const { ctrl: wh2Ctrl } = registerClient("wh-2", "warehouse-002", "WAREHOUSE");

    // Disconnect wh-1
    sseManager.unregister("wh-1");

    expect(sseManager.clientCount).toBe(1);

    // wh-2 masih harus menerima broadcast
    sseManager.broadcastToRole({ type: "new_order", data: { id: "order-x" } }, ["WAREHOUSE"]);

    const wh2Payloads = parseSSEPayloads(wh2Ctrl.enqueued);
    expect(wh2Payloads.find((p) => p.type === "new_order")).toBeDefined();

    // wh-1 tidak boleh menerima apapun
    expect(wh1Ctrl.enqueue).not.toHaveBeenCalled();
  });

  it("klien dengan controller yang sudah tertutup harus di-unregister otomatis saat broadcast", () => {
    // Daftarkan klien dengan controller normal terlebih dahulu agar masuk ke map
    const { ctrl: staleCtrl } = registerClient("stale-wh", WAREHOUSE_USER_ID, "WAREHOUSE");

    // Setelah terdaftar, simulasi controller yang tertutup (stream dibatalkan oleh browser)
    staleCtrl.enqueue.mockImplementation(() => {
      throw new Error("Controller is closed");
    });

    expect(sseManager.clients.has("stale-wh")).toBe(true);

    // Broadcast harus menangani error dan membersihkan klien stale
    expect(() =>
      sseManager.broadcastToRole({ type: "new_order", data: {} }, ["WAREHOUSE"])
    ).not.toThrow();

    // Klien stale harus dihapus secara otomatis
    expect(sseManager.clients.has("stale-wh")).toBe(false);
  });

  it("simulasi disconnect via stream cancel: unregister dipanggil saat stream dibatalkan", () => {
    // Simulasi alur di GET /api/sse: stream.cancel() memanggil sseManager.unregister()
    const { ctrl } = registerClient("wh-stream", WAREHOUSE_USER_ID, "WAREHOUSE");

    expect(sseManager.clientCount).toBe(1);

    // Simulasi stream cancel (seperti yang terjadi di ReadableStream cancel callback)
    const cancelCallback = () => sseManager.unregister("wh-stream");
    cancelCallback();

    expect(sseManager.clientCount).toBe(0);
    expect(sseManager.clients.has("wh-stream")).toBe(false);
  });

  it("simulasi disconnect via request abort signal: unregister dipanggil saat abort", () => {
    // Simulasi alur di GET /api/sse: request.signal abort event memanggil sseManager.unregister()
    const { ctrl } = registerClient("wh-abort", WAREHOUSE_USER_ID, "WAREHOUSE");

    expect(sseManager.clientCount).toBe(1);

    // Simulasi abort event listener (seperti yang terjadi di route handler)
    const abortHandler = () => sseManager.unregister("wh-abort");
    abortHandler(); // Trigger abort

    expect(sseManager.clientCount).toBe(0);
    expect(sseManager.clients.has("wh-abort")).toBe(false);
  });

  it("setelah semua klien disconnect, broadcast TIDAK boleh melempar error", () => {
    registerClient("wh-1", "warehouse-001", "WAREHOUSE");
    registerClient("wh-2", "warehouse-002", "WAREHOUSE");

    sseManager.unregister("wh-1");
    sseManager.unregister("wh-2");

    expect(sseManager.clientCount).toBe(0);

    // Broadcast ke manager kosong harus aman
    expect(() =>
      sseManager.broadcastToRole({ type: "new_order", data: {} }, ["WAREHOUSE"])
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Skenario tambahan: clientCount mencerminkan state yang akurat
// ---------------------------------------------------------------------------

describe("SSEManager — clientCount mencerminkan state yang akurat", () => {
  it("clientCount harus bertambah saat klien terdaftar", () => {
    expect(sseManager.clientCount).toBe(0);

    registerClient("c1", "user-1", "CASHIER");
    expect(sseManager.clientCount).toBe(1);

    registerClient("c2", "user-2", "WAREHOUSE");
    expect(sseManager.clientCount).toBe(2);
  });

  it("clientCount harus berkurang saat klien di-unregister", () => {
    registerClient("c1", "user-1", "CASHIER");
    registerClient("c2", "user-2", "WAREHOUSE");

    sseManager.unregister("c1");
    expect(sseManager.clientCount).toBe(1);

    sseManager.unregister("c2");
    expect(sseManager.clientCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Skenario 4: updateProduct() → event product_updated ke klien CASHIER
// Validates: Requirements 2.3, 2.4 (Task 11.1)
// ---------------------------------------------------------------------------

describe("Skenario 4: updateProduct() mem-broadcast product_updated ke klien CASHIER", () => {
  it("harus mengirim event product_updated ke semua klien CASHIER setelah updateProduct()", async () => {
    const updatedDoc = {
      _id: "product-001",
      name: "Kopi Robusta",
      sku: "KOP-001",
      price: 30000,
      stock: 50,
      imageUrl: null,
      isActive: true,
    };

    Product.findByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(updatedDoc),
    });

    const { ctrl: cashier1Ctrl } = registerClient("cs-1", "cashier-001", "CASHIER");
    const { ctrl: cashier2Ctrl } = registerClient("cs-2", "cashier-002", "CASHIER");
    const { ctrl: warehouseCtrl } = registerClient("wh-1", "warehouse-001", "WAREHOUSE");

    await updateProduct("product-001", { name: "Kopi Robusta" });

    const cs1Payloads = parseSSEPayloads(cashier1Ctrl.enqueued);
    const cs2Payloads = parseSSEPayloads(cashier2Ctrl.enqueued);
    const whPayloads = parseSSEPayloads(warehouseCtrl.enqueued);

    // Both CASHIER clients must receive product_updated
    expect(cs1Payloads.find((p) => p.type === "product_updated")).toBeDefined();
    expect(cs2Payloads.find((p) => p.type === "product_updated")).toBeDefined();

    // WAREHOUSE must NOT receive product_updated
    expect(whPayloads.find((p) => p.type === "product_updated")).toBeUndefined();
  });

  it("event product_updated harus memuat data produk yang benar", async () => {
    const updatedDoc = {
      _id: "product-001",
      name: "Kopi Robusta",
      sku: "KOP-001",
      price: 30000,
      stock: 50,
      imageUrl: "https://example.com/robusta.jpg",
      isActive: true,
    };

    Product.findByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(updatedDoc),
    });

    const { ctrl: cashierCtrl } = registerClient("cs-1", "cashier-001", "CASHIER");

    await updateProduct("product-001", { name: "Kopi Robusta", price: 30000 });

    const payloads = parseSSEPayloads(cashierCtrl.enqueued);
    const productUpdatedEvent = payloads.find((p) => p.type === "product_updated");

    expect(productUpdatedEvent).toBeDefined();
    expect(productUpdatedEvent.data).toMatchObject({
      _id: "product-001",
      name: "Kopi Robusta",
      sku: "KOP-001",
      price: 30000,
      stock: 50,
      isActive: true,
    });
  });

  it("kegagalan SSE broadcast TIDAK boleh menggagalkan updateProduct()", async () => {
    const updatedDoc = {
      _id: "product-001",
      name: "Kopi Robusta",
      sku: "KOP-001",
      price: 30000,
      stock: 50,
      imageUrl: null,
      isActive: true,
    };

    Product.findByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(updatedDoc),
    });

    // Register a client with a faulty controller
    const faultyCtrl = createMockController();
    faultyCtrl.enqueue.mockImplementation(() => {
      throw new Error("Stream closed");
    });
    sseManager.register("cs-broken", "cashier-broken", "CASHIER", faultyCtrl);

    // updateProduct must still succeed even if SSE broadcast fails
    await expect(
      updateProduct("product-001", { name: "Kopi Robusta" })
    ).resolves.toMatchObject({ name: "Kopi Robusta" });
  });
});

// ---------------------------------------------------------------------------
// Skenario 5: updateProduct() dengan stock → event stock_updated ke klien CASHIER
// Validates: Requirements 2.3, 2.4 (Task 11.1)
// ---------------------------------------------------------------------------

describe("Skenario 5: updateProduct() dengan stock mem-broadcast stock_updated ke klien CASHIER", () => {
  it("harus mengirim event stock_updated ke klien CASHIER ketika stok diperbarui", async () => {
    const updatedDoc = {
      _id: "product-001",
      name: "Kopi Arabika",
      sku: "KOP-001",
      price: 25000,
      stock: 75,
      imageUrl: null,
      isActive: true,
    };

    Product.findByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(updatedDoc),
    });

    const { ctrl: cashierCtrl } = registerClient("cs-1", "cashier-001", "CASHIER");
    const { ctrl: warehouseCtrl } = registerClient("wh-1", "warehouse-001", "WAREHOUSE");

    await updateProduct("product-001", { stock: 75 });

    const csPayloads = parseSSEPayloads(cashierCtrl.enqueued);
    const whPayloads = parseSSEPayloads(warehouseCtrl.enqueued);

    // CASHIER must receive stock_updated
    const stockUpdatedEvent = csPayloads.find((p) => p.type === "stock_updated");
    expect(stockUpdatedEvent).toBeDefined();

    // WAREHOUSE must NOT receive stock_updated
    expect(whPayloads.find((p) => p.type === "stock_updated")).toBeUndefined();
  });

  it("event stock_updated harus memuat productId dan newStock yang benar", async () => {
    const updatedDoc = {
      _id: "product-001",
      name: "Kopi Arabika",
      sku: "KOP-001",
      price: 25000,
      stock: 75,
      imageUrl: null,
      isActive: true,
    };

    Product.findByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(updatedDoc),
    });

    const { ctrl: cashierCtrl } = registerClient("cs-1", "cashier-001", "CASHIER");

    await updateProduct("product-001", { stock: 75 });

    const payloads = parseSSEPayloads(cashierCtrl.enqueued);
    const stockUpdatedEvent = payloads.find((p) => p.type === "stock_updated");

    expect(stockUpdatedEvent).toBeDefined();
    expect(stockUpdatedEvent.data).toMatchObject({
      productId: "product-001",
      newStock: 75,
    });
  });

  it("TIDAK boleh mengirim stock_updated ketika update tidak menyertakan field stock", async () => {
    const updatedDoc = {
      _id: "product-001",
      name: "Kopi Robusta",
      sku: "KOP-001",
      price: 30000,
      stock: 50,
      imageUrl: null,
      isActive: true,
    };

    Product.findByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(updatedDoc),
    });

    const { ctrl: cashierCtrl } = registerClient("cs-1", "cashier-001", "CASHIER");

    // Update only name — no stock change
    await updateProduct("product-001", { name: "Kopi Robusta" });

    const payloads = parseSSEPayloads(cashierCtrl.enqueued);

    // product_updated must be sent
    expect(payloads.find((p) => p.type === "product_updated")).toBeDefined();

    // stock_updated must NOT be sent
    expect(payloads.find((p) => p.type === "stock_updated")).toBeUndefined();
  });

  it("harus mengirim KEDUA product_updated DAN stock_updated ketika update menyertakan stock", async () => {
    const updatedDoc = {
      _id: "product-001",
      name: "Kopi Arabika",
      sku: "KOP-001",
      price: 25000,
      stock: 100,
      imageUrl: null,
      isActive: true,
    };

    Product.findByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(updatedDoc),
    });

    const { ctrl: cashierCtrl } = registerClient("cs-1", "cashier-001", "CASHIER");

    await updateProduct("product-001", { stock: 100 });

    const payloads = parseSSEPayloads(cashierCtrl.enqueued);

    expect(payloads.find((p) => p.type === "product_updated")).toBeDefined();
    expect(payloads.find((p) => p.type === "stock_updated")).toBeDefined();
  });
});
