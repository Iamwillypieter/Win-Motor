"use client";

import { ShoppingCart } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import useOnlineCart from "@/hooks/useOnlineCart";

/**
 * ProductCard — kartu produk individual untuk katalog toko online publik.
 *
 * Menampilkan gambar produk, nama, harga (format Rupiah), indikator stok,
 * dan tombol "Tambah ke Keranjang" yang dinonaktifkan saat stok habis.
 *
 * Requirements:
 * - 1.2: Tampilkan produk aktif dengan nama, harga, gambar, dan ketersediaan stok
 * - 1.3: Tampilkan "Stok Habis" dan nonaktifkan tombol saat stok = 0
 * - 2.1: Tambahkan produk ke keranjang saat tombol ditekan
 *
 * @param {{ product: { _id: string, name: string, price: number, stock: number, imageUrl?: string } }} props
 */
export default function ProductCard({ product }) {
  const addItem = useOnlineCart((state) => state.addItem);

  const outOfStock = product.stock === 0;
  const lowStock = !outOfStock && product.stock <= 5;

  function handleAddToCart() {
    if (outOfStock) return;
    addItem(product);
  }

  return (
    <article
      className={`bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col transition-shadow hover:shadow-md ${
        outOfStock ? "opacity-60" : ""
      }`}
      aria-label={`Produk: ${product.name}`}
    >
      {/* Gambar produk */}
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-gray-300 text-5xl select-none"
            aria-hidden="true"
          >
            📦
          </div>
        )}

        {/* Indikator stok — badge di pojok kanan atas gambar */}
        {outOfStock ? (
          <span className="absolute top-2 right-2 bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
            Stok Habis
          </span>
        ) : lowStock ? (
          <span className="absolute top-2 right-2 bg-yellow-100 text-yellow-700 text-xs font-semibold px-2 py-0.5 rounded-full">
            Sisa {product.stock}
          </span>
        ) : (
          <span className="absolute top-2 right-2 bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
            Stok {product.stock}
          </span>
        )}
      </div>

      {/* Info produk */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">
          {product.name}
        </p>
        <p className="text-sm font-bold text-blue-600 mt-auto pt-1">
          {formatRupiah(product.price)}
        </p>
      </div>

      {/* Tombol tambah ke keranjang */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={outOfStock}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label={
            outOfStock
              ? `${product.name} — stok habis`
              : `Tambah ${product.name} ke keranjang`
          }
        >
          {outOfStock ? (
            "Stok Habis"
          ) : (
            <>
              <ShoppingCart className="size-4" aria-hidden="true" />
              Tambah ke Keranjang
            </>
          )}
        </button>
      </div>
    </article>
  );
}
