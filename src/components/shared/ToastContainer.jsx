"use client";

import { useEffect } from "react";

/**
 * ToastItem — satu item notifikasi.
 */
function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const colorMap = {
    new_order: "bg-blue-600 border-blue-700",
    order_ready: "bg-green-600 border-green-700",
    payment_success: "bg-emerald-600 border-emerald-700",
    new_transaction: "bg-purple-600 border-purple-700",
  };
  const iconMap = {
    new_order: "🛒",
    order_ready: "✅",
    payment_success: "💰",
    new_transaction: "📊",
  };
  const colorClass = colorMap[toast.type] || "bg-gray-700 border-gray-800";
  const icon = iconMap[toast.type] || "🔔";

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-xl max-w-sm w-full animate-slide-in text-white ${colorClass}`}
      role="alert"
      aria-live="assertive"
    >
      <span className="text-2xl flex-shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm">{toast.title}</p>
        <p className="text-xs opacity-90 mt-0.5 leading-relaxed">{toast.message}</p>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-white/70 hover:text-white text-xl leading-none flex-shrink-0 ml-1"
        aria-label="Tutup notifikasi"
      >
        ×
      </button>
    </div>
  );
}

/**
 * ToastContainer — container untuk semua toast notifications.
 * Posisi: pojok kanan bawah layar.
 *
 * @param {{
 *   toasts: Array<{ id: number, type: string, title: string, message: string }>,
 *   onDismiss: (id: number) => void
 * }} props
 */
export default function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end"
      aria-label="Notifikasi sistem"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
