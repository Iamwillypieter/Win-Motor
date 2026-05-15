"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Compute total amount from items array.
 * @param {Array} items
 * @returns {number}
 */
function computeTotalAmount(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/**
 * Compute total item count from items array.
 * @param {Array} items
 * @returns {number}
 */
function computeTotalItems(items) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Zustand cart store for the public Online Store.
 * Persisted to localStorage so the cart survives page refreshes.
 *
 * CartItem shape:
 *   { productId, name, price, quantity, stock, imageUrl }
 *
 * All monetary values are integers (rupiah).
 */
const useOnlineCart = create(
  persist(
    (set, get) => ({
      /** @type {Array<{productId: string, name: string, price: number, quantity: number, stock: number, imageUrl: string|null}>} */
      items: [],

      /** Total amount in rupiah (sum of price × quantity). Kept in sync with items. */
      totalAmount: 0,

      /** Total number of items (sum of quantities). Kept in sync with items. */
      totalItems: 0,

      /**
       * Add a product to the cart.
       * If the product is already in the cart, increment quantity (up to stock limit).
       * @param {{ _id: string, name: string, price: number, stock: number, imageUrl?: string }} product
       */
      addItem(product) {
        const productId = product._id?.toString() ?? product.productId;
        set((state) => {
          const existing = state.items.find(
            (item) => item.productId === productId
          );

          let newItems;

          if (existing) {
            // Increment quantity, capped at stock
            if (existing.quantity >= existing.stock) {
              return state; // already at max stock
            }
            newItems = state.items.map((item) =>
              item.productId === productId
                ? { ...item, quantity: item.quantity + 1 }
                : item
            );
          } else {
            // New item — only add if stock > 0
            if (product.stock <= 0) {
              return state;
            }
            newItems = [
              ...state.items,
              {
                productId,
                name: product.name,
                price: product.price,
                quantity: 1,
                stock: product.stock,
                imageUrl: product.imageUrl ?? null,
              },
            ];
          }

          return {
            items: newItems,
            totalAmount: computeTotalAmount(newItems),
            totalItems: computeTotalItems(newItems),
          };
        });
      },

      /**
       * Remove a product from the cart entirely.
       * @param {string} productId
       */
      removeItem(productId) {
        set((state) => {
          const newItems = state.items.filter(
            (item) => item.productId !== productId
          );
          return {
            items: newItems,
            totalAmount: computeTotalAmount(newItems),
            totalItems: computeTotalItems(newItems),
          };
        });
      },

      /**
       * Update the quantity of a cart item.
       * Setting quantity to 0 or below removes the item.
       * Quantity is capped at the item's stock.
       * @param {string} productId
       * @param {number} quantity
       */
      updateQuantity(productId, quantity) {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }

        set((state) => {
          const newItems = state.items.map((item) => {
            if (item.productId !== productId) return item;
            const capped = Math.min(quantity, item.stock);
            return { ...item, quantity: capped };
          });
          return {
            items: newItems,
            totalAmount: computeTotalAmount(newItems),
            totalItems: computeTotalItems(newItems),
          };
        });
      },

      /**
       * Clear all items from the cart.
       */
      clearCart() {
        set({ items: [], totalAmount: 0, totalItems: 0 });
      },
    }),
    {
      name: "online-cart-storage",
      // Only persist items; totalAmount and totalItems are recomputed on rehydration
      partialize: (state) => ({ items: state.items }),
      // Recompute derived values after rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.totalAmount = computeTotalAmount(state.items);
          state.totalItems = computeTotalItems(state.items);
        }
      },
    }
  )
);

export default useOnlineCart;
