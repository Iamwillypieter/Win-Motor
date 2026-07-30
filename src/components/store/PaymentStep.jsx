"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { formatRupiah } from "@/lib/utils";

// ── Konstanta ──────────────────────────────────────────────────────────────────

/** Batas waktu pembayaran: 60 menit */
const PAYMENT_TIMEOUT_MS = 60 * 60 * 1000;

const PAYMENT_LABELS = {
  CASH: "Bayar di Tempat (COD)",
  QRIS: "QRIS",
  EWALLET_DANA: "DANA",
  EWALLET_OVO: "OVO",
  EWALLET_GOPAY: "GoPay",
  BANK_TRANSFER: "Transfer Bank",
};

const EWALLET_CONFIG = {
  EWALLET_DANA: {
    name: "DANA",
    icon: "💙",
    color: "bg-blue-600",
    border: "border-blue-200",
    bg: "bg-blue-50",
    number: process.env.NEXT_PUBLIC_EWALLET_DANA_NUMBER || "",
  },
  EWALLET_OVO: {
    name: "OVO",
    icon: "💜",
    color: "bg-purple-600",
    border: "border-purple-200",
    bg: "bg-purple-50",
    number: process.env.NEXT_PUBLIC_EWALLET_OVO_NUMBER || "",
  },
  EWALLET_GOPAY: {
    name: "GoPay",
    icon: "💚",
    color: "bg-green-600",
    border: "border-green-200",
    bg: "bg-green-50",
    number: process.env.NEXT_PUBLIC_EWALLET_GOPAY_NUMBER || "",
  },
};

const BANK_CONFIG = {
  BCA: { label: "Bank BCA", icon: "🏦" },
  Mandiri: { label: "Bank Mandiri", icon: "🏦" },
  BNI: { label: "Bank BNI", icon: "🏦" },
  BRI: { label: "Bank BRI", icon: "🏦" },
};

// ── Utilitas ──────────────────────────────────────────────────────────────────

function formatCountdown(ms) {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* diam-diam */ }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? `${label} disalin` : `Salin ${label}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-all hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-95"
    >
      {copied ? (
        <><svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg><span className="text-green-600">Disalin!</span></>
      ) : (
        <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Salin</>
      )}
    </button>
  );
}

// ── CountdownTimer ────────────────────────────────────────────────────────────

function CountdownTimer({ expiresAt, onExpired }) {
  const [msLeft, setMsLeft] = useState(() => Math.max(0, expiresAt - Date.now()));
  const timerRef = useRef(null);

  useEffect(() => {
    if (msLeft <= 0) { onExpired?.(); return; }
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, expiresAt - Date.now());
      setMsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        onExpired?.();
      }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [expiresAt, onExpired]);

  const pct = Math.max(0, (msLeft / PAYMENT_TIMEOUT_MS) * 100);
  const isUrgent = msLeft < 10 * 60 * 1000; // < 10 menit

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Batas waktu pembayaran</span>
        <span className={`font-mono font-bold tabular-nums text-sm ${isUrgent ? "text-red-600" : "text-gray-800"}`}>
          {formatCountdown(msLeft)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? "bg-red-500" : msLeft < 20 * 60 * 1000 ? "bg-amber-400" : "bg-blue-500"}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Sisa waktu ${formatCountdown(msLeft)}`}
        />
      </div>
      {isUrgent && (
        <p className="text-xs font-medium text-red-600" role="alert">
          ⚠️ Segera selesaikan pembayaran sebelum waktu habis!
        </p>
      )}
    </div>
  );
}

// ── InstructionStep ───────────────────────────────────────────────────────────

