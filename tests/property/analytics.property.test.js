/**
 * Property-Based Tests: Analytics (P21–P23)
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 *
 * P21: Metrik Dashboard Akurat — totalRevenue = sum(totalAmount),
 *      totalOrders = count, averageOrderValue = totalRevenue / totalOrders
 *      untuk setiap set pesanan completed.
 *
 * P22: Grafik Pendapatan Akurat Per Hari — nilai revenue per hari di grafik
 *      sama dengan sum(totalAmount) pesanan completed pada hari tersebut.
 *
 * P23: CSV Export Lengkap dan Akurat — setiap pesanan completed menghasilkan
 *      satu baris CSV dengan semua kolom wajib dan nilai yang sesuai database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/Order", () => ({
  default: {
    aggregate: vi.fn(),
  },
}));

vi.mock("@/models/Invoice", () => ({
  default: {
    find: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import Order from "@/models/Order";
import Invoice from "@/models/Invoice";
import {
  getMetrics,
  getChartData,
  exportCSV,
} from "@/server/services/analytics.service";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A valid rupiah amount (integer) */
const arbAmount = fc.integer({ min: 1000, max: 10_000_000 });

/** A valid order count */
const arbOrderCount = fc.integer({ min: 1, max: 1000 });

/** A valid date string in YYYY-MM-DD format */
const arbDateStr = fc
  .integer({ min: 0, max: 364 })
  .map((offset) => {
    const d = new Date("2026-01-01T00:00:00.000Z");
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  });

/** A valid range string */
const arbRange = fc.constantFrom("daily", "weekly", "monthly");

/** A valid product name */
const arbProductName = fc.string({ minLength: 1, maxLength: 30 }).filter(
  (s) => !s.includes(",") && !s.includes('"') && !s.includes("\n")
);

/** A valid cashier name */
const arbCashierName = fc.string({ minLength: 1, maxLength: 30 }).filter(
  (s) => !s.includes(",") && !s.includes('"') && !s.includes("\n")
);

/** A valid invoice number */
const arbInvoiceNumber = fc
  .integer({ min: 1, max: 9999 })
  .map((n) => `INV-20260507-${String(n).padStart(4, "0")}`);

/** A valid payment method */
const arbPaymentMethod = fc.constantFrom("CASH", "QRIS");

/** A single invoice item */
const arbInvoiceItem = fc.record({
  productName: arbProductName,
  sku: fc.string({ minLength: 3, maxLength: 10 }).filter((s) => !s.includes(",")),
  unitPrice: arbAmount,
  quantity: fc.integer({ min: 1, max: 20 }),
  subtotal: arbAmount,
});

/** A complete invoice document */
const arbInvoice = fc.record({
  _id: fc.integer({ min: 1, max: 99999 }).map((n) => `inv-${n}`),
  invoiceNumber: arbInvoiceNumber,
  cashierName: arbCashierName,
  items: fc.array(arbInvoiceItem, { minLength: 1, maxLength: 5 }),
  totalAmount: arbAmount,
  paymentMethod: arbPaymentMethod,
  transactionAt: fc
    .integer({ min: 1577836800000, max: 1924991999000 })
    .map((ts) => new Date(ts)),
});

// ---------------------------------------------------------------------------
// P21: Metrik Dashboard Akurat
// Validates: Requirements 7.1, 7.2
// ---------------------------------------------------------------------------

