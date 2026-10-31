"use client";

/**
 * useBarcodeScanner
 *
 * Custom hook untuk scan barcode via kamera menggunakan:
 * 1. Native BarcodeDetector API (Chrome Android 83+, tidak perlu library)
 * 2. Fallback: tidak ada — tampilkan pesan jika tidak didukung
 *
 * Hook ini TIDAK menyentuh DOM secara langsung. Hanya mengelola stream
 * kamera dan menghubungkannya ke elemen <video> via ref yang diberikan.
 * Ini menghindari konflik dengan React DOM reconciliation.
 *
 * Usage:
 *   const { videoRef, isScanning, error, start, stop } = useBarcodeScanner({ onScan });
 *
 *   <video ref={videoRef} ... />
 */

import { useRef, useState, useCallback, useEffect } from "react";

const SUPPORTED_FORMATS = [
  "code_128",
  "code_39",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "qr_code",
];

export function useBarcodeScanner({ onScan }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null); // requestAnimationFrame id
  const mountedRef = useRef(true);
  const processingRef = useRef(false);

  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState("");

  // Cleanup saat unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopInternal();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopInternal() {
    // Hentikan animation frame loop
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Hentikan semua track kamera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    // Kosongkan srcObject video tanpa memanipulasi children DOM
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    processingRef.current = false;
  }

  const stop = useCallback(() => {
    stopInternal();
    if (mountedRef.current) {
      setIsScanning(false);
      setError("");
    }
  }, []);

  const start = useCallback(async () => {
    setError("");

    // Cek BarcodeDetector support
    if (typeof BarcodeDetector === "undefined") {
      setError(
        "Browser ini tidak mendukung scan barcode otomatis. Gunakan Chrome terbaru di Android, atau gunakan mode Manual."
      );
      return;
    }

    // Cek mediaDevices (butuh HTTPS atau localhost)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError(
        "Kamera tidak dapat diakses. Pastikan membuka via HTTPS dan beri izin kamera."
      );
      return;
    }

    try {
      // Minta akses kamera belakang
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      // Hubungkan ke elemen video via ref — tidak menyentuh DOM children
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Buat BarcodeDetector
      detectorRef.current = new BarcodeDetector({
        formats: SUPPORTED_FORMATS,
      });

      if (mountedRef.current) setIsScanning(true);

      // Loop deteksi via requestAnimationFrame
      const detectLoop = async () => {
        if (!mountedRef.current || !streamRef.current) return;

        const video = videoRef.current;
        if (
          video &&
          video.readyState === video.HAVE_ENOUGH_DATA &&
          !processingRef.current
        ) {
          try {
            const barcodes = await detectorRef.current.detect(video);
            if (barcodes.length > 0 && !processingRef.current) {
              const rawValue = barcodes[0].rawValue;
              if (rawValue) {
                processingRef.current = true;
                // Stop kamera sebelum callback — hindari scan ganda
                stopInternal();
                if (mountedRef.current) {
                  setIsScanning(false);
                  onScan(rawValue);
                }
                return; // Jangan schedule frame berikutnya
              }
            }
          } catch {
            // Deteksi gagal di frame ini — lanjut frame berikutnya
          }
        }

        if (mountedRef.current && streamRef.current) {
          rafRef.current = requestAnimationFrame(detectLoop);
        }
      };

      rafRef.current = requestAnimationFrame(detectLoop);
    } catch (err) {
      if (!mountedRef.current) return;

      if (err.name === "NotAllowedError") {
        setError("Izin kamera ditolak. Buka pengaturan browser dan izinkan akses kamera.");
      } else if (err.name === "NotFoundError") {
        setError("Kamera tidak ditemukan di perangkat ini.");
      } else if (err.name === "NotReadableError") {
        setError("Kamera sedang dipakai aplikasi lain. Tutup aplikasi lain dan coba lagi.");
      } else {
        setError("Tidak dapat mengakses kamera. Pastikan izin kamera sudah diberikan.");
      }
    }
  }, [onScan]);

  return { videoRef, isScanning, error, start, stop };
}