function InstructionStep({ n, text, colorClass }) {
  return (
    <li className="flex items-start gap-3 text-sm text-gray-700">
      <span
        className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${colorClass}`}
        aria-hidden="true"
      >
        {n}
      </span>
      <span>{text}</span>
    </li>
  );
}

// ── ConfirmButton ─────────────────────────────────────────────────────────────

function ConfirmButton({ orderId, sseToken, paymentMethod, totalAmount, onConfirmed, label }) {
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState("");

  async function handleClick() {
    if (state === "loading" || state === "done") return;
    setState("loading");
    setError("");
    try {
      const res = await fetch(`/api/store/orders/${orderId}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sseToken, paymentMethod }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message || "Gagal mengirim konfirmasi. Coba lagi.");
        setState("error");
        return;
      }
      setState("done");
      onConfirmed?.();
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi Anda.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-green-300 bg-green-50 px-5 py-4">
        <span className="text-2xl" aria-hidden="true">✅</span>
        <div>
          <p className="text-sm font-bold text-green-800">Konfirmasi Diterima!</p>
          <p className="text-xs text-green-700 mt-0.5">
            Tim kami sedang memverifikasi. Halaman pesanan Anda akan diperbarui otomatis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {state === "error" && error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="text-red-500" aria-hidden="true">⚠️</span>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "loading"}
        aria-busy={state === "loading"}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === "loading" ? (
          <><svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Mengirim Konfirmasi...</>
        ) : (
          <>{label}</>
        )}
      </button>
      <p className="text-center text-xs text-gray-400">
        Tekan setelah pembayaran {formatRupiah(totalAmount)} selesai
      </p>
    </div>
  );
}

// ── PaymentInstructions per metode ────────────────────────────────────────────

function CashInstructions() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4 rounded-xl border border-green-200 bg-green-50 p-5">
        <span className="text-4xl" aria-hidden="true">💵</span>
        <div>
          <p className="font-semibold text-green-800">Bayar di Tempat (COD)</p>
          <p className="mt-1 text-sm text-green-700">
            Pembayaran dilakukan saat barang diterima. Siapkan uang tunai sesuai nominal.
          </p>
        </div>
      </div>
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Yang perlu dilakukan</p>
        <ol className="space-y-2.5">
          <InstructionStep n={1} text="Pesanan Anda sedang disiapkan oleh tim kami." colorClass="bg-green-600" />
          <InstructionStep n={2} text="Anda akan dihubungi via WhatsApp untuk konfirmasi pengiriman." colorClass="bg-green-600" />
          <InstructionStep n={3} text="Siapkan uang tunai saat kurir tiba." colorClass="bg-green-600" />
        </ol>
      </div>
    </div>
  );
}

