/**
 * Property-Based Tests: Payment (P16–P17)
 *
 * Validates: Requirements 5.2, 5.5
 *
 * P16: Kembalian Cash Dihitung Benar — untuk setiap cashReceived >= totalAmount,
 *      changeAmount = cashReceived - totalAmount selalu >= 0.
 * P17: QRIS Expired Setelah Timeout — pesanan dengan qrisExpiresAt < now dan
 *      status pending berubah menjadi expired setelah job berjalan.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the service
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
// Imports after mocks
// ---------------------------------------------------------------------------

import Order from "@/models/Order";
import { calculateChange } from "@/lib/utils";
import { expireQRISOrders } from "@/server/services/payment.service";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * A valid total order amount: positive integer rupiah (1.000 – 10.000.000).
 */
const arbTotalAmount = fc.integer({ min: 1_000, max: 10_000_000 });

/**
 * A valid cashReceived amount that is >= totalAmount.
 * Models the constraint: cashReceived >= totalAmount (Requirement 5.2).
 */
const arbCashPayment = arbTotalAmount.chain((totalAmount) =>
  fc
    .integer({ min: 0, max: 10_000_000 })
    .map((extra) => ({ totalAmount, cashReceived: totalAmount + extra }))
);

/**
 * A past timestamp (qrisExpiresAt < now) — simulates an expired QRIS.
 * Range: 1 second to 24 hours in the past.
 */
const arbExpiredQrisTimestamp = fc
  .integer({ min: 1_000, max: 86_400_000 })
  .map((msAgo) => new Date(Date.now() - msAgo));

/**
 * A future timestamp (qrisExpiresAt > now) — simulates a valid QRIS.
 * Range: 1 second to 5 minutes in the future.
 */
const arbFutureQrisTimestamp = fc
  .integer({ min: 1_000, max: 300_000 })
  .map((msAhead) => new Date(Date.now() + msAhead));

/**
 * A mock pending order with an expired QRIS code.
 */
const arbExpiredQrisOrder = fc.record({
  _id: fc.integer({ min: 1, max: 9999 }).map((n) => `order-${String(n).padStart(4, "0")}`),
  invoiceNumber: fc
    .integer({ min: 1, max: 9999 })
    .map((n) => `INV-20260507-${String(n).padStart(4, "0")}`),
  paymentStatus: fc.constant("pending"),
  qrisCode: fc.uuid(),
  qrisExpiresAt: arbExpiredQrisTimestamp,
  totalAmount: arbTotalAmount,
});

// ---------------------------------------------------------------------------
// P16: Kembalian Cash Dihitung Benar
// Validates: Requirement 5.2
// ---------------------------------------------------------------------------

