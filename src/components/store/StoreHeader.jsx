"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingCart, Store } from "lucide-react";
import useOnlineCart from "@/hooks/useOnlineCart";
import CartDrawer from "@/components/store/CartDrawer";

/**
 * StoreHeader — header publik untuk halaman toko online.
 *
 * Menampilkan nama toko dan ikon keranjang dengan badge jumlah item.
 * Klik ikon keranjang membuka CartDrawer.
 *
 * Ini adalah Client Component karena membutuhkan akses ke Zustand store
 * dan state untuk membuka/menutup CartDrawer.
 */
export default function StoreHeader() {
  const [cartOpen, setCartOpen] = useState(false);
  const totalItems = useOnlineCart((state) => state.totalItems);

  return (
    <>
      <header className="bg-white border-b border-gray-200 px-6 py-3 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Nama toko — link ke halaman katalog */}
          <Link
            href="/store"
            className="flex items-center gap-2 text-base font-bold text-gray-900 hover:text-blue-600 transition-colors"
          >
            <Store className="size-5" aria-hidden="true" />
            Toko Online
          </Link>

          <div className="flex items-center gap-3">
            {/* Link ke halaman login staf */}
            <Link
              href="/login"
              className="hidden sm:inline-flex items-center text-xs text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="Login sebagai staf"
            >
              Login Staf
            </Link>

            {/* Ikon keranjang dengan badge */}
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative inline-flex items-center justify-center rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
              aria-label={`Keranjang belanja${totalItems > 0 ? `, ${totalItems} item` : ", kosong"}`}
            >
              <ShoppingCart className="size-5" />
              {totalItems > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none"
                  aria-hidden="true"
                >
                  {totalItems > 99 ? "99+" : totalItems}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* CartDrawer — slide dari kanan */}
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}
