
"use client";

import { create } from "zustand";
import { useCallback, useEffect } from "react";
import useSSE from "@/hooks/useSSE";

const CART_STORAGE_KEY = "pos-cart";

/**
 * Hitung total harga berdasarkan isi keranjang.
 */
function computeTotalAmount(items) {
  return items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
}

/**
 * Hitung jumlah seluruh unit barang.
 */
function computeTotalItems(items) {
  return items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
}

/**
 * Validasi dan normalisasi satu item keranjang.
 * Mengembalikan null jika data tidak valid.
 */
function normalizeCartItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const productId =
    typeof item.productId === "string"
      ? item.productId
      : "";

  const price = Number(item.price);
  const quantity = Number(item.quantity);
  const stock = Number(item.stock);

  if (
    !productId.trim() ||
    typeof item.name !== "string" ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(stock) ||
    stock < 0
  ) {
    return null;
  }

  return {
    productId,
    name: item.name,
    price,
    quantity,
    stock: Math.floor(stock),
    imageUrl:
      typeof item.imageUrl === "string"
        ? item.imageUrl
        : null,
  };
}

/**
 * Baca keranjang dari localStorage.
 * Tidak dipanggil saat render awal server.
 */
function loadCart() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const validItems = parsed
      .map(normalizeCartItem)
      .filter(Boolean);

    // Hindari ID produk ganda dari data penyimpanan.
    const uniqueItems = new Map();

    for (const item of validItems) {
      if (!uniqueItems.has(item.productId)) {
        uniqueItems.set(item.productId, item);
      }
    }

    return Array.from(uniqueItems.values());
  } catch (error) {
    console.error("Gagal membaca keranjang:", error);
    return [];
  }
}

/**
 * Simpan keranjang dengan aman.
 */
function saveCart(items) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify(items)
    );

    return true;
  } catch (error) {
    console.error("Gagal menyimpan keranjang:", error);
    return false;
  }
}

/**
 * Buat peringatan untuk barang yang kuantitasnya
 * melebihi stok terbaru.
 */
function computeStockWarnings(items) {
  return new Set(
    items
      .filter((item) => item.quantity > item.stock)
      .map((item) => item.productId)
  );
}

/**
 * Zustand store untuk keranjang POS kasir.
 *
 * Data awal selalu sama pada server dan browser.
 * localStorage dibaca setelah komponen dimuat.
 */