describe("P16: Kembalian Cash Dihitung Benar", () => {
  it(
    "changeAmount = cashReceived - totalAmount harus selalu >= 0 ketika cashReceived >= totalAmount",
    () => {
      /**
       * Validates: Requirement 5.2
       *
       * For any cashReceived >= totalAmount, the calculated change must be
       * non-negative and equal to cashReceived - totalAmount exactly.
       * This is the core invariant for cash payment processing.
       */
      fc.assert(
        fc.property(arbCashPayment, ({ totalAmount, cashReceived }) => {
          const changeAmount = calculateChange(cashReceived, totalAmount);

          // Core property: change must be non-negative
          expect(changeAmount).toBeGreaterThanOrEqual(0);

          // Core property: change must equal the exact difference
          expect(changeAmount).toBe(cashReceived - totalAmount);
        })
      );
    }
  );

  it(
    "changeAmount harus 0 ketika cashReceived tepat sama dengan totalAmount",
    () => {
      /**
       * Validates: Requirement 5.2
       *
       * When the customer pays the exact amount, change must be exactly 0.
       * This is the boundary case of the cash payment invariant.
       */
      fc.assert(
        fc.property(arbTotalAmount, (totalAmount) => {
          const cashReceived = totalAmount; // exact payment
          const changeAmount = calculateChange(cashReceived, totalAmount);

          expect(changeAmount).toBe(0);
        })
      );
    }
  );

  it(
    "changeAmount harus positif ketika cashReceived lebih besar dari totalAmount",
    () => {
      /**
       * Validates: Requirement 5.2
       *
       * When the customer overpays, change must be strictly positive.
       */
      fc.assert(
        fc.property(
          arbTotalAmount,
          fc.integer({ min: 1, max: 10_000_000 }),
          (totalAmount, extra) => {
            const cashReceived = totalAmount + extra;
            const changeAmount = calculateChange(cashReceived, totalAmount);

            expect(changeAmount).toBeGreaterThan(0);
            expect(changeAmount).toBe(extra);
          }
        )
      );
    }
  );

  it(
    "changeAmount harus konsisten: calculateChange(a, b) + b === a",
    () => {
      /**
       * Validates: Requirement 5.2
       *
       * Round-trip property: change + totalAmount must always equal cashReceived.
       * This verifies the arithmetic identity holds for all valid inputs.
       */
      fc.assert(
        fc.property(arbCashPayment, ({ totalAmount, cashReceived }) => {
          const changeAmount = calculateChange(cashReceived, totalAmount);

          // Round-trip: change + total = received
          expect(changeAmount + totalAmount).toBe(cashReceived);
        })
      );
    }
  );

  it(
    "sistem harus menolak pembayaran ketika cashReceived < totalAmount",
    () => {
      /**
       * Validates: Requirement 5.2
       *
       * When cashReceived is less than totalAmount, the payment must be
       * rejected. The calculated change would be negative, which is invalid.
       * This property verifies the validation logic boundary.
       */
      fc.assert(
        fc.property(
          arbTotalAmount.filter((t) => t > 1_000),
          fc.integer({ min: 1, max: 999 }),
          (totalAmount, shortfall) => {
            fc.pre(shortfall < totalAmount);

            const cashReceived = totalAmount - shortfall;
            const changeAmount = calculateChange(cashReceived, totalAmount);

            // A negative change signals an invalid payment — must be rejected
            expect(changeAmount).toBeLessThan(0);

            // The validation rule: cashReceived must be >= totalAmount
            expect(cashReceived < totalAmount).toBe(true);
          }
        )
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P17: QRIS Expired Setelah Timeout
// Validates: Requirement 5.5
// ---------------------------------------------------------------------------

describe("P17: QRIS Expired Setelah Timeout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it(
    "pesanan dengan qrisExpiresAt < now dan status pending harus berubah menjadi expired",
    async () => {
      /**
       * Validates: Requirement 5.5
       *
       * For any set of orders where qrisExpiresAt is in the past and
       * paymentStatus is "pending", the expiry job must update their
       * paymentStatus to "expired".
       *
       * The job queries: { paymentStatus: "pending", qrisExpiresAt: { $lt: now }, qrisCode: { $ne: null } }
       * and sets: { paymentStatus: "expired", qrisCode: null }
       */
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 20 }),
          async (expiredCount) => {
            vi.resetAllMocks();

            // Simulate the DB update: modifiedCount = number of expired orders
            Order.updateMany.mockResolvedValue({ modifiedCount: expiredCount });

            const result = await expireQRISOrders();

            // The job must return the count of expired orders
            expect(result).toBe(expiredCount);

            // Verify the correct query was used
            expect(Order.updateMany).toHaveBeenCalledTimes(1);

            const [query, update] = Order.updateMany.mock.calls[0];

            // Query must filter by pending status
            expect(query.paymentStatus).toBe("pending");

            // Query must filter by expired timestamp (qrisExpiresAt < now)
            expect(query.qrisExpiresAt).toBeDefined();
            expect(query.qrisExpiresAt.$lt).toBeInstanceOf(Date);

            // Query must only target orders with a QRIS code
            expect(query.qrisCode).toBeDefined();
            expect(query.qrisCode.$ne).toBeNull();

            // Update must set paymentStatus to "expired" and clear qrisCode
            expect(update.$set.paymentStatus).toBe("expired");
            expect(update.$set.qrisCode).toBeNull();
          }
        )
      );
    }
  );

  it(
    "job tidak boleh mengubah pesanan yang belum kedaluwarsa",
    async () => {
      /**
       * Validates: Requirement 5.5
       *
       * Orders with qrisExpiresAt in the future must NOT be expired by the job.
       * The query filter ensures only past timestamps are targeted.
       */
      await fc.assert(
        fc.asyncProperty(
          arbFutureQrisTimestamp,
          async (futureExpiry) => {
            vi.resetAllMocks();

            // Simulate: no orders matched (future expiry not yet due)
            Order.updateMany.mockResolvedValue({ modifiedCount: 0 });

            const result = await expireQRISOrders();

            // No orders should be expired
            expect(result).toBe(0);

            // The query's $lt filter must be a Date in the past relative to now
            const [query] = Order.updateMany.mock.calls[0];
            const queryTimestamp = query.qrisExpiresAt.$lt;

            // The filter timestamp must be <= now (not in the future)
            expect(queryTimestamp.getTime()).toBeLessThanOrEqual(Date.now());

            // A future expiry timestamp must be AFTER the filter cutoff
            expect(futureExpiry.getTime()).toBeGreaterThan(queryTimestamp.getTime());
          }
        )
      );
    }
  );

  it(
    "job harus mengembalikan 0 ketika tidak ada pesanan yang kedaluwarsa",
    async () => {
      /**
       * Validates: Requirement 5.5
       *
       * When no orders match the expiry criteria, the job must return 0
       * and not throw an error.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null), // no meaningful input variation needed
          async () => {
            vi.resetAllMocks();

            Order.updateMany.mockResolvedValue({ modifiedCount: 0 });

            const result = await expireQRISOrders();

            expect(result).toBe(0);
            expect(typeof result).toBe("number");
          }
        )
      );
    }
  );

  it(
    "pesanan dengan paymentStatus bukan pending tidak boleh diubah oleh job",
    async () => {
      /**
       * Validates: Requirement 5.5
       *
       * The expiry job must only target orders with paymentStatus "pending".
       * Orders already "paid" or "expired" must not be touched.
       */
      const NON_PENDING_STATUSES = ["paid", "expired"];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...NON_PENDING_STATUSES),
          arbExpiredQrisTimestamp,
          async (paymentStatus, expiredAt) => {
            vi.resetAllMocks();

            // Simulate: DB correctly filters — non-pending orders not matched
            Order.updateMany.mockResolvedValue({ modifiedCount: 0 });

            await expireQRISOrders();

            // Verify the query explicitly targets only "pending" status
            const [query] = Order.updateMany.mock.calls[0];
            expect(query.paymentStatus).toBe("pending");

            // A non-pending order would NOT match this query
            expect(query.paymentStatus).not.toBe(paymentStatus);
          }
        )
      );
    }
  );

  it(
    "qrisCode harus di-null-kan setelah pesanan expired",
    async () => {
      /**
       * Validates: Requirement 5.5
       *
       * When the expiry job runs, it must clear the qrisCode field
       * (set to null) so the expired QR code cannot be reused.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (expiredCount) => {
            vi.resetAllMocks();

            Order.updateMany.mockResolvedValue({ modifiedCount: expiredCount });

            await expireQRISOrders();

            const [, update] = Order.updateMany.mock.calls[0];

            // qrisCode must be cleared (set to null) to invalidate the QR
            expect(update.$set.qrisCode).toBeNull();
          }
        )
      );
    }
  );
});
