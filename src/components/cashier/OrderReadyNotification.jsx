"use client";

import { useCallback } from "react";
import useSSE from "@/hooks/useSSE";
import useNotification from "@/hooks/useNotification";
import ToastContainer from "@/components/shared/ToastContainer";
import { useAudioUnlock } from "@/components/shared/SoundNotification";

/**
 * OrderReadyNotification — mendengarkan SSE event `order_ready` dan
 * menampilkan toast + memainkan suara ke Kasir.
 */
export default function OrderReadyNotification() {
  const { toasts, notify, dismiss } = useNotification();

  // Unlock AudioContext saat user pertama kali berinteraksi
  useAudioUnlock();

  const handleEvent = useCallback((event) => {
    if (event.type === "order_ready") {
      const { invoiceNumber } = event.data || {};
      notify(
        "order_ready",
        "Pesanan Siap! ✅",
        `Invoice ${invoiceNumber || "—"} sudah siap — silakan proses pembayaran.`
      );
    }
  }, [notify]);

  useSSE(handleEvent);

  return <ToastContainer toasts={toasts} onDismiss={dismiss} />;
}
