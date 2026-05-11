"use client";

import { useState, useCallback, useMemo } from "react";
import { formatRupiah } from "@/lib/utils";
import useCart from "@/hooks/useCart";
import useSSE from "@/hooks/useSSE";

/**
 * ProductCatalog — displays active products in a grid with search and SKU filter.
 *
 * @param {{ products: Object[] }} props
 */
export default function ProductCatalog({ products: initialProducts = [] }) {
  const addItem = useCart((state) => state.addItem);

  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [skuFilter, setSkuFilter] = useState("");

  // Filter produk berdasarkan search nama dan SKU
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sku = skuFilter.trim().toLowerCase();
    return products.filter((p) => {
      const matchName = !q || p.name.toLowerCase().includes(q);
      const matchSku = !sku || p.sku.toLowerCase().includes(sku);
      return matchName && matchSku;
    });
  }, [products, search, skuFilter]);

  const handleSSEEvent = useCallback((event) => {
    if (event.type === "product_updated") {
      const updated = event.data;
      if (!updated?._id) return;
      setProducts((prev) => {
        if (updated.isActive === false) {
          return prev.filter((p) => p._id !== updated._id);
        }
        const exists = prev.some((p) => p._id === updated._id);
        if (exists) {
          return prev.map((p) =>
            p._id === updated._id ? { ...p, ...updated } : p
          );
        }
        return [...prev, updated];
      });
    }

    if (event.type === "stock_updated") {
      const { productId, newStock } = event.data ?? {};
      if (productId === undefined || newStock === undefined) return;
      setProducts((prev) =>
        prev.map((p) =>
          p._id === productId ? { ...p, stock: newStock } : p
        )
      );
    }
  }, []);

  useSSE(handleSSEEvent);

  const hasProducts = products.length > 0;
  const hasResults = filtered.length > 0;
  const isFiltering = search.trim() !== "" || skuFilter.trim() !== "";

  return (
    <div className="space-y-4">
      {/* Search & filter bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Search nama */}
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama produk..."
            className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            aria-label="Cari nama produk"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              aria-label="Hapus pencarian"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter SKU */}
        <div className="relative sm:w-44">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none font-mono">
            SKU
          </span>
          <input
            type="text"
            value={skuFilter}
            onChange={(e) => setSkuFilter(e.target.value.toUpperCase())}
            placeholder="Filter SKU..."
            className="w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            aria-label="Filter SKU produk"
          />
          {skuFilter && (
            <button
              onClick={() => setSkuFilter("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              aria-label="Hapus filter SKU"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Hasil filter info */}
      {isFiltering && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {hasResults
              ? `${filtered.length} produk ditemukan`
              : "Tidak ada produk yang cocok"}
          </span>
          <button
            onClick={() => { setSearch(""); setSkuFilter(""); }}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Reset filter
          </button>
        </div>
      )}

      {/* Empty state — belum ada produk sama sekali */}
      {!hasProducts && (
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
          Belum ada produk aktif. Tambahkan produk melalui halaman inventori.
        </div>
      )}

      {/* Empty state — filter tidak menemukan hasil */}
      {hasProducts && !hasResults && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
          <span className="text-3xl">🔍</span>
          <p className="text-sm font-medium text-gray-500">Produk tidak ditemukan</p>
          <p className="text-xs text-center">
            Coba ubah kata kunci atau{" "}
            <button
              onClick={() => { setSearch(""); setSkuFilter(""); }}
              className="text-blue-600 hover:underline"
            >
              reset filter
            </button>
          </p>
        </div>
      )}

      {/* Product grid */}
      {hasResults && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((product) => {
            const outOfStock = product.stock === 0;

            return (
              <div
                key={product._id}
                className={`bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col transition-shadow hover:shadow-md ${
                  outOfStock ? "opacity-60" : ""
                }`}
              >
                {/* Product image */}
                <div className="aspect-square bg-gray-100 relative overflow-hidden">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl select-none">
                      📦
                    </div>
                  )}

                  {/* Stock badge */}
                  <span
                    className={`absolute top-2 right-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      outOfStock
                        ? "bg-red-100 text-red-700"
                        : product.stock <= 5
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {outOfStock ? "Habis" : `Stok: ${product.stock}`}
                  </span>
                </div>

                {/* Product info */}
                <div className="p-3 flex flex-col gap-1 flex-1">
                  <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">
                    {product.name}
                  </p>
                  <p className="text-xs text-gray-400 font-mono">{product.sku}</p>
                  <p className="text-sm font-bold text-blue-600 mt-auto pt-1">
                    {formatRupiah(product.price)}
                  </p>
                </div>

                {/* Add to cart button */}
                <div className="px-3 pb-3">
                  <button
                    onClick={() => addItem(product)}
                    disabled={outOfStock}
                    className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label={`Tambah ${product.name} ke keranjang`}
                  >
                    {outOfStock ? "Stok Habis" : "Tambah"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
