"use client";

import { useState } from "react";
import ProductCatalog from "./ProductCatalog";
import CartPanel from "./CartPanel";
import useCart from "@/hooks/useCart";
import { formatRupiah } from "@/lib/utils";

/**
 * CashierPOSLayout — layout responsif untuk halaman POS Kasir.
 *
 * - Desktop (>= lg): katalog di kiri (flex-1) + panel keranjang di kanan (w-80,
 *   sticky). Sama seperti tampilan lama — tidak ada perubahan perilaku.
 * - Mobile (< lg): katalog memenuhi lebar layar, dan keranjang dibuka lewat
 *   drawer yang slide-up dari bawah dengan tombol mengambang di bawah layar.
 *   Alur bisnis (tambah keranjang → Buat Pesanan) tidak berubah.
 *
 * Dipisah dari page.jsx (Server Component) karena butuh state interaktif
 * (buka/tutup drawer) dan membaca total keranjang dari store Zustand.
 *
 * Props:
 * - products: Array<Object> — daftar produk aktif (sudah diserialize)
 */
export default function CashierPOSLayout({ products }) {
  const [cartOpen, setCartOpen] = useState(false);
  const totalItems = useCart((state) => state.totalItems);
  const totalAmount = useCart((state) => state.totalAmount);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 lg:pb-6">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* ── Katalog produk ── */}
          <div className="flex-1 min-w-0 w-full">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
              Katalog Produk
            </h2>
            <ProductCatalog products={products} />
          </div>

          {/* ── Keranjang: inline di desktop ── */}
          <div className="hidden lg:block w-80 flex-shrink-0 sticky top-20">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
              Keranjang
            </h2>
            <CartPanel />
          </div>
        </div>
      </div>

      {/* ── Mobile: tombol mengambang untuk membuka keranjang ── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-xl bg-blue-600 px-4 py-3 text-white active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Buka keranjang"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            {/* Ikon keranjang */}
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3h2l.4 2M7 13h10l3-8H6.4M7 13L5.4 5M7 13l-1.5 6h12.5M9 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z"
              />
            </svg>
            Keranjang
            {totalItems > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold">
                {totalItems}
              </span>
            )}
          </span>
          <span className="text-sm font-bold">
            {totalItems > 0 ? formatRupiah(totalAmount) : "Kosong"}
          </span>
        </button>
      </div>

      {/* ── Mobile: drawer keranjang (slide-up) ── */}
      {cartOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Keranjang"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Tutup keranjang"
            className="absolute inset-0 bg-black/50"
            onClick={() => setCartOpen(false)}
          />

          {/* Panel */}
          <div className="relative flex h-[85vh] flex-col rounded-t-2xl bg-gray-50 shadow-2xl">
            {/* Handle bar */}
            <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 rounded-t-2xl">
              <h2 className="text-base font-semibold text-gray-900">Keranjang</h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                aria-label="Tutup keranjang"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Isi keranjang mengisi sisa tinggi drawer */}
            <div className="flex-1 overflow-hidden p-4">
              <CartPanel />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
