"use client";

import { useState, useEffect } from "react";
import { formatRupiah } from "@/lib/utils";

/**
 * EditOrderModal — modal untuk edit item pesanan yang belum dibayar.
 *
 * Kasir bisa:
 *  - Ubah quantity per item (atau hapus dengan set ke 0)
 *  - Ubah nama pelanggan
 *  - Simpan perubahan via PATCH /api/orders/[id]
 *
 * @param {{ order: Object, onSuccess: (order) => void, onClose: () => void }} props
 */
export default function EditOrderModal({ order, onSuccess, onClose }) {
  // Local editable state — copy dari order.items
  const [items, setItems] = useState(() =>
    order.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    }))
  );
  const [customerName, setCustomerName] = useState(order.customerName || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Close on Escape
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const totalAmount = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  function handleQtyChange(productId, qty) {
    const q = Math.max(0, parseInt(qty, 10) || 0);
    setItems((prev) =>
      prev.map((i) => i.productId === productId ? { ...i, quantity: q } : i)
    );
  }

  function handleRemoveItem(productId) {
    setItems((prev) => prev.map((i) =>
      i.productId === productId ? { ...i, quantity: 0 } : i
    ));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // Filter out items with quantity 0
    const validItems = items.filter((i) => i.quantity > 0);

    if (validItems.length === 0) {
      setError("Pesanan harus memiliki minimal 1 item. Gunakan tombol Batal Pesanan untuk membatalkan.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${order._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: validItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          customerName: customerName.trim() || null,
        }),
      });

      const json = await res.json();

      if (res.ok) {
        onSuccess(json.data);
      } else {
        setError(json.error?.message || "Gagal menyimpan perubahan");
      }
    } catch {
      setError("Gagal terhubung ke server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-semibold text-gray-900">Edit Pesanan</h2>
            <p className="text-xs text-gray-400 font-mono">{order.invoiceNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none focus:outline-none"
            aria-label="Tutup"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Error */}
          {error && (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Customer name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nama Pelanggan <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              disabled={saving}
              placeholder="Contoh: Budi Santoso"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          {/* Item list */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Item Pesanan</label>
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.productId}
                  className={`flex items-center gap-2 rounded-lg border p-2.5 ${
                    item.quantity === 0
                      ? "border-red-200 bg-red-50 opacity-60"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.productName}</p>
                    <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                  </div>

                  {/* Qty control */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQtyChange(item.productId, item.quantity - 1)}
                      disabled={saving || item.quantity === 0}
                      className="w-7 h-7 rounded border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={item.quantity}
                      onChange={(e) => handleQtyChange(item.productId, e.target.value)}
                      disabled={saving}
                      className="w-12 rounded border border-gray-300 text-center py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => handleQtyChange(item.productId, item.quantity + 1)}
                      disabled={saving}
                      className="w-7 h-7 rounded border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>

                  {/* Subtotal */}
                  <div className="w-20 text-right flex-shrink-0">
                    <p className={`text-sm font-medium ${item.quantity === 0 ? "text-gray-400 line-through" : "text-gray-900"}`}>
                      {formatRupiah(item.unitPrice * item.quantity)}
                    </p>
                  </div>

                  {/* Remove */}
                  {item.quantity > 0 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.productId)}
                      disabled={saving}
                      className="text-red-400 hover:text-red-600 text-sm flex-shrink-0"
                      aria-label={`Hapus ${item.productName}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="flex justify-between font-bold border-t border-gray-200 pt-3">
            <span>Total</span>
            <span className="text-blue-600">{formatRupiah(totalAmount)}</span>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Menyimpan...
                </span>
              ) : "Simpan Perubahan"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none disabled:opacity-50"
            >
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
