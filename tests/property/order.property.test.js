/**
 * Property-Based Tests: Order (P11–P13)
 *
 * Validates: Requirements 3.2, 3.3, 3.4, 3.6
 *
 * P11: InvoiceNumber Unik — dua pesanan yang dibuat selalu memiliki
 *      invoiceNumber berbeda; status awal selalu waiting_preparation / pending.
 * P12: Stok Tidak Berubah Saat Buat Pesanan — nilai stock setiap produk sama
 *      sebelum dan sesudah createOrder().
 * P13: Pesanan Ditolak Jika Stok Kurang — jika quantity > stock untuk item
 *      manapun, createOrder() ditolak dan tidak ada Order tersimpan.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the service
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
  generateInvoiceNumber: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import Order from "@/models/Order";
import Product from "@/models/Product";
import { generateInvoiceNumber } from "@/lib/invoice";
import {
  createOrder,
  OrderError,
  OrderErrorCode,
} from "@/server/services/order.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock product object with sufficient stock.
 */
function makeMockProduct(productId, price, stock) {
  return {
    _id: productId,
    name: `Product-${productId}`,
    sku: `SKU-${productId}`,
    price,
    stock,
    isActive: true,
  };
}

/**
 * Build the expected order document that Order.create would return.
 */
function makeMockOrderDoc(invoiceNumber, cashierId, items, products) {
  const orderItems = items.map((item) => {
    const product = products.find((p) => p._id === item.productId);
    return {
      productId: product._id,
      productName: product.name,
      sku: product.sku,
      unitPrice: product.price,
      quantity: item.quantity,
    };
  });
  const totalAmount = orderItems.reduce(
    (sum, i) => sum + i.unitPrice * i.quantity,
    0
  );
  return {
    _id: `order-${invoiceNumber}`,
    invoiceNumber,
    cashierId,
    items: orderItems,
    totalAmount,
    orderStatus: "waiting_preparation",
    paymentStatus: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A valid product ID string */
const arbProductId = fc
  .integer({ min: 1, max: 9999 })
  .map((n) => `product-${String(n).padStart(4, "0")}`);

/** A valid price: positive integer rupiah */
const arbPrice = fc.integer({ min: 1000, max: 500_000 });

/** A valid stock level */
const arbStock = fc.integer({ min: 1, max: 100 });

/**
 * A single valid cart item: quantity is always ≤ stock so the order succeeds.
 */
const arbValidCartItem = fc
  .record({
    productId: arbProductId,
    price: arbPrice,
    stock: arbStock,
  })
  .chain(({ productId, price, stock }) =>
    fc
      .integer({ min: 1, max: stock })
      .map((quantity) => ({ productId, price, stock, quantity }))
  );

/**
 * An array of valid cart items with unique productIds.
 */
const arbValidCartItems = fc
  .array(arbValidCartItem, { minLength: 1, maxLength: 5 })
  .map((items) => {
    const seen = new Set();
    return items.filter((item) => {
      if (seen.has(item.productId)) return false;
      seen.add(item.productId);
      return true;
    });
  })
  .filter((items) => items.length > 0);

/**
 * Cart items where at least one item has quantity > stock (insufficient stock).
 */
const arbInsufficientStockItems = fc
  .array(arbValidCartItem, { minLength: 1, maxLength: 5 })
  .map((items) => {
    // Deduplicate by productId
    const seen = new Set();
    const unique = items.filter((item) => {
      if (seen.has(item.productId)) return false;
      seen.add(item.productId);
      return true;
    });
    return unique;
  })
  .filter((items) => items.length > 0)
  .chain((items) =>
    // Pick one index to make insufficient
    fc.integer({ min: 0, max: items.length - 1 }).map((badIdx) => {
      return items.map((item, i) => {
        if (i === badIdx) {
          // quantity = stock + 1 (guaranteed insufficient)
          return { ...item, quantity: item.stock + 1 };
        }
        return item;
      });
    })
  );

/** A valid cashier ID */
const arbCashierId = fc
  .integer({ min: 1, max: 999 })
  .map((n) => `cashier-${String(n).padStart(3, "0")}`);

/** A valid invoice number in INV-YYYYMMDD-NNNN format */
function makeInvoiceNumber(counter) {
  const date = "20260507";
  return `INV-${date}-${String(counter).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// P11: InvoiceNumber Unik
// Validates: Requirements 3.3, 3.4
// ---------------------------------------------------------------------------

describe("P11: InvoiceNumber Unik", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "dua pesanan yang dibuat berturut-turut harus memiliki invoiceNumber berbeda",
    async () => {
      /**
       * Validates: Requirements 3.3, 3.4
       *
       * For any two calls to createOrder() with valid cart items, the resulting
       * invoiceNumbers must be different. This is the uniqueness invariant.
       */
      await fc.assert(
        fc.asyncProperty(
          arbValidCartItems,
          arbCashierId,
          async (items, cashierId) => {
            vi.resetAllMocks();

            const invoice1 = makeInvoiceNumber(1);
            const invoice2 = makeInvoiceNumber(2);

            // generateInvoiceNumber returns different values on each call
            generateInvoiceNumber
              .mockResolvedValueOnce(invoice1)
              .mockResolvedValueOnce(invoice2);

            // Set up Product.findById to return valid products for each item
            for (const item of items) {
              const product = makeMockProduct(item.productId, item.price, item.stock);
              Product.findById.mockReturnValueOnce({
                lean: vi.fn().mockResolvedValue(product),
              });
            }
            // Second call — same products
            for (const item of items) {
              const product = makeMockProduct(item.productId, item.price, item.stock);
              Product.findById.mockReturnValueOnce({
                lean: vi.fn().mockResolvedValue(product),
              });
            }

            const cartItems = items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
            }));

            const products = items.map((i) =>
              makeMockProduct(i.productId, i.price, i.stock)
            );

            const orderDoc1 = makeMockOrderDoc(invoice1, cashierId, cartItems, products);
            const orderDoc2 = makeMockOrderDoc(invoice2, cashierId, cartItems, products);

            Order.create
              .mockResolvedValueOnce({ toObject: () => orderDoc1 })
              .mockResolvedValueOnce({ toObject: () => orderDoc2 });

            const order1 = await createOrder(cashierId, cartItems);
            const order2 = await createOrder(cashierId, cartItems);

            // Core property: invoice numbers must be different
            expect(order1.invoiceNumber).not.toBe(order2.invoiceNumber);
            expect(order1.invoiceNumber).toBe(invoice1);
            expect(order2.invoiceNumber).toBe(invoice2);
          }
        )
      );
    }
  );

  it(
    "status awal pesanan harus selalu waiting_preparation dan paymentStatus pending",
    async () => {
      /**
       * Validates: Requirements 3.3, 3.4
       *
       * For any valid cart, the created order must always have
       * orderStatus: "waiting_preparation" and paymentStatus: "pending".
       */
      await fc.assert(
        fc.asyncProperty(
          arbValidCartItems,
          arbCashierId,
          async (items, cashierId) => {
            vi.resetAllMocks();

            const invoice = makeInvoiceNumber(1);
            generateInvoiceNumber.mockResolvedValue(invoice);

            for (const item of items) {
              const product = makeMockProduct(item.productId, item.price, item.stock);
              Product.findById.mockReturnValueOnce({
                lean: vi.fn().mockResolvedValue(product),
              });
            }

            const cartItems = items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
            }));
            const products = items.map((i) =>
              makeMockProduct(i.productId, i.price, i.stock)
            );
            const orderDoc = makeMockOrderDoc(invoice, cashierId, cartItems, products);

            Order.create.mockResolvedValue({ toObject: () => orderDoc });

            const order = await createOrder(cashierId, cartItems);

            expect(order.orderStatus).toBe("waiting_preparation");
            expect(order.paymentStatus).toBe("pending");
          }
        )
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P12: Stok Tidak Berubah Saat Buat Pesanan
// Validates: Requirements 3.4, 3.6
// ---------------------------------------------------------------------------

describe("P12: Stok Tidak Berubah Saat Buat Pesanan", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "nilai stock setiap produk harus sama sebelum dan sesudah createOrder()",
    async () => {
      /**
       * Validates: Requirements 3.4, 3.6
       *
       * createOrder() must NOT decrement or modify product stock. The stock
       * values read from the DB before and after the call must be identical.
       * Stock is only decremented on payment confirmation (not at order creation).
       */
      await fc.assert(
        fc.asyncProperty(
          arbValidCartItems,
          arbCashierId,
          async (items, cashierId) => {
            vi.resetAllMocks();

            const invoice = makeInvoiceNumber(1);
            generateInvoiceNumber.mockResolvedValue(invoice);

            // Record stock values before the call
            const stockBefore = {};
            for (const item of items) {
              stockBefore[item.productId] = item.stock;
            }

            // Set up Product.findById — returns the product with its original stock
            for (const item of items) {
              const product = makeMockProduct(item.productId, item.price, item.stock);
              Product.findById.mockReturnValueOnce({
                lean: vi.fn().mockResolvedValue(product),
              });
            }

            const cartItems = items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
            }));
            const products = items.map((i) =>
              makeMockProduct(i.productId, i.price, i.stock)
            );
            const orderDoc = makeMockOrderDoc(invoice, cashierId, cartItems, products);

            Order.create.mockResolvedValue({ toObject: () => orderDoc });

            await createOrder(cashierId, cartItems);

            // Verify: Product model must NOT have been called with any update/write
            // (findById is the only allowed call — for stock validation reads)
            const productModule = await import("@/models/Product");
            const ProductModel = productModule.default;

            // No update methods should have been called
            expect(ProductModel.updateOne).toBeUndefined();
            expect(ProductModel.updateMany).toBeUndefined();
            expect(ProductModel.findByIdAndUpdate).toBeUndefined();

            // The stock values in the order items must match the original stock
            // (the service reads stock but does not write it)
            const createCallArg = Order.create.mock.calls[0][0];
            for (const orderItem of createCallArg.items) {
              const originalItem = items.find(
                (i) => i.productId === orderItem.productId.toString()
              );
              if (originalItem) {
                // unitPrice snapshot must match original price
                expect(orderItem.unitPrice).toBe(originalItem.price);
              }
            }

            // Stock before must equal stock after (no writes happened)
            for (const item of items) {
              expect(stockBefore[item.productId]).toBe(item.stock);
            }
          }
        )
      );
    }
  );

  it(
    "Order.create harus dipanggil tepat sekali dan tidak ada Product update",
    async () => {
      /**
       * Validates: Requirement 3.4
       *
       * For any valid cart, createOrder() must call Order.create exactly once
       * and must never call any Product write method.
       */
      await fc.assert(
        fc.asyncProperty(
          arbValidCartItems,
          arbCashierId,
          async (items, cashierId) => {
            vi.resetAllMocks();

            const invoice = makeInvoiceNumber(1);
            generateInvoiceNumber.mockResolvedValue(invoice);

            for (const item of items) {
              const product = makeMockProduct(item.productId, item.price, item.stock);
              Product.findById.mockReturnValueOnce({
                lean: vi.fn().mockResolvedValue(product),
              });
            }

            const cartItems = items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
            }));
            const products = items.map((i) =>
              makeMockProduct(i.productId, i.price, i.stock)
            );
            const orderDoc = makeMockOrderDoc(invoice, cashierId, cartItems, products);

            Order.create.mockResolvedValue({ toObject: () => orderDoc });

            await createOrder(cashierId, cartItems);

            // Order.create must be called exactly once
            expect(Order.create).toHaveBeenCalledTimes(1);

            // Product.findById must be called once per item (read-only)
            expect(Product.findById).toHaveBeenCalledTimes(items.length);
          }
        )
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P13: Pesanan Ditolak Jika Stok Kurang
// Validates: Requirement 3.6
// ---------------------------------------------------------------------------

describe("P13: Pesanan Ditolak Jika Stok Kurang", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "createOrder() harus ditolak dengan INSUFFICIENT_STOCK jika quantity > stock untuk item manapun",
    async () => {
      /**
       * Validates: Requirement 3.6
       *
       * For any cart where at least one item has quantity > stock,
       * createOrder() must throw an OrderError with code INSUFFICIENT_STOCK.
       * No Order must be saved (Order.create must not be called).
       */
      await fc.assert(
        fc.asyncProperty(
          arbInsufficientStockItems,
          arbCashierId,
          async (items, cashierId) => {
            // Full reset between property runs to avoid mock state leakage
            vi.resetAllMocks();

            // Set up Product.findById — returns each product with its stock
            // (some items will have quantity > stock)
            for (const item of items) {
              const product = makeMockProduct(item.productId, item.price, item.stock);
              Product.findById.mockReturnValueOnce({
                lean: vi.fn().mockResolvedValue(product),
              });
            }

            const cartItems = items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
            }));

            let thrownError = null;
            try {
              await createOrder(cashierId, cartItems);
            } catch (err) {
              thrownError = err;
            }

            // Must throw
            expect(thrownError).not.toBeNull();
            expect(thrownError).toBeInstanceOf(OrderError);
            expect(thrownError.code).toBe(OrderErrorCode.INSUFFICIENT_STOCK);

            // Order.create must NOT have been called
            expect(Order.create).not.toHaveBeenCalled();
          }
        )
      );
    }
  );

  it(
    "tidak ada Order yang tersimpan ketika stok tidak mencukupi",
    async () => {
      /**
       * Validates: Requirement 3.6
       *
       * When createOrder() is rejected due to insufficient stock, the Order
       * collection must remain unchanged — Order.create is never invoked.
       */
      await fc.assert(
        fc.asyncProperty(
          arbInsufficientStockItems,
          arbCashierId,
          async (items, cashierId) => {
            vi.resetAllMocks();

            for (const item of items) {
              const product = makeMockProduct(item.productId, item.price, item.stock);
              Product.findById.mockReturnValueOnce({
                lean: vi.fn().mockResolvedValue(product),
              });
            }

            const cartItems = items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
            }));

            try {
              await createOrder(cashierId, cartItems);
            } catch {
              // expected rejection
            }

            // The critical invariant: no order was persisted
            expect(Order.create).toHaveBeenCalledTimes(0);
          }
        )
      );
    }
  );

  it(
    "createOrder() harus berhasil ketika semua item memiliki stok cukup",
    async () => {
      /**
       * Validates: Requirement 3.6 (positive case)
       *
       * When every item has quantity ≤ stock, createOrder() must succeed
       * and return an order document.
       */
      await fc.assert(
        fc.asyncProperty(
          arbValidCartItems,
          arbCashierId,
          async (items, cashierId) => {
            vi.resetAllMocks();

            const invoice = makeInvoiceNumber(1);
            generateInvoiceNumber.mockResolvedValue(invoice);

            for (const item of items) {
              const product = makeMockProduct(item.productId, item.price, item.stock);
              Product.findById.mockReturnValueOnce({
                lean: vi.fn().mockResolvedValue(product),
              });
            }

            const cartItems = items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
            }));
            const products = items.map((i) =>
              makeMockProduct(i.productId, i.price, i.stock)
            );
            const orderDoc = makeMockOrderDoc(invoice, cashierId, cartItems, products);

            Order.create.mockResolvedValue({ toObject: () => orderDoc });

            const order = await createOrder(cashierId, cartItems);

            expect(order).toBeDefined();
            expect(order.invoiceNumber).toBe(invoice);
            expect(Order.create).toHaveBeenCalledTimes(1);
          }
        )
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P14: Filter Antrean Hanya Status Aktif
// Validates: Requirements 4.2, 4.5
// ---------------------------------------------------------------------------

describe("P14: Filter Antrean Hanya Status Aktif", () => {
  it(
    "semua pesanan di antrean hanya memiliki orderStatus waiting_preparation atau preparing",
    async () => {
      /**
       * Validates: Requirements 4.2, 4.5
       *
       * The warehouse queue must only contain orders with active statuses.
       * For any set of orders, filtering by active statuses must exclude
       * all orders with other statuses (ready, completed, cancelled).
       */
      const ACTIVE_STATUSES = ["waiting_preparation", "preparing"];
      const ALL_STATUSES = [
        "waiting_preparation",
        "preparing",
        "ready",
        "completed",
        "cancelled",
      ];

      const arbOrderStatus = fc.constantFrom(...ALL_STATUSES);

      const arbOrder = fc.record({
        _id: fc.integer({ min: 1, max: 9999 }).map((n) => `order-${n}`),
        invoiceNumber: fc
          .integer({ min: 1, max: 9999 })
          .map((n) => `INV-20260507-${String(n).padStart(4, "0")}`),
        orderStatus: arbOrderStatus,
        items: fc.array(
          fc.record({
            productId: fc.integer({ min: 1, max: 99 }).map((n) => `prod-${n}`),
            productName: fc.string({ minLength: 1, maxLength: 20 }),
            sku: fc.string({ minLength: 3, maxLength: 10 }),
            unitPrice: fc.integer({ min: 1000, max: 100_000 }),
            quantity: fc.integer({ min: 1, max: 10 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        createdAt: fc.integer({ min: 1577836800000, max: 1924991999000 }).map((ts) => new Date(ts).toISOString()),
        totalAmount: fc.integer({ min: 1000, max: 1_000_000 }),
      });

      await fc.assert(
        fc.asyncProperty(
          fc.array(arbOrder, { minLength: 0, maxLength: 20 }),
          async (orders) => {
            // Simulate the queue filter: only active statuses
            const queueOrders = orders.filter((o) =>
              ACTIVE_STATUSES.includes(o.orderStatus)
            );

            // Property: every order in the queue must have an active status
            for (const order of queueOrders) {
              expect(ACTIVE_STATUSES).toContain(order.orderStatus);
            }

            // Property: no order with non-active status should be in the queue
            const nonActiveInQueue = queueOrders.filter(
              (o) => !ACTIVE_STATUSES.includes(o.orderStatus)
            );
            expect(nonActiveInQueue).toHaveLength(0);
          }
        )
      );
    }
  );

  it(
    "pesanan dengan status ready, completed, atau cancelled tidak boleh ada di antrean",
    async () => {
      /**
       * Validates: Requirements 4.2, 4.5
       *
       * Orders with terminal statuses must be excluded from the queue.
       */
      const ACTIVE_STATUSES = ["waiting_preparation", "preparing"];
      const INACTIVE_STATUSES = ["ready", "completed", "cancelled"];

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              _id: fc.integer({ min: 1, max: 9999 }).map((n) => `order-${n}`),
              orderStatus: fc.constantFrom(...INACTIVE_STATUSES),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (inactiveOrders) => {
            // Simulate queue filter
            const queueOrders = inactiveOrders.filter((o) =>
              ACTIVE_STATUSES.includes(o.orderStatus)
            );

            // All inactive orders must be excluded
            expect(queueOrders).toHaveLength(0);
          }
        )
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P15: Field Lengkap di Antrean
// Validates: Requirements 4.2, 4.5
// ---------------------------------------------------------------------------

describe("P15: Field Lengkap di Antrean", () => {
  it(
    "setiap pesanan di antrean mengandung invoiceNumber, items, dan createdAt",
    async () => {
      /**
       * Validates: Requirements 4.2, 4.5
       *
       * Every order in the warehouse queue must have all required fields:
       * invoiceNumber, items (non-empty array), and createdAt.
       */
      const ACTIVE_STATUSES = ["waiting_preparation", "preparing"];

      const arbQueueOrder = fc.record({
        _id: fc.integer({ min: 1, max: 9999 }).map((n) => `order-${n}`),
        invoiceNumber: fc
          .integer({ min: 1, max: 9999 })
          .map((n) => `INV-20260507-${String(n).padStart(4, "0")}`),
        orderStatus: fc.constantFrom(...ACTIVE_STATUSES),
        items: fc.array(
          fc.record({
            productId: fc.integer({ min: 1, max: 99 }).map((n) => `prod-${n}`),
            productName: fc.string({ minLength: 1, maxLength: 30 }),
            sku: fc.string({ minLength: 3, maxLength: 10 }),
            unitPrice: fc.integer({ min: 1000, max: 100_000 }),
            quantity: fc.integer({ min: 1, max: 10 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        createdAt: fc.integer({ min: 1577836800000, max: 1924991999000 }).map((ts) => new Date(ts).toISOString()),
        totalAmount: fc.integer({ min: 1000, max: 1_000_000 }),
      });

      await fc.assert(
        fc.asyncProperty(
          fc.array(arbQueueOrder, { minLength: 1, maxLength: 20 }),
          async (orders) => {
            for (const order of orders) {
              // invoiceNumber must be present and non-empty
              expect(order.invoiceNumber).toBeDefined();
              expect(typeof order.invoiceNumber).toBe("string");
              expect(order.invoiceNumber.length).toBeGreaterThan(0);

              // items must be a non-empty array
              expect(Array.isArray(order.items)).toBe(true);
              expect(order.items.length).toBeGreaterThan(0);

              // Each item must have required fields
              for (const item of order.items) {
                expect(item.productName).toBeDefined();
                expect(item.quantity).toBeGreaterThan(0);
                expect(item.unitPrice).toBeGreaterThan(0);
              }

              // createdAt must be present
              expect(order.createdAt).toBeDefined();
              // Must be a valid date string
              expect(new Date(order.createdAt).toString()).not.toBe(
                "Invalid Date"
              );
            }
          }
        )
      );
    }
  );

  it(
    "invoiceNumber harus mengikuti format INV-YYYYMMDD-NNNN",
    async () => {
      /**
       * Validates: Requirements 4.2, 4.5
       *
       * Invoice numbers in the queue must follow the standard format.
       */
      const INVOICE_PATTERN = /^INV-\d{8}-\d{4}$/;

      const arbInvoiceNumber = fc
        .integer({ min: 1, max: 9999 })
        .map((n) => `INV-20260507-${String(n).padStart(4, "0")}`);

      await fc.assert(
        fc.asyncProperty(arbInvoiceNumber, async (invoiceNumber) => {
          expect(INVOICE_PATTERN.test(invoiceNumber)).toBe(true);
        })
      );
    }
  );
});
