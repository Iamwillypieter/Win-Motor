/**
 * Unit Tests: useCart (Zustand store)
 *
 * Validates: Requirements 3.2, 3.5
 *
 * Tests:
 *   1. addItem: menambahkan produk baru ke keranjang
 *   2. addItem: menambah quantity jika produk sudah ada (hingga batas stok)
 *   3. removeItem: menghapus produk dari keranjang
 *   4. updateQuantity: memperbarui quantity; quantity 0 menghapus item
 *   5. clearCart: mengosongkan keranjang
 *   6. totalAmount: dihitung dengan benar (sum of price × quantity)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import useCart from "@/hooks/useCart";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const product1 = {
  _id: "product-id-001",
  name: "Kopi Arabika",
  price: 25000,
  stock: 10,
  imageUrl: "https://example.com/kopi.jpg",
};

const product2 = {
  _id: "product-id-002",
  name: "Teh Hijau",
  price: 15000,
  stock: 5,
  imageUrl: null,
};

// ---------------------------------------------------------------------------
// Helper: get a fresh store instance for each test
// ---------------------------------------------------------------------------

function getStore() {
  return renderHook(() => useCart((state) => state));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useCart — addItem", () => {
  beforeEach(() => {
    // Reset cart state before each test
    act(() => {
      useCart.getState().clearCart();
    });
  });

  it("harus menambahkan produk baru ke keranjang", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].productId).toBe("product-id-001");
    expect(result.current.items[0].name).toBe("Kopi Arabika");
    expect(result.current.items[0].price).toBe(25000);
    expect(result.current.items[0].quantity).toBe(1);
    expect(result.current.items[0].stock).toBe(10);
  });

  it("harus menambah quantity jika produk sudah ada di keranjang", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1);
      result.current.addItem(product1);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(2);
  });

  it("TIDAK boleh melebihi batas stok saat addItem berulang", () => {
    const { result } = getStore();
    const limitedProduct = { ...product1, stock: 3 };

    act(() => {
      // Add 5 times, but stock is 3
      result.current.addItem(limitedProduct);
      result.current.addItem(limitedProduct);
      result.current.addItem(limitedProduct);
      result.current.addItem(limitedProduct);
      result.current.addItem(limitedProduct);
    });

    expect(result.current.items[0].quantity).toBe(3);
  });

  it("TIDAK boleh menambahkan produk dengan stok 0", () => {
    const { result } = getStore();
    const outOfStockProduct = { ...product1, stock: 0 };

    act(() => {
      result.current.addItem(outOfStockProduct);
    });

    expect(result.current.items).toHaveLength(0);
  });

  it("harus dapat menambahkan beberapa produk berbeda", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1);
      result.current.addItem(product2);
    });

    expect(result.current.items).toHaveLength(2);
  });

  it("harus menyimpan imageUrl dari produk", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1);
    });

    expect(result.current.items[0].imageUrl).toBe(
      "https://example.com/kopi.jpg"
    );
  });

  it("harus menyimpan imageUrl sebagai null ketika tidak ada", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product2);
    });

    expect(result.current.items[0].imageUrl).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("useCart — removeItem", () => {
  beforeEach(() => {
    act(() => {
      useCart.getState().clearCart();
    });
  });

  it("harus menghapus produk dari keranjang", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1);
      result.current.addItem(product2);
    });

    act(() => {
      result.current.removeItem("product-id-001");
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].productId).toBe("product-id-002");
  });

  it("harus tidak mengubah keranjang jika productId tidak ditemukan", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1);
    });

    act(() => {
      result.current.removeItem("id-tidak-ada");
    });

    expect(result.current.items).toHaveLength(1);
  });

  it("harus mengosongkan keranjang ketika item terakhir dihapus", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1);
    });

    act(() => {
      result.current.removeItem("product-id-001");
    });

    expect(result.current.items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("useCart — updateQuantity", () => {
  beforeEach(() => {
    act(() => {
      useCart.getState().clearCart();
    });
  });

  it("harus memperbarui quantity item", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1);
    });

    act(() => {
      result.current.updateQuantity("product-id-001", 5);
    });

    expect(result.current.items[0].quantity).toBe(5);
  });

  it("harus menghapus item ketika quantity diset ke 0", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1);
    });

    act(() => {
      result.current.updateQuantity("product-id-001", 0);
    });

    expect(result.current.items).toHaveLength(0);
  });

  it("harus menghapus item ketika quantity diset ke nilai negatif", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1);
    });

    act(() => {
      result.current.updateQuantity("product-id-001", -1);
    });

    expect(result.current.items).toHaveLength(0);
  });

  it("harus membatasi quantity pada nilai stok maksimum", () => {
    const { result } = getStore();
    const limitedProduct = { ...product1, stock: 5 };

    act(() => {
      result.current.addItem(limitedProduct);
    });

    act(() => {
      result.current.updateQuantity("product-id-001", 100);
    });

    expect(result.current.items[0].quantity).toBe(5);
  });
});

// ---------------------------------------------------------------------------

describe("useCart — clearCart", () => {
  beforeEach(() => {
    act(() => {
      useCart.getState().clearCart();
    });
  });

  it("harus mengosongkan semua item dari keranjang", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1);
      result.current.addItem(product2);
    });

    act(() => {
      result.current.clearCart();
    });

    expect(result.current.items).toHaveLength(0);
  });

  it("harus tidak error ketika dipanggil pada keranjang yang sudah kosong", () => {
    const { result } = getStore();

    expect(() => {
      act(() => {
        result.current.clearCart();
      });
    }).not.toThrow();

    expect(result.current.items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("useCart — totalAmount (computed)", () => {
  beforeEach(() => {
    act(() => {
      useCart.getState().clearCart();
    });
  });

  it("harus mengembalikan 0 ketika keranjang kosong", () => {
    const { result } = getStore();
    expect(result.current.totalAmount).toBe(0);
  });

  it("harus menghitung total dengan benar untuk satu item", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1);
      result.current.addItem(product1); // quantity = 2
    });

    // 25000 × 2 = 50000
    expect(result.current.totalAmount).toBe(50000);
  });

  it("harus menghitung total dengan benar untuk beberapa item", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1); // 25000 × 1
      result.current.addItem(product2); // 15000 × 1
    });

    // 25000 + 15000 = 40000
    expect(result.current.totalAmount).toBe(40000);
  });

  it("harus memperbarui total setelah updateQuantity", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1);
      result.current.updateQuantity("product-id-001", 3);
    });

    // 25000 × 3 = 75000
    expect(result.current.totalAmount).toBe(75000);
  });

  it("harus memperbarui total setelah removeItem", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1);
      result.current.addItem(product2);
      result.current.removeItem("product-id-001");
    });

    // hanya product2: 15000 × 1 = 15000
    expect(result.current.totalAmount).toBe(15000);
  });

  it("harus mengembalikan 0 setelah clearCart", () => {
    const { result } = getStore();

    act(() => {
      result.current.addItem(product1);
      result.current.clearCart();
    });

    expect(result.current.totalAmount).toBe(0);
  });
});
