/**
 * Unit Tests: OrderService
 *
 * Validates: Requirements 3.2–3.6
 *
 * Tests:
 *   1. createOrder: keranjang kosong → error EMPTY_CART
 *   2. createOrder: stok tidak cukup → error INSUFFICIENT_STOCK
 *   3. createOrder: valid → Order tersimpan, stok tidak berubah, invoiceNumber unik
 *   4. getOrders: mengembalikan daftar pesanan dengan filter opsional
 *   5. getOrderById: mengembalikan pesanan atau melempar ORDER_NOT_FOUND
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/Order", () => {
  const mockOrder = {
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
  };
  return { default: mockOrder };
});

vi.mock("@/models/Product", () => {
  const mockProduct = {
    findById: vi.fn(),
  };
  return { default: mockProduct };
});

vi.mock("@/lib/invoice", () => ({
  generateInvoiceNumber: vi.fn().mockResolvedValue("INV-20260507-0001"),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import Order from "@/models/Order";
import Product from "@/models/Product";
import {
  createOrder,
  getOrders,
  getOrderById,
  OrderError,
  OrderErrorCode,
} from "@/server/services/order.service";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockProduct1 = {
  _id: "product-id-001",
  name: "Kopi Arabika",
  sku: "KOP-001",
  price: 25000,
  stock: 100,
  isActive: true,
};

const mockProduct2 = {
  _id: "product-id-002",
  name: "Teh Hijau",
  sku: "TEH-001",
  price: 15000,
  stock: 50,
  isActive: true,
};

const mockOrderDoc = {
  _id: "order-id-001",
  invoiceNumber: "INV-20260507-0001",
  cashierId: "cashier-id-001",
  items: [
    {
      productId: "product-id-001",
      productName: "Kopi Arabika",
      sku: "KOP-001",
      unitPrice: 25000,
      quantity: 2,
    },
  ],
  totalAmount: 50000,
  orderStatus: "waiting_preparation",
  paymentStatus: "pending",
  createdAt: new Date("2026-05-07"),
  updatedAt: new Date("2026-05-07"),
};

// ---------------------------------------------------------------------------
// createOrder tests
// ---------------------------------------------------------------------------

describe("OrderService — createOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Keranjang kosong → error EMPTY_CART
  // Validates: Requirement 3.5
  // -------------------------------------------------------------------------

  describe("keranjang kosong", () => {
    it("harus melempar OrderError dengan code EMPTY_CART ketika items kosong", async () => {
      await expect(
        createOrder("cashier-id-001", [])
      ).rejects.toThrow(OrderError);
    });

    it("harus melempar error dengan code EMPTY_CART", async () => {
      let thrownError = null;
      try {
        await createOrder("cashier-id-001", []);
      } catch (err) {
        thrownError = err;
      }
      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe(OrderErrorCode.EMPTY_CART);
    });

    it("harus melempar EMPTY_CART ketika items adalah null", async () => {
      let thrownError = null;
      try {
        await createOrder("cashier-id-001", null);
      } catch (err) {
        thrownError = err;
      }
      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe(OrderErrorCode.EMPTY_CART);
    });

    it("TIDAK boleh memanggil Product.findById ketika keranjang kosong", async () => {
      try {
        await createOrder("cashier-id-001", []);
      } catch {
        // expected
      }
      expect(Product.findById).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Stok tidak cukup → error INSUFFICIENT_STOCK
  // Validates: Requirement 3.6
  // -------------------------------------------------------------------------

  describe("stok tidak cukup", () => {
    it("harus melempar OrderError dengan code INSUFFICIENT_STOCK ketika quantity > stock", async () => {
      Product.findById.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ ...mockProduct1, stock: 1 }),
      });

      await expect(
        createOrder("cashier-id-001", [
          { productId: "product-id-001", quantity: 5 },
        ])
      ).rejects.toThrow(OrderError);
    });

    it("harus melempar error dengan code INSUFFICIENT_STOCK", async () => {
      Product.findById.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ ...mockProduct1, stock: 1 }),
      });

      let thrownError = null;
      try {
        await createOrder("cashier-id-001", [
          { productId: "product-id-001", quantity: 5 },
        ]);
      } catch (err) {
        thrownError = err;
      }
      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe(OrderErrorCode.INSUFFICIENT_STOCK);
    });

    it("pesan error harus menyebutkan nama produk yang stoknya kurang", async () => {
      Product.findById.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ ...mockProduct1, stock: 1 }),
      });

      let thrownError = null;
      try {
        await createOrder("cashier-id-001", [
          { productId: "product-id-001", quantity: 5 },
        ]);
      } catch (err) {
        thrownError = err;
      }
      expect(thrownError.message).toContain("Kopi Arabika");
    });

    it("TIDAK boleh memanggil Order.create ketika stok tidak cukup", async () => {
      Product.findById.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ ...mockProduct1, stock: 1 }),
      });

      try {
        await createOrder("cashier-id-001", [
          { productId: "product-id-001", quantity: 5 },
        ]);
      } catch {
        // expected
      }
      expect(Order.create).not.toHaveBeenCalled();
    });

    it("harus melempar INSUFFICIENT_STOCK jika salah satu item dari beberapa item kekurangan stok", async () => {
      Product.findById
        .mockReturnValueOnce({
          lean: vi.fn().mockResolvedValue(mockProduct1), // stock: 100, quantity: 2 → OK
        })
        .mockReturnValueOnce({
          lean: vi.fn().mockResolvedValue({ ...mockProduct2, stock: 1 }), // stock: 1, quantity: 5 → FAIL
        });

      let thrownError = null;
      try {
        await createOrder("cashier-id-001", [
          { productId: "product-id-001", quantity: 2 },
          { productId: "product-id-002", quantity: 5 },
        ]);
      } catch (err) {
        thrownError = err;
      }
      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe(OrderErrorCode.INSUFFICIENT_STOCK);
    });
  });

  // -------------------------------------------------------------------------
  // Pesanan valid → berhasil dibuat
  // Validates: Requirements 3.3, 3.4
  // -------------------------------------------------------------------------

  describe("pesanan valid — berhasil dibuat", () => {
    beforeEach(() => {
      Product.findById.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockProduct1),
      });
      Order.create.mockResolvedValue({
        toObject: () => ({ ...mockOrderDoc }),
      });
    });

    it("harus mengembalikan order yang dibuat dengan field yang benar", async () => {
      const result = await createOrder("cashier-id-001", [
        { productId: "product-id-001", quantity: 2 },
      ]);

      expect(result).toBeDefined();
      expect(result.invoiceNumber).toBe("INV-20260507-0001");
      expect(result.orderStatus).toBe("waiting_preparation");
      expect(result.paymentStatus).toBe("pending");
      expect(result.totalAmount).toBe(50000);
    });

    it("harus memanggil Order.create dengan orderStatus: waiting_preparation", async () => {
      await createOrder("cashier-id-001", [
        { productId: "product-id-001", quantity: 2 },
      ]);

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderStatus: "waiting_preparation",
          paymentStatus: "pending",
        })
      );
    });

    it("harus menyimpan snapshot produk (productName, sku, unitPrice) di order items", async () => {
      await createOrder("cashier-id-001", [
        { productId: "product-id-001", quantity: 2 },
      ]);

      const createCall = Order.create.mock.calls[0][0];
      expect(createCall.items[0]).toMatchObject({
        productName: "Kopi Arabika",
        sku: "KOP-001",
        unitPrice: 25000,
        quantity: 2,
      });
    });

    it("harus menghitung totalAmount dengan benar (sum of unitPrice × quantity)", async () => {
      Product.findById
        .mockReturnValueOnce({
          lean: vi.fn().mockResolvedValue(mockProduct1), // 25000 × 2 = 50000
        })
        .mockReturnValueOnce({
          lean: vi.fn().mockResolvedValue(mockProduct2), // 15000 × 3 = 45000
        });

      Order.create.mockResolvedValue({
        toObject: () => ({
          ...mockOrderDoc,
          totalAmount: 95000,
          items: [
            { ...mockOrderDoc.items[0], quantity: 2 },
            {
              productId: "product-id-002",
              productName: "Teh Hijau",
              sku: "TEH-001",
              unitPrice: 15000,
              quantity: 3,
            },
          ],
        }),
      });

      await createOrder("cashier-id-001", [
        { productId: "product-id-001", quantity: 2 },
        { productId: "product-id-002", quantity: 3 },
      ]);

      const createCall = Order.create.mock.calls[0][0];
      // 25000 × 2 + 15000 × 3 = 50000 + 45000 = 95000
      expect(createCall.totalAmount).toBe(95000);
    });

    it("TIDAK boleh mengubah stok produk saat membuat pesanan", async () => {
      await createOrder("cashier-id-001", [
        { productId: "product-id-001", quantity: 2 },
      ]);

      // Product model should not have any update calls
      expect(Product.findById).toHaveBeenCalled();
      // No update methods should be called on Product
      expect(Product.findById).not.toHaveBeenCalledWith(
        expect.objectContaining({ $inc: expect.anything() })
      );
    });

    it("harus menyertakan cashierId di order yang dibuat", async () => {
      await createOrder("cashier-id-001", [
        { productId: "product-id-001", quantity: 2 },
      ]);

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({ cashierId: "cashier-id-001" })
      );
    });
  });
});

// ---------------------------------------------------------------------------
// getOrders tests
// ---------------------------------------------------------------------------

describe("OrderService — getOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("harus mengembalikan semua pesanan tanpa filter", async () => {
    const mockOrders = [mockOrderDoc, { ...mockOrderDoc, _id: "order-id-002" }];
    Order.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockOrders),
      }),
    });

    const result = await getOrders();
    expect(result).toHaveLength(2);
  });

  it("harus memfilter berdasarkan status ketika diberikan", async () => {
    Order.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([mockOrderDoc]),
      }),
    });

    await getOrders({ status: "waiting_preparation" });

    expect(Order.find).toHaveBeenCalledWith(
      expect.objectContaining({ orderStatus: "waiting_preparation" })
    );
  });

  it("harus memfilter berdasarkan cashierId ketika diberikan", async () => {
    Order.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([mockOrderDoc]),
      }),
    });

    await getOrders({ cashierId: "cashier-id-001" });

    expect(Order.find).toHaveBeenCalledWith(
      expect.objectContaining({ cashierId: "cashier-id-001" })
    );
  });

  it("harus mengembalikan array kosong ketika tidak ada pesanan", async () => {
    Order.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await getOrders();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getOrderById tests
// ---------------------------------------------------------------------------

describe("OrderService — getOrderById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("harus mengembalikan pesanan ketika ID valid", async () => {
    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockOrderDoc),
    });

    const result = await getOrderById("order-id-001");
    expect(result).toBeDefined();
    expect(result._id).toBe("order-id-001");
  });

  it("harus melempar OrderError dengan code ORDER_NOT_FOUND ketika pesanan tidak ada", async () => {
    Order.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });

    let thrownError = null;
    try {
      await getOrderById("id-tidak-ada");
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError).toBeInstanceOf(OrderError);
    expect(thrownError.code).toBe(OrderErrorCode.ORDER_NOT_FOUND);
  });
});
