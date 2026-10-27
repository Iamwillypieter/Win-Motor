"use client";

import { useEffect, useRef } from "react";

// Konfigurasi reconnect dengan exponential backoff
const INITIAL_RETRY_MS = 1_000;   // 1 detik
const MAX_RETRY_MS = 30_000;      // maks 30 detik
const BACKOFF_FACTOR = 2;

/**
 * useSSE — berlangganan ke /api/sse dan memanggil `onEvent` untuk setiap
 * pesan yang diterima.
 *
 * Fitur:
 * - Reconnect otomatis dengan exponential backoff saat koneksi terputus
 *   (server restart, network error, timeout)
 * - Reconnect segera saat tab kembali visible (visibilitychange)
 *   → kasir/gudang tidak perlu manual refresh setelah laptop sleep
 * - EventSource ditutup otomatis saat komponen unmount
 *
 * @param {(event: { type: string, data: unknown }) => void} onEvent
 *   Callback dipanggil dengan payload JSON yang sudah di-parse.
 */
export default function useSSE(onEvent) {
  // Gunakan ref agar tidak perlu re-subscribe saat parent re-render
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    let es = null;
    let retryCount = 0;
    let retryTimeout = null;
    let unmounted = false;

    /**
     * Buat koneksi SSE baru.
     * Dipanggil pertama kali saat mount dan setiap kali perlu reconnect.
     */
    function connect() {
      if (unmounted) return;

      es = new EventSource("/api/sse");

      es.onopen = () => {
        // Koneksi berhasil — reset backoff counter
        retryCount = 0;
      };

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);

          if (parsed.type === "force_logout") {
            es.close();
            import("next-auth/react").then(({ signOut }) => {
              signOut({ callbackUrl: "/login" });
            });
            return;
          }

          onEventRef.current(parsed);
        } catch (err) {
          console.error("useSSE: failed to parse event data", err);
        }
      };

      es.onerror = () => {
        // EventSource sudah mengalami error — tutup koneksi lama
        es.close();
        es = null;

        if (unmounted) return;

        // Hitung delay berikutnya dengan exponential backoff + sedikit jitter
        const base = Math.min(
          INITIAL_RETRY_MS * Math.pow(BACKOFF_FACTOR, retryCount),
          MAX_RETRY_MS
        );
        const jitter = Math.random() * 500; // 0–500 ms jitter
        const delay = base + jitter;

        retryCount++;

        console.warn(
          `useSSE: koneksi terputus. Reconnect dalam ${Math.round(delay / 1000)}s ` +
            `(percobaan ke-${retryCount})`
        );

        retryTimeout = setTimeout(connect, delay);
      };
    }

    /**
     * Reconnect segera saat tab kembali visible.
     * Mencegah kasir/gudang kehilangan update setelah laptop sleep atau
     * berpindah tab dalam waktu lama.
     */
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;

      // Jika koneksi sudah mati (es null atau readyState CLOSED)
      const isClosed = !es || es.readyState === EventSource.CLOSED;
      if (isClosed) {
        // Batalkan retry yang sedang menunggu dan langsung sambungkan ulang
        if (retryTimeout) {
          clearTimeout(retryTimeout);
          retryTimeout = null;
        }
        retryCount = 0;
        connect();
      }
    }

    connect();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      unmounted = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (es) es.close();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []); // mount sekali, disconnect saat unmount
}
