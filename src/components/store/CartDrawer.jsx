"use client";

import { useRouter } from "next/navigation";
import { ShoppingCart, Trash2, Plus, Minus, X } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import useOnlineCart from "@/hooks/useOnlineCart";

/**
 * CartItem — baris item individual di dalam CartDrawer.
 *
 * Menampilkan gambar, nama, harga satuan, kontrol kuantitas (+/-),
 * dan tombol hapus. Tombol + dinonaktifkan saat kuantitas >= stok.
 *
 * Requirements:
 * - 2.3: Nonaktifkan tombol + dan tampilkan peringatan saat qty >= stok
 * - 2.4: Hapus item dan perbarui total harga secara langsung
 *
 * @param {{ item: { productId: string, name: string, price: number, quantity: number, stock: number, imageUrl: string|null } }} props
 */
function CartItem({ item }) {
  const updateQuantity = useOnlineCart((state) => state.updateQuantity);
  const removeItem = useOnlineCart((state) => state.removeItem);

  const atStockLimit = item.quantity >= item.stock;

  function handleDecrement() {
    updateQuantity(item.productId, item.quantity - 1);
  }

  function handleIncrement() {
    if (atStockLimit) return;
    updateQuantity(item.productId, item.quantity + 1);
  }

  function handleRemove() {
    removeItem(item.productId);
  }

  return (
    <li className="flex gap-3 py-3">
      {/* Gambar produk */}
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-2xl text-gray-300 select-none"
            aria-hidden="true"
          >
            📦
          </div>
        )}
      </div>

      {/* Info + kontrol */}
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight">
            {item.name}
          </p>
          {/* Tombol hapus */}
          <button
            type="button"
            onClick={handleRemove}
            className="flex-shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            aria-label={`Hapus ${item.name} dari keranjang`}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm font-semibold text-blue-600">
          {formatRupiah(item.price)}
        </p>

        {/* Peringatan stok */}
        {atStockLimit && (
          <p
            className="text-xs font-medium text-amber-600"
            role="alert"
            aria-live="polite"
          >
            Stok maksimal tercapai ({item.stock})
          </p>
        )}

        {/* Kontrol kuantitas */}
        <div className="flex items-center gap-2 mt-0.5">
          <button
            type="button"
            onClick={handleDecrement}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            aria-label={`Kurangi kuantitas ${item.name}`}
          >
            <Minus className="size-3.5" aria-hidden="true" />
          </button>

          <span
            className="min-w-[2rem] text-center text-sm font-semibold text-gray-900"
            aria-label={`Kuantitas: ${item.quantity}`}
          >
            {item.quantity}
          </span>

          <button
            type="button"
            onClick={handleIncrement}
            disabled={atStockLimit}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={`Tambah kuantitas ${item.name}`}
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </button>

          <span className="ml-auto text-xs text-gray-500">
            = {formatRupiah(item.price * item.quantity)}
          </span>
        </div>
      </div>
    </li>
  );
}

/**
 * CartDrawer — drawer keranjang belanja yang slide dari sisi kanan.
 *
 * Menampilkan daftar item keranjang, kontrol kuantitas dengan validasi stok,
 * total harga, tombol "Kosongkan Keranjang", dan tombol "Checkout".
 *
 * Requirements:
 * - 2.2: Kuantitas bertambah 1 saat produk yang sama ditambahkan
 * - 2.3: Peringatan visual + tombol + dinonaktifkan saat qty >= stok
 * - 2.4: Hapus item dan perbarui total harga secara langsung
 * - 2.6: Total harga diperbarui otomatis setiap keranjang berubah
 * - 2.7: Tombol "Kosongkan Keranjang" menghapus semua item
 * - 3.2: Tombol "Checkout" dengan keranjang kosong menampilkan pesan
 *
 * Props:
 * - open: boolean — apakah drawer terbuka
 * - onClose: () => void — callback untuk menutup drawer
 */
export default function CartDrawer({ open, onClose }) {
  const router = useRouter();
  const items = useOnlineCart((state) => state.items);
  const totalAmount = useOnlineCart((state) => state.totalAmount);
  const totalItems = useOnlineCart((state) => state.totalItems);
  const clearCart = useOnlineCart((state) => state.clearCart);

  const isEmpty = items.length === 0;

  function handleCheckout() {
    if (isEmpty) return;
    onClose();
    router.push("/store/checkout");
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keranjang belanja"
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-sm bg-white shadow-xl flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="size-5 text-gray-700" aria-hidden="true" />
            <h2 className="text-base font-semibold text-gray-900">
              Keranjang Belanja
            </h2>
            {totalItems > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white leading-none">
                {totalItems}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            aria-label="Tutup keranjang"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
              <ShoppingCart className="size-12 text-gray-300" aria-hidden="true" />
              <p className="text-sm font-medium text-gray-500">
                Keranjang belanja kosong
              </p>
              <p className="text-xs text-gray-400">
                Tambahkan produk dari katalog untuk mulai berbelanja.
              </p>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-gray-100" aria-label="Item di keranjang">
                {items.map((item) => (
                  <CartItem key={item.productId} item={item} />
                ))}
              </ul>

              {/* Tombol kosongkan keranjang */}
              <div className="py-3">
                <button
                  type="button"
                  onClick={clearCart}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  aria-label="Kosongkan semua item dari keranjang"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Kosongkan Keranjang
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer — total harga + tombol checkout */}
        <div className="border-t border-gray-200 px-4 py-4 flex-shrink-0 space-y-3">
          {isEmpty && (
            <p
              className="text-center text-sm text-amber-600 font-medium"
              role="status"
              aria-live="polite"
            >
              Keranjang belanja kosong
            </p>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Total</span>
            <span className="text-base font-bold text-gray-900">
              {formatRupiah(totalAmount)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={isEmpty}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label={isEmpty ? "Checkout — keranjang kosong" : "Lanjut ke checkout"}
          >
            Checkout
          </button>
        </div>
      </div>
    </>
  );
}
