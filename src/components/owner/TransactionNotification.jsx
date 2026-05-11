"use client";

import { useCallback } from "react";
import useSSE from "@/hooks/useSSE";
import useNotification from "@/hooks/useNotification";
import ToastContainer from "@/components/shared/ToastContainer";
import { useAudioUnlock } from "@/components/shared/SoundNotification";

/**
 * TransactionNotification — mendengarkan SSE event `order_completed` dan
 * menampilkan notifikasi + suara ke Owner bahwa ada transaksi baru.
 */
export default function TransactionNotification() {
  const { toasts, notify, dismiss } = useNotification();

  // Unlock AudioContext saat user pertama kali berinteraksi
  useAudioUnlock();

  const handleEvent = useCallback((event) => {
    if (event.type === "order_completed") {
      notify(
        "new_transaction",
        "Transaksi Baru! 📊",
        "Pembayaran berhasil dikonfirmasi. Data dashboard diperbarui."
      );
    }
  }, [notify]);

  useSSE(handleEvent);

  return <ToastContainer toasts={toasts} onDismiss={dismiss} />;
}
