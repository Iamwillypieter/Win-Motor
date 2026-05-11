"use client";

import { useState, useCallback } from "react";
import useOrderQueue from "@/hooks/useOrderQueue";
import useNotification from "@/hooks/useNotification";
import ToastContainer from "@/components/shared/ToastContainer";
import { useAudioUnlock } from "@/components/shared/SoundNotification";
import OrderQueueCard from "./OrderQueueCard";

/**
 * OrderQueueList — real-time order queue for the Warehouse page.
 * Menampilkan notifikasi + suara saat pesanan baru masuk dari kasir.
 */
export default function OrderQueueList() {
  const { toasts, notify, dismiss } = useNotification();
  const [processingId, setProcessingId] = useState(null);

  // Unlock AudioContext saat user pertama kali berinteraksi dengan halaman
  useAudioUnlock();

  // Callback dipanggil oleh useOrderQueue saat ada pesanan baru via SSE
  // Dibungkus useCallback agar referensinya stabil dan tidak trigger re-render berulang
  const handleNewOrder = useCallback((order) => {
    const customerInfo = order.customerName ? ` — ${order.customerName}` : "";
    notify(
      "new_order",
      "Pesanan Baru Masuk! 🛒",
      `Invoice ${order.invoiceNumber}${customerInfo} sedang menunggu persiapan.`
    );
  }, [notify]);

  const { orders, isLoading, error, markReady, refresh } = useOrderQueue(handleNewOrder);

  async function handleMarkReady(orderId) {
    setProcessingId(orderId);
    try {
      await markReady(orderId);
    } finally {
      setProcessingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"
            aria-hidden="true"
          />
          <p className="text-sm">Memuat antrean...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Toast notifications pojok kanan bawah */}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">
            {orders.length} pesanan aktif
          </span>
          {/* Live indicator */}
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <span
              className="w-2 h-2 rounded-full bg-green-500 animate-pulse"
              aria-hidden="true"
            />
            Live
          </span>
        </div>
        <button
          onClick={refresh}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium focus:outline-none focus:underline"
          aria-label="Refresh antrean"
        >
          Refresh
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Empty state */}
      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <span className="text-5xl" aria-hidden="true">
            📭
          </span>
          <p className="text-base font-medium">Antrean kosong</p>
          <p className="text-sm text-center max-w-xs">
            Pesanan baru dari kasir akan muncul di sini secara otomatis.
          </p>
        </div>
      ) : (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Antrean pesanan"
          aria-live="polite"
          aria-atomic="false"
        >
          {orders.map((order) => (
            <OrderQueueCard
              key={order._id?.toString()}
              order={order}
              onMarkReady={handleMarkReady}
              isProcessing={processingId === order._id?.toString()}
            />
          ))}
        </div>
      )}
      </div>
    </>
  );
}
