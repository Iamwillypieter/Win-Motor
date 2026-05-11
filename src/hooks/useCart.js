import { create } from "zustand";
import useSSE from "@/hooks/useSSE";

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
 * Zustand cart store for the Cashier POS interface.
 *
 * CartItem shape:
 *   { productId, name, price, quantity, stock, imageUrl }
 *
 * All monetary values are integers (rupiah).
 *
 * totalAmount and totalItems are derived values kept in sync with items
 * on every state update.
 *
 * stockWarnings: Set of productIds whose cart quantity exceeds the latest
 * known stock (populated via SSE stock_updated events).
 */
const useCart = create((set, get) => ({
  /** @type {Array<{productId: string, name: string, price: number, quantity: number, stock: number, imageUrl: string|null}>} */
  items: [],

  /** Total amount in rupiah (sum of price × quantity). Kept in sync with items. */
  totalAmount: 0,

  /** Total number of items (sum of quantities). Kept in sync with items. */
  totalItems: 0,

  /**
   * Set of productIds that have a stock warning (newStock < quantity in cart).
   * Updated by handleStockUpdated() when a stock_updated SSE event is received.
   * @type {Set<string>}
   */
  stockWarnings: new Set(),

  /**
   * Add a product to the cart.
   * If the product is already in the cart, increment quantity (up to stock limit).
   * @param {{ _id: string, name: string, price: number, stock: number, imageUrl?: string }} product
   */
  addItem(product) {
    const productId = product._id?.toString() ?? product.productId;
    set((state) => {
      const existing = state.items.find((item) => item.productId === productId);

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
      // Clear any warning for this product
      const newWarnings = new Set(state.stockWarnings);
      newWarnings.delete(productId);
      return {
        items: newItems,
        totalAmount: computeTotalAmount(newItems),
        totalItems: computeTotalItems(newItems),
        stockWarnings: newWarnings,
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
    set({ items: [], totalAmount: 0, totalItems: 0, stockWarnings: new Set() });
  },

  /**
   * Handle a stock_updated SSE event.
   * Updates the stock value for the affected cart item and sets a warning
   * if the new stock is less than the current quantity in the cart.
   *
   * @param {string} productId
   * @param {number} newStock
   */
  handleStockUpdated(productId, newStock) {
    set((state) => {
      const item = state.items.find((i) => i.productId === productId);
      if (!item) return state; // product not in cart — nothing to do

      // Update the stored stock value for the cart item
      const newItems = state.items.map((i) =>
        i.productId === productId ? { ...i, stock: newStock } : i
      );

      // Set or clear warning based on whether quantity exceeds new stock
      const newWarnings = new Set(state.stockWarnings);
      if (newStock < item.quantity) {
        newWarnings.add(productId);
      } else {
        newWarnings.delete(productId);
      }

      return {
        items: newItems,
        stockWarnings: newWarnings,
      };
    });
  },
}));

export default useCart;

/**
 * useCartSSE — subscribes to SSE events relevant to the cart.
 * Call this hook once inside a client component that wraps the cart
 * (e.g. CartPanel or the cashier layout).
 *
 * Handles:
 *   - stock_updated: updates cart item stock and sets warnings
 */
export function useCartSSE() {
  const handleStockUpdated = useCart((state) => state.handleStockUpdated);

  useSSE((event) => {
    if (event.type === "stock_updated") {
      const { productId, newStock } = event.data ?? {};
      if (productId !== undefined && newStock !== undefined) {
        handleStockUpdated(productId, newStock);
      }
    }
  });
}