function EwalletInstructions({ paymentMethod, totalAmount, orderId, sseToken, onConfirmed }) {
  const cfg = EWALLET_CONFIG[paymentMethod];
  if (!cfg) return null;

  const steps = [
    `Buka aplikasi ${cfg.name} di ponsel Anda`,
    `Pilih menu "Kirim" atau "Transfer"`,
    cfg.number
      ? `Masukkan nomor tujuan: ${cfg.number}`
      : `Masukkan nomor ${cfg.name} toko kami`,
    `Ketik nominal ${formatRupiah(totalAmount)} dengan tepat`,
    `Selesaikan dan simpan bukti pembayaran`,
    `Tekan tombol konfirmasi di bawah ini`,
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className={`rounded-2xl ${cfg.bg} border ${cfg.border} overflow-hidden`}>
        <div className={`${cfg.color} flex items-center gap-3 px-5 py-4`}>
          <span className="text-3xl" aria-hidden="true">{cfg.icon}</span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-white/80">Pembayaran via</p>
            <p className="text-xl font-bold text-white">{cfg.name}</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Nomor tujuan */}
          {cfg.number && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">
                Nomor Tujuan {cfg.name}
              </p>
              <div className="flex items-center gap-3">
                <p className="text-2xl font-bold tracking-widest text-gray-900">{cfg.number}</p>
                <CopyButton value={cfg.number} label={`nomor ${cfg.name}`} />
              </div>
            </div>
          )}

          {/* Nominal */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">
              Nominal yang Harus Dibayar
            </p>
            <div className="flex items-center gap-3">
              <p className="text-3xl font-bold text-gray-900">{formatRupiah(totalAmount)}</p>
              <CopyButton value={String(totalAmount)} label="nominal" />
            </div>
            <p className="mt-1 text-xs text-gray-500">Pastikan nominal tepat hingga angka terakhir.</p>
          </div>

          {/* Langkah */}
          <div className="rounded-xl bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-3">Cara Pembayaran</p>
            <ol className="space-y-2.5">
              {steps.map((s, i) => (
                <InstructionStep key={i} n={i + 1} text={s} colorClass={cfg.color} />
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* Tombol konfirmasi */}
      <ConfirmButton
        orderId={orderId}
        sseToken={sseToken}
        paymentMethod={paymentMethod}
        totalAmount={totalAmount}
        onConfirmed={onConfirmed}
        label={`✅ Saya Sudah Bayar via ${cfg.name}`}
      />
    </div>
  );
}

function BankTransferInstructions({ totalAmount, orderId, sseToken, bankTransferBank, bankTransferAccount, onConfirmed }) {
  // Coba baca dari env jika tidak ada di order
  const bankKey = bankTransferBank;
  const bankInfo = BANK_CONFIG[bankKey] ?? { label: bankKey ?? "Bank Toko", icon: "🏦" };

  const steps = [
    `Buka aplikasi mobile banking atau ATM ${bankInfo.label}`,
    "Pilih menu Transfer Antar Bank",
    bankTransferAccount
      ? `Masukkan nomor rekening tujuan: ${bankTransferAccount}`
      : "Masukkan nomor rekening tujuan toko kami",
    `Masukkan nominal ${formatRupiah(totalAmount)} dengan tepat`,
    "Konfirmasi dan selesaikan transfer",
    "Tekan tombol konfirmasi di bawah ini",
  ];

  return (
    <div className="space-y-5">
      {/* Kartu instruksi */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 overflow-hidden">
        <div className="bg-blue-700 flex items-center gap-3 px-5 py-4">
          <span className="text-3xl" aria-hidden="true">🏦</span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-white/80">Pembayaran via</p>
            <p className="text-xl font-bold text-white">Transfer Bank</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Info bank */}
          {(bankTransferBank || bankTransferAccount) && (
            <dl className="space-y-3 text-sm">
              {bankTransferBank && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-600">Bank Tujuan</dt>
                  <dd className="font-semibold text-gray-900">{bankInfo.label}</dd>
                </div>
              )}
              {bankTransferAccount && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-600">Nomor Rekening</dt>
                  <dd className="flex items-center gap-2">
                    <span className="font-mono font-bold text-gray-900">{bankTransferAccount}</span>
                    <CopyButton value={bankTransferAccount} label="nomor rekening" />
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-blue-200 pt-3">
                <dt className="font-medium text-gray-700">Nominal Transfer</dt>
                <dd className="flex items-center gap-2">
                  <span className="text-lg font-bold text-gray-900">{formatRupiah(totalAmount)}</span>
                  <CopyButton value={String(totalAmount)} label="nominal" />
                </dd>
              </div>
            </dl>
          )}

          {!bankTransferBank && !bankTransferAccount && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-700">
                ℹ️ Detail rekening tujuan akan dikirim ke WhatsApp Anda.
              </p>
            </div>
          )}

          {/* Langkah */}
          <div className="rounded-xl bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-3">Cara Transfer</p>
            <ol className="space-y-2.5">
              {steps.map((s, i) => (
                <InstructionStep key={i} n={i + 1} text={s} colorClass="bg-blue-700" />
              ))}
            </ol>
          </div>

          {/* Peringatan */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-700">
              ⚠️ Transfer sesuai nominal tepat. Pesanan diproses setelah pembayaran diverifikasi tim kami.
            </p>
          </div>
        </div>
      </div>

      {/* Tombol konfirmasi */}
      <ConfirmButton
        orderId={orderId}
        sseToken={sseToken}
        paymentMethod="BANK_TRANSFER"
        totalAmount={totalAmount}
        onConfirmed={onConfirmed}
        label="✅ Saya Sudah Transfer"
      />
    </div>
  );
}

// ── PaymentStep — komponen utama ──────────────────────────────────────────────

/**
 * PaymentStep — Step 2 dari checkout: instruksi pembayaran + timer + konfirmasi.
 *
 * @param {{
 *   order: { _id, invoiceNumber, paymentMethod, totalAmount, sseToken,
 *            bankTransferBank, bankTransferAccount, createdAt },
 *   onDone: (invoiceNumber: string) => void
 * }} props
 */
export default function PaymentStep({ order, onDone }) {
  const [isExpired, setIsExpired] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  // Hitung waktu kedaluwarsa dari createdAt + PAYMENT_TIMEOUT_MS
  const expiresAt = new Date(order.createdAt).getTime() + PAYMENT_TIMEOUT_MS;

  const handleExpired = useCallback(() => setIsExpired(true), []);

  const handleConfirmed = useCallback(() => {
    setPaymentConfirmed(true);
  }, []);

  const isCash = order.paymentMethod === "CASH";

  return (
    <div className="mt-6 space-y-6">
      {/* ── Header ringkasan ── */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500 font-medium">No. Pesanan</p>
            <p className="font-mono font-bold text-gray-900">{order.invoiceNumber}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 font-medium">Total</p>
            <p className="text-lg font-bold text-gray-900">{formatRupiah(order.totalAmount)}</p>
          </div>
        </div>

        {/* Metode pembayaran */}
        <div className="px-5 py-3 bg-gray-50 flex items-center gap-2 text-sm">
          <span className="text-gray-500">Metode Bayar:</span>
          <span className="font-semibold text-gray-900">{PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}</span>
        </div>
      </div>

      {/* ── Timer — hanya untuk pembayaran non-COD ── */}
      {!isCash && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          {isExpired ? (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
              <span className="text-3xl" aria-hidden="true">⏰</span>
              <div>
                <p className="font-semibold text-red-800">Waktu Pembayaran Habis</p>
                <p className="text-sm text-red-600 mt-0.5">
                  Pesanan ini telah kedaluwarsa. Silakan buat pesanan baru.
                </p>
              </div>
            </div>
          ) : (
            <CountdownTimer expiresAt={expiresAt} onExpired={handleExpired} />
          )}
        </div>
      )}

      {/* ── Banner sudah konfirmasi ── */}
      {paymentConfirmed && (
        <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <span className="text-3xl" aria-hidden="true">⏳</span>
          <div>
            <p className="font-bold text-blue-800">Menunggu Verifikasi</p>
            <p className="text-sm text-blue-700 mt-0.5">
              Konfirmasi Anda diterima. Tim kami sedang memverifikasi pembayaran.
            </p>
          </div>
        </div>
      )}

      {/* ── Instruksi pembayaran ── */}
      {!isExpired && (
        <section aria-labelledby="payment-instruction-heading">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 id="payment-instruction-heading" className="text-base font-semibold text-gray-900">
                Instruksi Pembayaran
              </h2>
            </div>
            <div className="p-5">
              {isCash && <CashInstructions />}

              {(order.paymentMethod === "EWALLET_DANA" ||
                order.paymentMethod === "EWALLET_OVO" ||
                order.paymentMethod === "EWALLET_GOPAY") && (
                <EwalletInstructions
                  paymentMethod={order.paymentMethod}
                  totalAmount={order.totalAmount}
                  orderId={order._id}
                  sseToken={order.sseToken}
                  onConfirmed={handleConfirmed}
                />
              )}

              {order.paymentMethod === "BANK_TRANSFER" && (
                <BankTransferInstructions
                  totalAmount={order.totalAmount}
                  orderId={order._id}
                  sseToken={order.sseToken}
                  bankTransferBank={order.bankTransferBank ?? null}
                  bankTransferAccount={order.bankTransferAccount ?? null}
                  onConfirmed={handleConfirmed}
                />
              )}

              {order.paymentMethod === "QRIS" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                  <p className="text-sm text-amber-700">
                    Kode QR QRIS akan tampil di halaman detail pesanan.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Tombol lihat detail pesanan ── */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onDone(order.invoiceNumber)}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
        >
          Lihat Detail Pesanan →
        </button>
        {!paymentConfirmed && !isCash && (
          <p className="text-center text-xs text-gray-400">
            Anda juga bisa kembali ke halaman ini melalui nomor pesanan Anda
          </p>
        )}
      </div>
    </div>
  );
}
