"use client";

import { useState, useEffect, useCallback } from "react";
import { formatRupiah } from "@/lib/utils";

/**
 * Konfigurasi per metode e-wallet: nama tampilan, ikon emoji, warna tema,
 * dan nomor tujuan (placeholder — nilai aktual dari env/config).
 *
 * Nomor tujuan di sini adalah placeholder. Pada deployment nyata, nilai ini
 * diambil dari environment variable (NEXT_PUBLIC_EWALLET_DANA_NUMBER, dst.)
 * atau dari konfigurasi server.
 */
const EWALLET_CONFIG = {
  EWALLET_DANA: {
    name: "DANA",
    icon: "💙",
    colorClass: "bg-blue-50 border-blue-200",
    headerClass: "bg-blue-600",
    badgeClass: "bg-blue-100 text-blue-700",
    destinationNumber:
      process.env.NEXT_PUBLIC_EWALLET_DANA_NUMBER || "0812-3456-7890",
  },
  EWALLET_OVO: {
    name: "OVO",
    icon: "💜",
    colorClass: "bg-purple-50 border-purple-200",
    headerClass: "bg-purple-600",
    badgeClass: "bg-purple-100 text-purple-700",
    destinationNumber:
      process.env.NEXT_PUBLIC_EWALLET_OVO_NUMBER || "0812-3456-7890",
  },
  EWALLET_GOPAY: {
    name: "GoPay",
    icon: "💚",
    colorClass: "bg-green-50 border-green-200",
    headerClass: "bg-green-600",
    badgeClass: "bg-green-100 text-green-700",
    destinationNumber:
      process.env.NEXT_PUBLIC_EWALLET_GOPAY_NUMBER || "0812-3456-7890",
  },
};

/**
 * Hitung sisa detik dari sekarang hingga `expiresAt`.
 * Mengembalikan 0 jika sudah lewat.
 *
 * @param {string} expiresAt - ISO date string
 * @returns {number} Sisa detik (>= 0)
 */
function getSecondsRemaining(expiresAt) {
  const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  return Math.max(0, diff);
}

/**
 * Format detik menjadi string "MM:SS".
 *
 * @param {number} totalSeconds
 * @returns {string} Contoh: "04:32"
 */
function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * EwalletPaymentDisplay — menampilkan instruksi pembayaran e-wallet.
 *
 * Menampilkan:
 * - Nama dan ikon e-wallet (DANA / OVO / GoPay)
 * - Nomor tujuan transfer
 * - Nominal yang harus dibayar (format Rupiah)
 * - Countdown timer 5 menit dari `expiresAt`
 * - Pesan "Waktu pembayaran habis" saat timer mencapai 0
 *
 * Requirements:
 * - 4.5: Tampilkan instruksi pembayaran e-wallet untuk EWALLET_DANA, EWALLET_OVO, EWALLET_GOPAY
 * - 5.3: Tampilkan batas waktu pembayaran (5 menit) pada halaman konfirmasi
 *
 * @param {{
 *   paymentMethod: "EWALLET_DANA" | "EWALLET_OVO" | "EWALLET_GOPAY",
 *   totalAmount: number,
 *   expiresAt: string
 * }} props
 */
