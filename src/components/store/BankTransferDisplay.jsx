"use client";

import { useState } from "react";
import { formatRupiah } from "@/lib/utils";

// ─── Nama bank yang didukung ──────────────────────────────────────────────────

const BANK_LABELS = {
  BCA: "Bank BCA",
  Mandiri: "Bank Mandiri",
  BNI: "Bank BNI",
  BRI: "Bank BRI",
};

// ─── BankTransferDisplay ──────────────────────────────────────────────────────

/**
 * BankTransferDisplay — menampilkan instruksi transfer bank lengkap:
 * nama bank, nomor rekening, nama penerima, nominal yang harus ditransfer,
 * dan tombol "Saya Sudah Transfer" untuk notifikasi konfirmasi ke gudang.
 *
 * @param {{
 *   orderId: string,
 *   sseToken: string,
 *   totalAmount: number,
 *   bankTransferBank: string | null,
 *   bankTransferAccount: string | null,
 *   recipientName?: string | null,
 *   onConfirmed?: () => void,
 * }} props
 */
export default function BankTransferDisplay({
  orderId,
  sseToken,
  totalAmount,
  bankTransferBank,
  bankTransferAccount,
  recipientName = null,
  onConfirmed,
}) {
  const [status, setStatus] = useState("idle"); // "idle" | "loading" | "confirmed" | "error"
  const [errorMessage, setErrorMessage] = useState("");

  const bankLabel = BANK_LABELS[bankTransferBank] ?? bankTransferBank ?? "—";

  async function handleCopyAccount() {
    if (!bankTransferAccount) return;
    try { await navigator.clipboard.writeText(bankTransferAccount); } catch { /* diam-diam */ }
  }

  async function handleConfirm() {
    if (status === "loading" || status === "confirmed") return;
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch(`/api/store/orders/${orderId}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sseToken, paymentMethod: "BANK_TRANSFER" }),
      });

      const json = await res.json();

      if (res.ok) {
        setStatus("confirmed");
        onConfirmed?.();
      } else {
        setErrorMessage(
          json?.error?.message || "Gagal mengirim notifikasi. Silakan coba lagi."
        );
        setStatus("error");
      }
    } catch {
      setErrorMessage("Gagal terhubung ke server. Periksa koneksi internet Anda.");
      setStatus("error");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* ── Kartu instruksi transfer ── */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl" aria-hidden="true">🏦</span>
          <p className="text-sm font-semibold text-blue-800">Instruksi Transfer Bank</p>
        </div>

        <dl className="space-y-3 text-sm">
          {/* Bank Tujuan */}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-600 flex-shrink-0">Bank Tujuan</dt>
            <dd className="font-semibold text-gray-900 text-right">{bankLabel}</dd>
          </div>

          {/* Nomor Rekening */}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-600 flex-shrink-0">Nomor Rekening</dt>
            <dd className="flex items-center gap-2">
              <span className="font-mono font-semibold text-gray-900">
                {bankTransferAccount ?? "—"}
              </span>
              {bankTransferAccount && (
                <button
                  type="button"
                  onClick={handleCopyAccount}
                  className="rounded p-1 text-blue-600 hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
                  aria-label="Salin nomor rekening"
                  title="Salin nomor rekening"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              )}
            </dd>
          </div>

          {/* Nama Penerima */}
          {recipientName && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-600 flex-shrink-0">Atas Nama</dt>
              <dd className="font-semibold text-gray-900 text-right">{recipientName}</dd>
            </div>
          )}

          {/* Nominal Transfer */}
          <div className="flex items-center justify-between gap-3 border-t border-blue-200 pt-3 mt-1">
            <dt className="text-gray-700 font-medium flex-shrink-0">Nominal Transfer</dt>
            <dd className="font-bold text-lg text-gray-900">{formatRupiah(totalAmount)}</dd>
          </div>
        </dl>
      </div>

      {/* ── Catatan penting ── */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs text-amber-700">
          ⚠️ Transfer sesuai nominal yang tertera. Pesanan akan diproses setelah
          pembayaran dikonfirmasi oleh tim kami.
        </p>
      </div>

      {/* ── Error message ── */}
      {status === "error" && errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
        >
          <span className="mt-0.5 flex-shrink-0 text-red-500" aria-hidden="true">⚠️</span>
          <p className="text-sm font-medium text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* ── Tombol konfirmasi ── */}
      {status === "confirmed" ? (
        /* State: sudah konfirmasi */
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 rounded-xl border border-green-300 bg-green-50 px-5 py-4"
        >
          <span className="flex-shrink-0 text-xl" aria-hidden="true">✅</span>
          <div>
            <p className="text-sm font-bold text-green-800">Notifikasi Terkirim</p>
            <p className="text-xs text-green-700 mt-0.5">
              Tim kami akan segera memverifikasi pembayaran Anda.
            </p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={status === "loading"}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          aria-busy={status === "loading"}
        >
          {status === "loading" ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
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
              Mengirim Notifikasi...
            </>
          ) : (
            <>
              <span aria-hidden="true">✅</span>
              Saya Sudah Transfer
            </>
          )}
        </button>
      )}
    </div>
  );
}