describe("P21: Metrik Dashboard Akurat", () => {
  /**
   * Validates: Requirements 7.1, 7.2
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "totalRevenue harus sama dengan sum(totalAmount) dari semua pesanan completed",
    async () => {
      /**
       * Validates: Requirements 7.1, 7.2
       *
       * For any set of completed orders, totalRevenue must equal the sum of
       * all totalAmount values. This is the core revenue calculation invariant.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbAmount, { minLength: 1, maxLength: 50 }),
          arbRange,
          async (amounts, range) => {
            vi.clearAllMocks();

            const expectedRevenue = amounts.reduce((sum, a) => sum + a, 0);
            const expectedOrders = amounts.length;

            Order.aggregate.mockResolvedValue([
              {
                _id: "OFFLINE",
                revenue: expectedRevenue,
                orders: expectedOrders,
              },
            ]);

            const result = await getMetrics(range);

            // Core property: totalRevenue = sum(totalAmount)
            expect(result.totalRevenue).toBe(expectedRevenue);
          }
        )
      );
    }
  );

  it(
    "totalOrders harus sama dengan jumlah pesanan completed",
    async () => {
      /**
       * Validates: Requirements 7.1, 7.2
       *
       * totalOrders must equal the count of completed orders in the range.
       */
      await fc.assert(
        fc.asyncProperty(
          arbOrderCount,
          arbAmount,
          arbRange,
          async (count, totalRevenue, range) => {
            vi.clearAllMocks();

            Order.aggregate.mockResolvedValue([
              { _id: "OFFLINE", revenue: totalRevenue, orders: count },
            ]);

            const result = await getMetrics(range);

            expect(result.totalOrders).toBe(count);
          }
        )
      );
    }
  );

  it(
    "averageOrderValue harus sama dengan totalRevenue / totalOrders",
    async () => {
      /**
       * Validates: Requirements 7.1, 7.2
       *
       * averageOrderValue = totalRevenue / totalOrders (rounded to integer).
       * This must hold for any positive totalOrders value.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbAmount, { minLength: 1, maxLength: 50 }),
          arbRange,
          async (amounts, range) => {
            vi.clearAllMocks();

            const totalRevenue = amounts.reduce((sum, a) => sum + a, 0);
            const totalOrders = amounts.length;
            const expectedAvg = Math.round(totalRevenue / totalOrders);

            Order.aggregate.mockResolvedValue([
              { _id: "OFFLINE", revenue: totalRevenue, orders: totalOrders },
            ]);

            const result = await getMetrics(range);

            // Core property: averageOrderValue = totalRevenue / totalOrders
            expect(result.averageOrderValue).toBe(expectedAvg);
          }
        )
      );
    }
  );

  it(
    "averageOrderValue harus 0 ketika tidak ada pesanan (hindari division by zero)",
    async () => {
      /**
       * Validates: Requirements 7.1, 7.6
       *
       * When there are no completed orders, averageOrderValue must be 0
       * (not NaN, Infinity, or an error). Division by zero must be handled.
       */
      await fc.assert(
        fc.asyncProperty(arbRange, async (range) => {
          vi.clearAllMocks();

          // No orders in the range
          Order.aggregate.mockResolvedValue([]);

          const result = await getMetrics(range);

          expect(result.totalRevenue).toBe(0);
          expect(result.totalOrders).toBe(0);
          expect(result.averageOrderValue).toBe(0);
          expect(Number.isFinite(result.averageOrderValue)).toBe(true);
          expect(Number.isNaN(result.averageOrderValue)).toBe(false);
        })
      );
    }
  );

  it(
    "semua nilai metrik harus berupa integer non-negatif",
    async () => {
      /**
       * Validates: Requirements 7.1, 7.2
       *
       * All monetary values must be non-negative integers (rupiah).
       * No floating-point values should appear in the metrics.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbAmount, { minLength: 0, maxLength: 50 }),
          arbRange,
          async (amounts, range) => {
            vi.clearAllMocks();

            if (amounts.length === 0) {
              Order.aggregate.mockResolvedValue([]);
            } else {
              const totalRevenue = amounts.reduce((sum, a) => sum + a, 0);
              Order.aggregate.mockResolvedValue([
                { _id: "OFFLINE", revenue: totalRevenue, orders: amounts.length },
              ]);
            }

            const result = await getMetrics(range);

            expect(result.totalRevenue).toBeGreaterThanOrEqual(0);
            expect(result.totalOrders).toBeGreaterThanOrEqual(0);
            expect(result.averageOrderValue).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(result.totalRevenue)).toBe(true);
            expect(Number.isInteger(result.totalOrders)).toBe(true);
            expect(Number.isInteger(result.averageOrderValue)).toBe(true);
          }
        )
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P22: Grafik Pendapatan Akurat Per Hari
// Validates: Requirement 7.3
// ---------------------------------------------------------------------------

describe("P22: Grafik Pendapatan Akurat Per Hari", () => {
  /**
   * Validates: Requirement 7.3
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "revenue per hari di grafik harus sama dengan sum(totalAmount) pesanan pada hari tersebut",
    async () => {
      /**
       * Validates: Requirement 7.3
       *
       * For any set of daily revenue data, the chart must accurately reflect
       * the sum of totalAmount for each day. No revenue must be lost or added.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              date: arbDateStr,
              revenue: arbAmount,
            }),
            { minLength: 1, maxLength: 30 }
          ),
          arbRange,
          async (dailyData, range) => {
            vi.clearAllMocks();

            // Deduplicate by date (sum revenues for same date)
            const revenueByDate = {};
            for (const entry of dailyData) {
              revenueByDate[entry.date] =
                (revenueByDate[entry.date] || 0) + entry.revenue;
            }

            // Mock aggregate to return the deduplicated data
            const aggregateResult = Object.entries(revenueByDate).map(
              ([date, revenue]) => ({ _id: date, revenue })
            );
            Order.aggregate.mockResolvedValue(aggregateResult);

            const chartData = await getChartData(range);

            // Property: for each date in the aggregate result, the chart must
            // show the correct revenue
            for (const [date, expectedRevenue] of Object.entries(revenueByDate)) {
              const chartEntry = chartData.find((d) => d.date === date);
              if (chartEntry) {
                // If the date is within the range, revenue must match
                expect(chartEntry.revenue).toBe(expectedRevenue);
              }
            }
          }
        )
      );
    }
  );

  it(
    "setiap entri grafik harus memiliki field date dan revenue",
    async () => {
      /**
       * Validates: Requirement 7.3
       *
       * Every entry in the chart data must have both a date string and a
       * numeric revenue value.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({ date: arbDateStr, revenue: arbAmount }),
            { minLength: 0, maxLength: 20 }
          ),
          arbRange,
          async (dailyData, range) => {
            vi.clearAllMocks();

            Order.aggregate.mockResolvedValue(
              dailyData.map((d) => ({ _id: d.date, revenue: d.revenue }))
            );

            const chartData = await getChartData(range);

            for (const entry of chartData) {
              // Must have date field
              expect(entry).toHaveProperty("date");
              expect(typeof entry.date).toBe("string");
              expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

              // Must have revenue field
              expect(entry).toHaveProperty("revenue");
              expect(typeof entry.revenue).toBe("number");
              expect(entry.revenue).toBeGreaterThanOrEqual(0);
            }
          }
        )
      );
    }
  );

  it(
    "hari tanpa pesanan harus memiliki revenue 0 (bukan undefined atau null)",
    async () => {
      /**
       * Validates: Requirement 7.3
       *
       * Days with no completed orders must appear in the chart with revenue = 0,
       * not as missing entries. This ensures the chart shows a complete timeline.
       */
      await fc.assert(
        fc.asyncProperty(arbRange, async (range) => {
          vi.clearAllMocks();

          // No orders at all
          Order.aggregate.mockResolvedValue([]);

          const chartData = await getChartData(range);

          // All entries must have revenue = 0
          for (const entry of chartData) {
            expect(entry.revenue).toBe(0);
          }

          // Must have at least one entry (today)
          expect(chartData.length).toBeGreaterThanOrEqual(1);
        })
      );
    }
  );

  it(
    "data grafik harus diurutkan berdasarkan tanggal secara ascending",
    async () => {
      /**
       * Validates: Requirement 7.3
       *
       * Chart data must be sorted by date in ascending order so the chart
       * renders correctly from left (oldest) to right (newest).
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({ date: arbDateStr, revenue: arbAmount }),
            { minLength: 2, maxLength: 30 }
          ),
          arbRange,
          async (dailyData, range) => {
            vi.clearAllMocks();

            Order.aggregate.mockResolvedValue(
              dailyData.map((d) => ({ _id: d.date, revenue: d.revenue }))
            );

            const chartData = await getChartData(range);

            // Dates must be in ascending order
            for (let i = 1; i < chartData.length; i++) {
              expect(chartData[i].date >= chartData[i - 1].date).toBe(true);
            }
          }
        )
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P23: CSV Export Lengkap dan Akurat
// Validates: Requirements 7.4, 7.5
// ---------------------------------------------------------------------------

describe("P23: CSV Export Lengkap dan Akurat", () => {
  /**
   * Validates: Requirements 7.4, 7.5
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "setiap pesanan completed harus menghasilkan tepat satu baris CSV",
    async () => {
      /**
       * Validates: Requirements 7.4, 7.5
       *
       * For any set of completed orders, the CSV must contain exactly one
       * data row per order (plus one header row).
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbInvoice, { minLength: 1, maxLength: 20 }),
          arbRange,
          async (invoices, range) => {
            vi.clearAllMocks();

            Invoice.find.mockReturnValue({
              sort: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue(invoices),
              }),
            });

            const csv = await exportCSV(range);
            const lines = csv.split("\n").filter(Boolean);

            // 1 header + N data rows
            expect(lines).toHaveLength(invoices.length + 1);
          }
        )
      );
    }
  );

  it(
    "CSV harus memiliki semua kolom wajib di header",
    async () => {
      /**
       * Validates: Requirements 7.4, 7.5
       *
       * The CSV header must always contain all required columns regardless
       * of the range or data.
       */
      await fc.assert(
        fc.asyncProperty(arbRange, async (range) => {
          vi.clearAllMocks();

          Invoice.find.mockReturnValue({
            sort: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([]),
            }),
          });

          const csv = await exportCSV(range);
          const header = csv.split("\n")[0];

          expect(header).toContain("invoiceNumber");
          expect(header).toContain("tanggal");
          expect(header).toContain("nama Kasir");
          expect(header).toContain("items");
          expect(header).toContain("totalAmount");
          expect(header).toContain("metode pembayaran");
        })
      );
    }
  );

  it(
    "setiap baris CSV harus mengandung invoiceNumber yang sesuai",
    async () => {
      /**
       * Validates: Requirements 7.4, 7.5
       *
       * Each data row in the CSV must contain the correct invoiceNumber
       * matching the corresponding order in the database.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbInvoice, { minLength: 1, maxLength: 10 }),
          arbRange,
          async (invoices, range) => {
            vi.clearAllMocks();

            Invoice.find.mockReturnValue({
              sort: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue(invoices),
              }),
            });

            const csv = await exportCSV(range);

            // Every invoice number must appear in the CSV
            for (const invoice of invoices) {
              expect(csv).toContain(invoice.invoiceNumber);
            }
          }
        )
      );
    }
  );

  it(
    "setiap baris CSV harus mengandung totalAmount yang sesuai",
    async () => {
      /**
       * Validates: Requirements 7.4, 7.5
       *
       * Each data row must contain the correct totalAmount value.
       * Monetary values must not be altered during CSV generation.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbInvoice, { minLength: 1, maxLength: 10 }),
          arbRange,
          async (invoices, range) => {
            vi.clearAllMocks();

            Invoice.find.mockReturnValue({
              sort: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue(invoices),
              }),
            });

            const csv = await exportCSV(range);

            // Every totalAmount must appear in the CSV
            for (const invoice of invoices) {
              expect(csv).toContain(String(invoice.totalAmount));
            }
          }
        )
      );
    }
  );

  it(
    "setiap baris CSV harus mengandung nama kasir yang sesuai",
    async () => {
      /**
       * Validates: Requirements 7.4, 7.5
       *
       * Each data row must contain the cashier name snapshot from the Invoice.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbInvoice, { minLength: 1, maxLength: 10 }),
          arbRange,
          async (invoices, range) => {
            vi.clearAllMocks();

            Invoice.find.mockReturnValue({
              sort: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue(invoices),
              }),
            });

            const csv = await exportCSV(range);

            // Every cashier name must appear in the CSV
            for (const invoice of invoices) {
              expect(csv).toContain(invoice.cashierName);
            }
          }
        )
      );
    }
  );

  it(
    "setiap baris CSV harus mengandung metode pembayaran yang sesuai",
    async () => {
      /**
       * Validates: Requirements 7.4, 7.5
       *
       * Each data row must contain the correct payment method (CASH or QRIS).
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbInvoice, { minLength: 1, maxLength: 10 }),
          arbRange,
          async (invoices, range) => {
            vi.clearAllMocks();

            Invoice.find.mockReturnValue({
              sort: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue(invoices),
              }),
            });

            const csv = await exportCSV(range);

            // Every payment method must appear in the CSV
            for (const invoice of invoices) {
              expect(csv).toContain(invoice.paymentMethod);
            }
          }
        )
      );
    }
  );

  it(
    "CSV harus berupa string yang valid (tidak kosong, tidak undefined)",
    async () => {
      /**
       * Validates: Requirements 7.4, 7.5
       *
       * The exportCSV function must always return a valid non-empty string,
       * even when there are no orders (at minimum the header row).
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbInvoice, { minLength: 0, maxLength: 20 }),
          arbRange,
          async (invoices, range) => {
            vi.clearAllMocks();

            Invoice.find.mockReturnValue({
              sort: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue(invoices),
              }),
            });

            const csv = await exportCSV(range);

            expect(typeof csv).toBe("string");
            expect(csv.length).toBeGreaterThan(0);
            // Must at least have the header
            expect(csv).toContain("invoiceNumber");
          }
        )
      );
    }
  );
});
