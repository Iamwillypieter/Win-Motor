"use client";

/**
 * BarcodeScanner — komponen kamera scan barcode yang reusable.
 *
 * Menggunakan native BarcodeDetector API via useBarcodeScanner hook.
 * Tidak ada manipulasi DOM eksternal — 100% React-friendly.
 *
 * Props:
 *   onScan(value: string) — dipanggil saat barcode terdeteksi
 *   onStop()              — dipanggil saat user tap Stop
 *   autoStart?            — mulai scan otomatis saat mount (default: false)
 */

import { useEffect } from "react";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

export default function BarcodeScanner({ onScan, onStop, autoStart = false }) {
  const { videoRef, isScanning, error, start, stop } = useBarcodeScanner({
    onScan,
  });

  useEffect(() => {
    if (autoStart) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleStop() {
    stop();
    if (onStop) onStop();
  }

  return (
    <div className="space-y-3">
      {/* Viewport kamera — elemen video SELALU ada, tidak pernah di-unmount */}
      <div className="relative w-full rounded-lg overflow-hidden bg-gray-900 min-h-[200px] flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ display: isScanning ? "block" : "none" }}
        />

        {/* Overlay garis bidik saat scanning */}
        {isScanning && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-36 border-2 border-blue-400 rounded-lg opacity-80">
              <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-blue-400 rounded-tl" />
              <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-blue-400 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-blue-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-blue-400 rounded-br" />
            </div>
          </div>
        )}

        {/* Placeholder saat belum scanning */}
        {!isScanning && !error && (
          <p className="text-gray-400 text-sm text-center px-4 py-10">
            Tekan &ldquo;Mulai Scan&rdquo; lalu arahkan kamera ke barcode produk
          </p>
        )}
      </div>

      {/* Pesan error */}
      {error && (
        <p className="text-sm text-red-600 text-center">{error}</p>
      )}

      {/* Tombol kontrol */}
      <div className="flex justify-center">
        {!isScanning ? (
          <button
            onClick={start}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Mulai Scan
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="rounded-lg bg-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
