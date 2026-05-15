"use client";

import { useEffect, useRef } from "react";

/**
 * useOrderStatus — membuka koneksi SSE ke `/api/sse/public?token=<sseToken>`
 * dan memanggil `onEvent` setiap kali menerima event status pesanan.
 *
 * Koneksi hanya dibuka jika `sseToken` tersedia, dan otomatis ditutup
 * saat komponen unmount atau `sseToken` berubah.
 *
 * Events yang mungkin diterima:
 * - `payment_confirmed` — paymentStatus berubah ke "paid"
 * - `order_ready`       — orderStatus berubah ke "ready"
 * - `order_completed`   — pesanan selesai
 * - `qris_expired`      — QRIS kedaluwarsa
 *
 * @param {string | null} invoiceNumber - Nomor invoice pesanan (untuk referensi)
 * @param {string | null} sseToken      - Token one-time untuk koneksi SSE publik
 * @param {(event: { type: string, data?: unknown }) => void} onEvent
 *   Callback yang dipanggil dengan payload JSON yang sudah di-parse.
 */
export function useOrderStatus(invoiceNumber, sseToken, onEvent) {
  // Gunakan ref agar callback terbaru selalu dipakai tanpa perlu re-subscribe
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    // Jangan buka koneksi jika token belum tersedia
    if (!sseToken) return;

    // EventSource hanya tersedia di browser
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    const es = new EventSource(`/api/sse/public?token=${sseToken}`);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        onEventRef.current(event);
      } catch (err) {
        console.error("useOrderStatus: gagal mem-parse data event", err);
      }
    };

    es.onerror = (err) => {
      console.error("useOrderStatus: EventSource error", err);
      // EventSource akan otomatis mencoba reconnect saat error.
    };

    // Cleanup: tutup koneksi saat unmount atau sseToken berubah
    return () => {
      es.close();
    };
  }, [sseToken]); // Re-subscribe hanya jika sseToken berubah
}