const useCart = create((set, get) => ({
  items: [],
  totalAmount: 0,
  totalItems: 0,
  stockWarnings: new Set(),
  hasHydrated: false,

  /**
   * Tambah barang atau naikkan kuantitasnya.
   */
  addItem(product) {
    if (!product || typeof product !== "object") {
      return;
    }

    const rawId = product._id ?? product.productId;
    const productId =
      rawId != null ? String(rawId) : "";

    const price = Number(product.price);
    const stock = Math.floor(Number(product.stock));

    if (
      !productId.trim() ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isFinite(stock) ||
      stock <= 0
    ) {
      return;
    }

    set((state) => {
      const existing = state.items.find(
        (item) => item.productId === productId
      );

      let newItems;

      if (existing) {
        // Jangan tambah barang jika sudah melebihi stok.
        if (existing.quantity >= existing.stock) {
          return state;
        }

        newItems = state.items.map((item) =>
          item.productId === productId
            ? {
                ...item,
                quantity: Math.min(
                  item.quantity + 1,
                  item.stock
                ),
              }
            : item
        );
      } else {
        if (typeof product.name !== "string") {
          return state;
        }

        newItems = [
          ...state.items,
          {
            productId,
            name: product.name,
            price,
            quantity: 1,
            stock,
            imageUrl:
              typeof product.imageUrl === "string"
                ? product.imageUrl
                : null,
          },
        ];
      }

      saveCart(newItems);

      const newWarnings = computeStockWarnings(newItems);

      return {
        items: newItems,
        totalAmount: computeTotalAmount(newItems),
        totalItems: computeTotalItems(newItems),
        stockWarnings: newWarnings,
      };
    });
  },

  /**
   * Hapus satu barang dari keranjang.
   */
  removeItem(productId) {
    const id = String(productId);

    set((state) => {
      const newItems = state.items.filter(
        (item) => item.productId !== id
      );

      const newWarnings = new Set(state.stockWarnings);
      newWarnings.delete(id);

      saveCart(newItems);

      return {
        items: newItems,
        totalAmount: computeTotalAmount(newItems),
        totalItems: computeTotalItems(newItems),
        stockWarnings: newWarnings,
      };
    });
  },

  /**
   * Ubah kuantitas barang.
   * Kuantitas dibatasi oleh stok yang diketahui.
   */
  updateQuantity(productId, quantity) {
    const id = String(productId);
    const requestedQuantity = Number(quantity);

    if (
      !Number.isFinite(requestedQuantity) ||
      requestedQuantity <= 0
    ) {
      get().removeItem(id);
      return;
    }

    set((state) => {
      const existing = state.items.find(
        (item) => item.productId === id
      );

      if (!existing) {
        return state;
      }

      const cappedQuantity = Math.min(
        Math.floor(requestedQuantity),
        existing.stock
      );

      // Stok nol berarti barang tidak bisa dipertahankan
      // melalui aksi perubahan kuantitas.
      const newItems =
        cappedQuantity <= 0
          ? state.items.filter(
              (item) => item.productId !== id
            )
          : state.items.map((item) =>
              item.productId === id
                ? { ...item, quantity: cappedQuantity }
                : item
            );

      saveCart(newItems);

      return {
        items: newItems,
        totalAmount: computeTotalAmount(newItems),
        totalItems: computeTotalItems(newItems),
        stockWarnings: computeStockWarnings(newItems),
      };
    });
  },

  /**
   * Kosongkan keranjang.
   */
  clearCart() {
    saveCart([]);

    set({
      items: [],
      totalAmount: 0,
      totalItems: 0,
      stockWarnings: new Set(),
    });
  },

  /**
   * Muat keranjang setelah komponen dipasang.
   */
  hydrateFromStorage() {
    // Mencegah pemuatan ulang berulang pada instance store.
    if (get().hasHydrated) {
      return;
    }

    const stored = loadCart();

    set({
      items: stored,
      totalAmount: computeTotalAmount(stored),
      totalItems: computeTotalItems(stored),
      stockWarnings: computeStockWarnings(stored),
      hasHydrated: true,
    });
  },

  /**
   * Proses pembaruan stok dari SSE.
   */
  handleStockUpdated(productId, newStock) {
    const id = String(productId);
    const stock = Number(newStock);

    if (
      !id.trim() ||
      !Number.isFinite(stock) ||
      stock < 0
    ) {
      return;
    }

    const normalizedStock = Math.floor(stock);

    set((state) => {
      const existing = state.items.find(
        (item) => item.productId === id
      );

      if (!existing || existing.stock === normalizedStock) {
        return state;
      }

      const newItems = state.items.map((item) =>
        item.productId === id
          ? { ...item, stock: normalizedStock }
          : item
      );

      saveCart(newItems);

      return {
        items: newItems,
        totalAmount: computeTotalAmount(newItems),
        totalItems: computeTotalItems(newItems),
        stockWarnings: computeStockWarnings(newItems),
      };
    });
  },
}));

export default useCart;

/**
 * Pasang hook ini sekali pada komponen induk kasir.
 * Menangani pemuatan keranjang dan event SSE.
 */
export function useCartSSE() {
  const hydrateFromStorage = useCart(
    (state) => state.hydrateFromStorage
  );

  const handleStockUpdated = useCart(
    (state) => state.handleStockUpdated
  );

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  const onSSEEvent = useCallback(
    (event) => {
      if (event?.type !== "stock_updated") {
        return;
      }

      const productId = event.data?.productId;
      const newStock = event.data?.newStock;

      if (
        productId == null ||
        newStock == null ||
        String(productId).trim() === ""
      ) {
        return;
      }

      handleStockUpdated(productId, newStock);
    },
    [handleStockUpdated]
  );

  useSSE(onSSEEvent);
}
