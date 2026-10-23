"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatRupiah } from "@/lib/utils";
import useCart, { useCartSSE } from "@/hooks/useCart";
import CartItem from "./CartItem";
import { createOrderAction } from "@/server/actions/order.actions";

/**
 * CartPanel — right-side cart panel for the Cashier POS page.
 *
 * Shows:
 *  - List of CartItem components
 *  - Total amount
 *  - "Buat Pesanan" button with loading state
 *  - Error messages (empty cart, insufficient stock)
 *  - Success state with invoice number after order is created
 *  - Stock warning banner when SSE stock_updated events reduce stock below cart quantity
 */
export default function CartPanel() {
  const router = useRouter();
  const items = useCart((state) => state.items);
  const clearCart = useCart((state) => state.clearCart);
  const totalAmount = useCart((state) => state.totalAmount);
  const totalItems = useCart((state) => state.totalItems);
  const stockWarnings = useCart((state) => state.stockWarnings);

  // Subscribe to SSE stock_updated events for cart warning
  useCartSSE();

  const [error, setError] = useState("");
  const [successOrder, setSuccessOrder] = useState(null); // { invoiceNumber, orderId }
  const [customerName, setCustomerName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);

  function handleCreateOrder() {
    setError("");

    if (items.length === 0) {
      setError("Keranjang belanja kosong");
      return;
    }

    setShowConfirm(true);
  }

  function handleConfirmOrder() {
    setShowConfirm(false);

    // Capture nilai sebelum masuk startTransition agar tidak stale
    const capturedCustomerName = customerName.trim() || null;

    const orderItems = items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));

    startTransition(async () => {
      const result = await createOrderAction(orderItems, capturedCustomerName);

      if (result.success) {
        setSuccessOrder({
          invoiceNumber: result.data.invoiceNumber,
          orderId: result.data._id,
          customerName: capturedCustomerName,
        });
        clearCart();
        setCustomerName("");
      } else {
        setError(result.error?.message || "Gagal membuat pesanan");
      }
    });
  }

  function handleNewOrder() {
    setSuccessOrder(null);
    setError("");
  }

  // Success state
  if (successOrder) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center gap-4 text-center h-full min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl">
          ✓
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Pesanan Berhasil Dibuat!
          </h3>
          <p className="text-sm text-gray-500 mt-1">Nomor Invoice:</p>
          <p className="text-base font-mono font-bold text-blue-600 mt-1">
            {successOrder.invoiceNumber}
          </p>
          {successOrder.customerName && (
            <p className="text-sm text-gray-500 mt-1">
              Pelanggan: <span className="font-medium text-gray-700">{successOrder.customerName}</span>
            </p>
          )}
        </div>
        <p className="text-sm text-gray-500">
          Pesanan sedang disiapkan oleh staf gudang.
        </p>
        <button
          onClick={() => router.push(`/cashier/payment/${successOrder.orderId}`)}
          className="w-full rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Proses Pembayaran
        </button>
        <button
          onClick={handleNewOrder}
          className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
        >
          Pesanan Baru
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Keranjang</h2>
        {totalItems > 0 && (
          <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
            {totalItems} item
          </span>
        )}
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto px-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm gap-2">
            <span className="text-3xl">🛒</span>
            <p>Keranjang kosong</p>
            <p className="text-xs text-center">
              Pilih produk dari katalog untuk memulai
            </p>
          </div>
        ) : (
          <div>
            {items.map((item) => (
              <CartItem key={item.productId} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Footer: total + action */}
      <div className="px-4 py-4 border-t border-gray-200 space-y-3">
        {/* Input nama pelanggan */}
        <div>
          <label htmlFor="customerName" className="block text-xs font-medium text-gray-600 mb-1">
            Nama Pelanggan <span className="text-gray-400">(opsional)</span>
          </label>
          <input
            id="customerName"
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Contoh: Budi Santoso"
            disabled={isPending}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
        </div>
        {/* Stock warning banner */}
        {stockWarnings.size > 0 && (
          <div
            role="alert"
            className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800"
          >
            ⚠️ Stok beberapa produk di keranjang telah berkurang. Periksa kembali sebelum membuat pesanan.
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {/* Total */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">Total</span>
          <span className="text-lg font-bold text-gray-900">
            {formatRupiah(totalAmount)}
          </span>
        </div>

        {/* Create order button */}
        <button
          onClick={handleCreateOrder}
          disabled={isPending || items.length === 0}
          aria-busy={isPending}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Membuat Pesanan..." : "Buat Pesanan"}
        </button>
      </div>

      {/* ── Modal Konfirmasi ── */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Konfirmasi Pesanan</h3>
            </div>

            <div className="p-5 space-y-3">
              {/* Ringkasan pelanggan */}
              <div className="text-sm">
                <span className="text-gray-500">Pelanggan: </span>
                <span className="font-medium text-gray-900">
                  {customerName.trim() || "Umum (tanpa nama)"}
                </span>
              </div>

              {/* Ringkasan item */}
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 space-y-1.5 max-h-40 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.productId} className="flex justify-between text-sm">
                    <span className="text-gray-700">
                      {item.name}{" "}
                      <span className="text-gray-400">×{item.quantity}</span>
                    </span>
                    <span className="font-medium text-gray-900">
                      {formatRupiah(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex justify-between font-bold border-t border-gray-200 pt-2">
                <span>Total</span>
                <span className="text-blue-600">{formatRupiah(totalAmount)}</span>
              </div>

              <p className="text-xs text-gray-400 text-center pt-1">
                Pesanan akan dikirim ke gudang untuk disiapkan.
              </p>
            </div>

            {/* Tombol */}
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={handleConfirmOrder}
                disabled={isPending}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Memproses...
                  </span>
                ) : (
                  "Ya, Buat Pesanan"
                )}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none disabled:opacity-50"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
