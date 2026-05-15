"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import ProductCard from "@/components/store/ProductCard";

/**
 * ProductGrid — grid responsif produk katalog toko online publik.
 *
 * Menerima array `products` dari Server Component induk, lalu menyediakan
 * kolom pencarian client-side yang memfilter produk berdasarkan kecocokan nama.
 *
 * Requirements:
 * - 1.4: Filter produk berdasarkan nama saat pengguna mengetik (< 500ms, client-side)
 * - 1.6: Tampilkan "Belum ada produk tersedia saat ini" jika tidak ada produk aktif
 *
 * @param {{ products: Array<{ _id: string, name: string, price: number, stock: number, imageUrl?: string }> }} props
 */
export default function ProductGrid({ products = [] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(trimmed)
    );
  }, [products, query]);

  return (
    <section aria-label="Katalog produk">
      {/* Kolom pencarian */}
      <div className="relative mb-6">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari produk..."
          aria-label="Cari produk"
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {/* Kondisi: tidak ada produk sama sekali */}
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-gray-500 text-base">
            Belum ada produk tersedia saat ini
          </p>
        </div>
      ) : filtered.length === 0 ? (
        /* Kondisi: pencarian tidak menemukan hasil */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-gray-500 text-base">
            Produk &ldquo;{query}&rdquo; tidak ditemukan
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-3 text-sm text-blue-600 hover:underline focus:outline-none focus-visible:underline"
          >
            Hapus pencarian
          </button>
        </div>
      ) : (
        /* Grid produk */
        <div
          className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4"
          aria-live="polite"
          aria-label={`Menampilkan ${filtered.length} produk`}
        >
          {filtered.map((product) => (
            <ProductCard key={product._id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