export default function EwalletPaymentDisplay({
  paymentMethod,
  totalAmount,
  expiresAt,
}) {
  const config = EWALLET_CONFIG[paymentMethod];

  const [secondsLeft, setSecondsLeft] = useState(() =>
    getSecondsRemaining(expiresAt)
  );

  const isExpired = secondsLeft === 0;

  // Tick setiap detik hingga expired
  useEffect(() => {
    if (isExpired) return;

    const interval = setInterval(() => {
      const remaining = getSecondsRemaining(expiresAt);
      setSecondsLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, isExpired]);

  // Hitung persentase waktu tersisa untuk progress bar (dari 5 menit = 300 detik)
  const totalDuration = 5 * 60; // 300 detik
  const progressPercent = Math.round((secondsLeft / totalDuration) * 100);

  // Warna progress bar berubah sesuai urgensi
  const progressColorClass =
    secondsLeft > 120
      ? "bg-green-500"
      : secondsLeft > 60
      ? "bg-yellow-500"
      : "bg-red-500";

  if (!config) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        Metode pembayaran tidak dikenali: {paymentMethod}
      </div>
    );
  }

  return (
    <section
      aria-label={`Instruksi pembayaran ${config.name}`}
      className={`overflow-hidden rounded-2xl border ${config.colorClass} shadow-sm`}
    >
      {/* ── Header ── */}
      <div
        className={`${config.headerClass} flex items-center gap-3 px-5 py-4`}
      >
        <span className="text-3xl" aria-hidden="true">
          {config.icon}
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-white/80">
            Pembayaran via
          </p>
          <h2 className="text-xl font-bold text-white">{config.name}</h2>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="space-y-5 p-5">
        {/* Nomor Tujuan */}
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Nomor Tujuan {config.name}
          </p>
          <div className="flex items-center gap-3">
            <p
              className="text-2xl font-bold tracking-widest text-gray-900"
              aria-label={`Nomor tujuan ${config.name}: ${config.destinationNumber}`}
            >
              {config.destinationNumber}
            </p>
            <CopyButton value={config.destinationNumber} label="nomor tujuan" />
          </div>
        </div>

        {/* Nominal */}
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Nominal yang Harus Dibayar
          </p>
          <div className="flex items-center gap-3">
            <p
              className="text-2xl font-bold text-gray-900"
              aria-label={`Nominal: ${formatRupiah(totalAmount)}`}
            >
              {formatRupiah(totalAmount)}
            </p>
            <CopyButton value={String(totalAmount)} label="nominal" />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Pastikan nominal transfer tepat hingga angka terakhir.
          </p>
        </div>

        {/* Countdown Timer */}
        <div aria-live="polite" aria-atomic="true">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Batas Waktu Pembayaran
          </p>

          {isExpired ? (
            /* ── State: Expired ── */
            <div
              role="alert"
              className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
            >
              <span className="text-2xl" aria-hidden="true">
                ⏰
              </span>
              <div>
                <p className="font-semibold text-red-700">
                  Waktu pembayaran habis
                </p>
                <p className="text-xs text-red-600">
                  Silakan buat pesanan baru untuk melanjutkan pembayaran.
                </p>
              </div>
            </div>
          ) : (
            /* ── State: Active countdown ── */
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-mono text-4xl font-bold tabular-nums ${
                    secondsLeft <= 60 ? "text-red-600" : "text-gray-900"
                  }`}
                >
                  {formatCountdown(secondsLeft)}
                </span>
                <span className="text-sm text-gray-500">menit tersisa</span>
              </div>

              {/* Progress bar */}
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
                role="progressbar"
                aria-valuenow={secondsLeft}
                aria-valuemin={0}
                aria-valuemax={totalDuration}
                aria-label={`Waktu tersisa: ${formatCountdown(secondsLeft)}`}
              >
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${progressColorClass}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {secondsLeft <= 60 && (
                <p className="text-xs font-medium text-red-600" role="alert">
                  Segera selesaikan pembayaran sebelum waktu habis!
                </p>
              )}
            </div>
          )}
        </div>

        {/* Instruksi Langkah */}
        {!isExpired && (
          <div className="rounded-xl bg-white/70 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
              Cara Pembayaran
            </p>
            <ol className="space-y-1.5 text-sm text-gray-700">
              <li className="flex gap-2">
                <span
                  className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${config.headerClass}`}
                  aria-hidden="true"
                >
                  1
                </span>
                Buka aplikasi {config.name} di ponsel Anda.
              </li>
              <li className="flex gap-2">
                <span
                  className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${config.headerClass}`}
                  aria-hidden="true"
                >
                  2
                </span>
                Pilih menu <strong>Kirim</strong> atau <strong>Transfer</strong>.
              </li>
              <li className="flex gap-2">
                <span
                  className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${config.headerClass}`}
                  aria-hidden="true"
                >
                  3
                </span>
                Masukkan nomor tujuan{" "}
                <strong>{config.destinationNumber}</strong>.
              </li>
              <li className="flex gap-2">
                <span
                  className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${config.headerClass}`}
                  aria-hidden="true"
                >
                  4
                </span>
                Masukkan nominal <strong>{formatRupiah(totalAmount)}</strong>{" "}
                dengan tepat.
              </li>
              <li className="flex gap-2">
                <span
                  className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${config.headerClass}`}
                  aria-hidden="true"
                >
                  5
                </span>
                Konfirmasi dan selesaikan pembayaran sebelum waktu habis.
              </li>
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Tombol salin ke clipboard dengan feedback visual.
 *
 * @param {{ value: string, label: string }} props
 */
function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API tidak tersedia — abaikan secara diam-diam
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? `${label} disalin` : `Salin ${label}`}
      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 active:scale-95"
    >
      {copied ? (
        <>
          <svg
            className="h-3.5 w-3.5 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
          <span className="text-green-600">Disalin</span>
        </>
      ) : (
        <>
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
            />
          </svg>
          Salin
        </>
      )}
    </button>
  );
}
