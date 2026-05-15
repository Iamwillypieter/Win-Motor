"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";

/** Durasi QRIS dalam milidetik (5 menit) */
const QRIS_DURATION_MS = 5 * 60 * 1000;

/**
 * Memformat sisa waktu (detik) menjadi string "MM:SS".
 *
 * @param {number} totalSeconds - Sisa waktu dalam detik (>= 0)
 * @returns {string} Format "MM:SS", contoh: "04:32"
 */
function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Menghitung sisa waktu dalam detik dari sekarang hingga `expiresAt`.
 * Mengembalikan 0 jika sudah kedaluwarsa.
 *
 * @param {string} expiresAt - ISO date string waktu kedaluwarsa
 * @returns {number} Sisa waktu dalam detik (>= 0)
 */
function calcSecondsLeft(expiresAt) {
  const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  return Math.max(0, diff);
}

/**
 * QrisPaymentDisplay — menampilkan QR Code QRIS, countdown timer 5 menit,
 * dan state kedaluwarsa dengan tombol "Buat Ulang Kode QR".
 *
 * Requirements:
 * - 5.3: Tampilkan kode QR yang dapat dipindai beserta batas waktu pembayaran (5 menit)
 * - 5.6: Jika QRIS kedaluwarsa, tampilkan "Kode QR kedaluwarsa" dan tombol "Buat Ulang Kode QR"
 * - 5.7: Saat "Buat Ulang Kode QR" ditekan, panggil onRefresh untuk menghasilkan kode baru
 *
 * @param {{
 *   qrisCode: string,
 *   qrisExpiresAt: string,
 *   orderId: string,
 *   onRefresh: () => void
 * }} props
 */
export default function QrisPaymentDisplay({
  qrisCode,
  qrisExpiresAt,
  orderId,
  onRefresh,
}) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    calcSecondsLeft(qrisExpiresAt)
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef(null);

  // Jalankan countdown — dimulai ulang setiap kali qrisExpiresAt berubah (kode baru digenerate)
  useEffect(() => {
    // Hitung ulang sisa waktu saat effect dijalankan
    const initial = calcSecondsLeft(qrisExpiresAt);
    setSecondsLeft(initial);
    setIsRefreshing(false);

    if (initial <= 0) return;

    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    intervalRef.current = id;
    return () => clearInterval(id);
  }, [qrisExpiresAt]); // re-run hanya saat kode QRIS baru digenerate

  const isExpired = secondsLeft <= 0;

  // Persentase sisa waktu untuk progress ring
  const progressPercent = Math.min(
    100,
    (secondsLeft / (QRIS_DURATION_MS / 1000)) * 100
  );

  // Warna countdown berubah sesuai urgensi
  const timerColor =
    secondsLeft > 60
      ? "text-green-600"
      : secondsLeft > 30
      ? "text-amber-500"
      : "text-red-500";

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } catch {
      // onRefresh bertanggung jawab menangani error-nya sendiri;
      // reset state agar tombol bisa ditekan lagi
      setIsRefreshing(false);
    }
  }, [isRefreshing, onRefresh]);

  return (
    <section
      aria-label="Pembayaran QRIS"
      className="flex flex-col items-center gap-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      {/* ── Judul ── */}
      <div className="text-center">
        <h2 className="text-base font-semibold text-gray-900">
          Scan QR Code untuk Membayar
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Gunakan aplikasi mobile banking atau e-wallet yang mendukung QRIS
        </p>
      </div>

      {/* ── Area QR Code / Expired ── */}
      <div className="relative flex items-center justify-center">
        {/* QR Code */}
        <div
          className={`rounded-xl border-2 p-4 transition-all duration-300 ${
            isExpired
              ? "border-red-200 bg-red-50 opacity-30 blur-[2px] select-none pointer-events-none"
              : "border-gray-200 bg-white"
          }`}
          aria-hidden={isExpired}
        >
          <QRCodeSVG
            value={qrisCode || " "}
            size={200}
            level="M"
            includeMargin={false}
            aria-label={`QR Code QRIS untuk pesanan ${orderId}`}
          />
        </div>

        {/* Overlay kedaluwarsa */}
        {isExpired && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl"
            role="status"
            aria-live="assertive"
          >
            <span className="text-4xl" aria-hidden="true">⏰</span>
            <p className="text-center text-sm font-semibold text-red-600">
              Kode QR kedaluwarsa
            </p>
          </div>
        )}
      </div>

      {/* ── Countdown Timer ── */}
      {!isExpired && (
        <div
          className="flex flex-col items-center gap-1"
          role="timer"
          aria-label={`Sisa waktu pembayaran: ${formatCountdown(secondsLeft)}`}
          aria-live="off"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Batas Waktu Pembayaran
          </p>

          {/* Progress bar */}
          <div
            className="h-1.5 w-40 overflow-hidden rounded-full bg-gray-100"
            aria-hidden="true"
          >
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                secondsLeft > 60
                  ? "bg-green-500"
                  : secondsLeft > 30
                  ? "bg-amber-400"
                  : "bg-red-500"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <p
            className={`text-3xl font-bold tabular-nums tracking-tight ${timerColor}`}
          >
            {formatCountdown(secondsLeft)}
          </p>

          {secondsLeft <= 60 && (
            <p className="text-xs font-medium text-amber-600" role="alert">
              Segera selesaikan pembayaran!
            </p>
          )}
        </div>
      )}

      {/* ── Tombol Buat Ulang (hanya saat expired) ── */}
      {isExpired && (
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          aria-busy={isRefreshing}
          className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshing ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Membuat Kode Baru...
            </>
          ) : (
            <>
              <svg
                className="h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Buat Ulang Kode QR
            </>
          )}
        </button>
      )}

      {/* ── Instruksi singkat ── */}
      {!isExpired && (
        <ol className="w-full max-w-xs space-y-1.5 text-xs text-gray-500">
          <li className="flex items-start gap-2">
            <span
              className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600"
              aria-hidden="true"
            >
              1
            </span>
            Buka aplikasi mobile banking atau e-wallet Anda
          </li>
          <li className="flex items-start gap-2">
            <span
              className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600"
              aria-hidden="true"
            >
              2
            </span>
            Pilih menu "Scan QR" atau "Bayar"
          </li>
          <li className="flex items-start gap-2">
            <span
              className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600"
              aria-hidden="true"
            >
              3
            </span>
            Arahkan kamera ke QR Code di atas dan konfirmasi pembayaran
          </li>
        </ol>
      )}
    </section>
  );
}
