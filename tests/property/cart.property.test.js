/**
 * Property-Based Tests: Cart (P10)
 *
 * Validates: Requirements 3.2, 3.3
 *
 * P10: Total Cart Akurat — setelah addItem(), totalAmount selalu sama dengan
 *      sum(unitPrice × quantity) untuk semua item di keranjang.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import { act } from "@testing-library/react";
import useCart from "@/hooks/useCart";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset the Zustand cart store to a clean state between runs. */
function resetCart() {
  act(() => {
    useCart.getState().clearCart();
  });
}

/**
 * Compute the expected total from an items array.
 * @param {Array<{price: number, quantity: number}>} items
 * @returns {number}
 */
function expectedTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * A single cart item payload.
 * - price: positive integer rupiah (1 – 1_000_000)
 * - stock: positive integer (1 – 100) — must be ≥ quantity so addItem works
 * - quantity: how many times we call addItem for this product (1 – stock)
 */
const arbCartItem = fc
  .record({
    productId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    price: fc.integer({ min: 1, max: 1_000_000 }),
    stock: fc.integer({ min: 1, max: 100 }),
  })
  .chain((item) =>
    fc
      .integer({ min: 1, max: item.stock })
      .map((quantity) => ({ ...item, quantity }))
  );

/**
 * An array of cart items with unique productIds (so each maps to a distinct
 * cart slot and quantities don't accidentally merge across items).
 */
const arbCartItems = fc
  .array(arbCartItem, { minLength: 1, maxLength: 10 })
  .map((items) => {
    // Deduplicate by productId — keep first occurrence
    const seen = new Set();
    return items.filter((item) => {
      if (seen.has(item.productId)) return false;
      seen.add(item.productId);
      return true;
    });
  })
  .filter((items) => items.length > 0);

// ---------------------------------------------------------------------------
// P10: Total Cart Akurat
// Validates: Requirements 3.2, 3.3
// ---------------------------------------------------------------------------

describe("P10: Total Cart Akurat", () => {
  beforeEach(() => {
    resetCart();
  });

  it(
    "totalAmount harus selalu sama dengan sum(price × quantity) setelah addItem()",
    () => {
      /**
       * Validates: Requirements 3.2, 3.3
       *
       * For any arbitrary list of cart items (each with a unique productId,
       * positive price, and quantity within stock), after calling addItem()
       * the required number of times, the store's totalAmount must equal
       * the manual sum of (price × quantity) for every item.
       */
      fc.assert(
        fc.property(arbCartItems, (items) => {
          // Reset cart before each property run
          act(() => {
            useCart.getState().clearCart();
          });

          // Add each item the specified number of times
          act(() => {
            for (const item of items) {
              const product = {
                _id: item.productId,
                name: item.name,
                price: item.price,
                stock: item.stock,
              };
              for (let i = 0; i < item.quantity; i++) {
                useCart.getState().addItem(product);
              }
            }
          });

          const state = useCart.getState();
          const manualTotal = expectedTotal(
            state.items.map((i) => ({ price: i.price, quantity: i.quantity }))
          );

          expect(state.totalAmount).toBe(manualTotal);
        })
      );
    }
  );

  it(
    "totalAmount harus 0 setelah clearCart() tanpa memandang item sebelumnya",
    () => {
      /**
       * Validates: Requirement 3.2
       *
       * After clearCart(), totalAmount must always be 0 regardless of what
       * was in the cart before.
       */
      fc.assert(
        fc.property(arbCartItems, (items) => {
          act(() => {
            useCart.getState().clearCart();
          });

          act(() => {
            for (const item of items) {
              const product = {
                _id: item.productId,
                name: item.name,
                price: item.price,
                stock: item.stock,
              };
              useCart.getState().addItem(product);
            }
          });

          act(() => {
            useCart.getState().clearCart();
          });

          expect(useCart.getState().totalAmount).toBe(0);
        })
      );
    }
  );

  it(
    "totalAmount harus konsisten dengan items array setelah removeItem()",
    () => {
      /**
       * Validates: Requirement 3.2
       *
       * After removing an item, totalAmount must still equal the manual sum
       * of the remaining items. The invariant holds after any mutation.
       */
      fc.assert(
        fc.property(arbCartItems, (items) => {
          fc.pre(items.length >= 2);

          act(() => {
            useCart.getState().clearCart();
          });

          act(() => {
            for (const item of items) {
              const product = {
                _id: item.productId,
                name: item.name,
                price: item.price,
                stock: item.stock,
              };
              useCart.getState().addItem(product);
            }
          });

          // Remove the first item
          act(() => {
            useCart.getState().removeItem(items[0].productId);
          });

          const state = useCart.getState();
          const manualTotal = expectedTotal(
            state.items.map((i) => ({ price: i.price, quantity: i.quantity }))
          );

          expect(state.totalAmount).toBe(manualTotal);
        })
      );
    }
  );

  it(
    "totalAmount tidak boleh negatif untuk input apapun",
    () => {
      /**
       * Validates: Requirement 3.2
       *
       * Since prices and quantities are always positive integers, totalAmount
       * must never be negative.
       */
      fc.assert(
        fc.property(arbCartItems, (items) => {
          act(() => {
            useCart.getState().clearCart();
          });

          act(() => {
            for (const item of items) {
              const product = {
                _id: item.productId,
                name: item.name,
                price: item.price,
                stock: item.stock,
              };
              useCart.getState().addItem(product);
            }
          });

          expect(useCart.getState().totalAmount).toBeGreaterThanOrEqual(0);
        })
      );
    }
  );
});
