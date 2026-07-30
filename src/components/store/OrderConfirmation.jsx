"use client";

import { useState, useEffect, useCallback } from "react";
import { useOrderStatus } from "@/hooks/useOrderStatus";
import { formatRupiah } from "@/lib/utils";
import BankTransferDisplay from "@/components/store/BankTransferDisplay";

// ─── Label metode pembayaran ────────────────────────────────────────────────

const PAYMENT_METHOD_LABELS = {
  CASH: "Bayar di Tempat (COD)",
  QRIS: "QRIS",
  EWALLET_DANA: "DANA",
  EWALLET_OVO: "OVO",
  EWALLET_GOPAY: "GoPay",
  BANK_TRANSFER: "Transfer Bank",
};

const PAYMENT_METHOD_ICONS = {
  CASH: "💵",
  QRIS: "📱",
  EWALLET_DANA: "💙",
  EWALLET_OVO: "💜",
  EWALLET_GOPAY: "💚",
  BANK_TRANSFER: "🏦",
};

// ─── Countdown Timer ─────────────────────────────────────────────────────────

/**
 * CountdownTimer — menampilkan sisa waktu hingga `expiresAt`.
 * Mengembalikan null jika sudah expired.
 *
 * @param {{ expiresAt: string, onExpired: () => void }} props
 */
function CountdownTimer({ expiresAt, onExpired }) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const diff = Math.floor((new Date(expiresAt) - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  useEffect(() => {
    if (secondsLeft <= 0) {
      onExpired?.();
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onExpired?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt, onExpired, secondsLeft]);

  if (secondsLeft <= 0) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  const isUrgent = secondsLeft <= 60;

  return (
    <span
      className={`font-mono font-semibold tabular-nums ${
        isUrgent ? "text-red-600" : "text-amber-600"
      }`}
      aria-live="polite"
      aria-label={`Sisa waktu: ${minutes} menit ${seconds} detik`}
    >
      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

// ─── QRIS Payment Display ─────────────────────────────────────────────────────

/**
 * QrisPaymentDisplay — menampilkan QR Code QRIS, countdown timer 5 menit,
 * dan tombol "Buat Ulang Kode QR" saat expired.
 *
 * Requirements:
 * - 5.3: Tampilkan kode QR yang dapat dipindai beserta batas waktu pembayaran (5 menit)
 * - 5.6: Tampilkan "Kode QR kedaluwarsa" dan tombol "Buat Ulang Kode QR" saat expired
 * - 5.7: Tombol "Buat Ulang Kode QR" menghasilkan kode QRIS baru
 *
 * @param {{ orderId: string, qrisCode: string | null, qrisExpiresAt: string | null, onRegenerate: () => void, isRegenerating: boolean }} props
 */
function QrisPaymentDisplay({
  orderId,
  qrisCode,
  qrisExpiresAt,
  onRegenerate,
  isRegenerating,
}) {
  const [isExpired, setIsExpired] = useState(() => {
    if (!qrisExpiresAt) return true;
    return new Date(qrisExpiresAt) <= new Date();
  });

  // Reset expired state when qrisCode/qrisExpiresAt changes (after regeneration)
  useEffect(() => {
    if (!qrisExpiresAt) {
      setIsExpired(true);
      return;
    }
    setIsExpired(new Date(qrisExpiresAt) <= new Date());
  }, [qrisCode, qrisExpiresAt]);

  const handleExpired = useCallback(() => {
    setIsExpired(true);
  }, []);

  if (!qrisCode) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
        <p className="text-sm text-amber-700">Kode QR belum tersedia.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isExpired ? (
        /* ── Expired State ── */
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-center space-y-3">
          <div className="text-3xl" aria-hidden="true">⏰</div>
          <p className="text-sm font-semibold text-red-700">Kode QR kedaluwarsa</p>
          <p className="text-xs text-red-600">
            Batas waktu pembayaran telah habis. Buat ulang kode QR untuk melanjutkan.
          </p>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            aria-busy={isRegenerating}
          >
            {isRegenerating ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Membuat Ulang...
              </>
            ) : (
              "🔄 Buat Ulang Kode QR"
            )}
          </button>
        </div>
      ) : (
        /* ── Active QR State ── */
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
            <span className="text-sm text-amber-700 font-medium">Batas waktu pembayaran:</span>
            {qrisExpiresAt && (
              <CountdownTimer expiresAt={qrisExpiresAt} onExpired={handleExpired} />
            )}
          </div>

          {/* QR Code display — render as image from base64/URL or as text fallback */}
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-white p-6">
            {qrisCode.startsWith("data:image") || qrisCode.startsWith("http") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrisCode}
                alt="Kode QR QRIS untuk pembayaran"
                className="h-48 w-48 object-contain"
              />
            ) : (
              /* Fallback: tampilkan sebagai teks jika bukan URL/base64 */
              <div
                className="flex h-48 w-48 items-center justify-center rounded-lg bg-gray-100 p-3"
                role="img"
                aria-label="Kode QR QRIS"
              >
                <p className="break-all text-center font-mono text-xs text-gray-600">
                  {qrisCode}
                </p>
              </div>
            )}
            <p className="text-xs text-gray-500 text-center">
              Pindai kode QR ini menggunakan aplikasi pembayaran yang mendukung QRIS
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── E-Wallet Payment Display ─────────────────────────────────────────────────

const EWALLET_CONFIG = {
  EWALLET_DANA: {
    name: "DANA",
    icon: "💙",
    colorClass: "bg-blue-50 border-blue-200",
    headerClass: "bg-blue-600",
    destinationNumber: process.env.NEXT_PUBLIC_EWALLET_DANA_NUMBER || "",
  },
  EWALLET_OVO: {
    name: "OVO",
    icon: "💜",
    colorClass: "bg-purple-50 border-purple-200",
    headerClass: "bg-purple-600",
    destinationNumber: process.env.NEXT_PUBLIC_EWALLET_OVO_NUMBER || "",
  },
  EWALLET_GOPAY: {
    name: "GoPay",
    icon: "💚",
    colorClass: "bg-green-50 border-green-200",
    headerClass: "bg-green-600",
    destinationNumber: process.env.NEXT_PUBLIC_EWALLET_GOPAY_NUMBER || "",
  },
};

/**
 * CopyButton — tombol salin ke clipboard dengan feedback visual.
 */
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
      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-95"
    >
      {copied ? (
        <><svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg><span className="text-green-600">Disalin</span></>
      ) : (
        <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>Salin</>
      )}
    </button>
  );
}

/**
 * EwalletPaymentDisplay — instruksi pembayaran e-wallet step-by-step
 * dengan tombol "Saya Sudah Bayar" untuk konfirmasi ke gudang.
 */
function EwalletPaymentDisplay({ paymentMethod, totalAmount, orderId, sseToken, onPaymentSubmitted }) {
  const config = EWALLET_CONFIG[paymentMethod];
  const [confirmState, setConfirmState] = useState("idle"); // idle | loading | done | error
  const [confirmError, setConfirmError] = useState("");

  async function handleConfirm() {
    if (confirmState === "loading" || confirmState === "done") return;
    setConfirmState("loading");
    setConfirmError("");
    try {
      const res = await fetch(`/api/store/orders/${orderId}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sseToken, paymentMethod }),
      });
      const json = await res.json();
      if (!res.ok) {
        setConfirmError(json?.error?.message || "Gagal mengirim konfirmasi. Coba lagi.");
        setConfirmState("error");
        return;
      }
      setConfirmState("done");
      onPaymentSubmitted?.();
    } catch {
      setConfirmError("Gagal terhubung ke server. Periksa koneksi internet Anda.");
      setConfirmState("error");
    }
  }

  if (!config) return null;

  const steps = [
    `Buka aplikasi ${config.name} di ponsel Anda`,
    `Pilih menu "Kirim" atau "Transfer"`,
    config.destinationNumber
      ? `Masukkan nomor tujuan: ${config.destinationNumber}`
      : `Masukkan nomor tujuan ${config.name} toko kami`,
    `Masukkan nominal ${formatRupiah(totalAmount)} dengan tepat`,
    `Selesaikan pembayaran, lalu tekan tombol konfirmasi di bawah`,
  ];

  return (
    <div className={`overflow-hidden rounded-2xl border ${config.colorClass} shadow-sm`}>
      {/* Header */}
      <div className={`${config.headerClass} flex items-center gap-3 px-5 py-4`}>
        <span className="text-3xl" aria-hidden="true">{config.icon}</span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-white/80">Pembayaran via</p>
          <h3 className="text-xl font-bold text-white">{config.name}</h3>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {/* Nomor tujuan & nominal */}
        {config.destinationNumber && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Nomor Tujuan {config.name}</p>
            <div className="flex items-center gap-3">
              <p className="text-xl font-bold tracking-widest text-gray-900">{config.destinationNumber}</p>
              <CopyButton value={config.destinationNumber} label="nomor tujuan" />
            </div>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Nominal yang Harus Dibayar</p>
          <div className="flex items-center gap-3">
            <p className="text-2xl font-bold text-gray-900">{formatRupiah(totalAmount)}</p>
            <CopyButton value={String(totalAmount)} label="nominal" />
          </div>
          <p className="mt-1 text-xs text-gray-500">Pastikan nominal transfer tepat hingga angka terakhir.</p>
        </div>

        {/* Langkah-langkah */}
        <div className="rounded-xl bg-white/80 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Cara Pembayaran</p>
          <ol className="space-y-2.5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                <span
                  className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${config.headerClass}`}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Error */}
        {confirmState === "error" && confirmError && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <span className="flex-shrink-0 text-red-500" aria-hidden="true">⚠️</span>
            <p className="text-sm font-medium text-red-700">{confirmError}</p>
          </div>
        )}

        {/* Tombol konfirmasi / sudah dikonfirmasi */}
        {confirmState === "done" ? (
          <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-green-300 bg-green-50 px-5 py-4">
            <span className="flex-shrink-0 text-2xl" aria-hidden="true">✅</span>
            <div>
              <p className="text-sm font-bold text-green-800">Konfirmasi Terkirim</p>
              <p className="text-xs text-green-700 mt-0.5">Tim kami akan memverifikasi pembayaran Anda segera.</p>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmState === "loading"}
            aria-busy={confirmState === "loading"}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed ${config.headerClass} hover:opacity-90 focus-visible:ring-blue-500`}
          >
            {confirmState === "loading" ? (
              <><svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Mengirim Konfirmasi...</>
            ) : (
              <>✅ Saya Sudah Bayar via {config.name}</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Payment Instructions Section ────────────────────────────────────────────

/**
 * PaymentInstructions — menampilkan instruksi pembayaran sesuai metode.
 */
function PaymentInstructions({ order, onRegenerate, isRegenerating, onPaymentSubmitted }) {
  const { paymentMethod, qrisCode, qrisExpiresAt, totalAmount, _id, sseToken } = order;

  if (paymentMethod === "CASH") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
        <span className="mt-0.5 flex-shrink-0 text-xl" aria-hidden="true">💵</span>
        <div>
          <p className="text-sm font-semibold text-green-800">Bayar di Tempat (COD)</p>
          <p className="mt-1 text-sm text-green-700">
            Pembayaran akan dilakukan saat barang diterima (COD)
          </p>
        </div>
      </div>
    );
  }

  if (paymentMethod === "QRIS") {
    return (
      <QrisPaymentDisplay
        orderId={_id}
        qrisCode={qrisCode}
        qrisExpiresAt={qrisExpiresAt}
        onRegenerate={onRegenerate}
        isRegenerating={isRegenerating}
      />
    );
  }

  if (
    paymentMethod === "EWALLET_DANA" ||
    paymentMethod === "EWALLET_OVO" ||
    paymentMethod === "EWALLET_GOPAY"
  ) {
    return (
      <EwalletPaymentDisplay
        paymentMethod={paymentMethod}
        totalAmount={totalAmount}
        orderId={_id}
        sseToken={sseToken}
        onPaymentSubmitted={onPaymentSubmitted}
      />
    );
  }

  if (paymentMethod === "BANK_TRANSFER") {
    return (
      <BankTransferDisplay
        orderId={_id}
        sseToken={sseToken}
        totalAmount={totalAmount}
        bankTransferBank={order.bankTransferBank ?? null}
        bankTransferAccount={order.bankTransferAccount ?? null}
        recipientName={order.bankTransferRecipientName ?? null}
        onConfirmed={onPaymentSubmitted}
      />
    );
  }

  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * OrderConfirmation — komponen utama halaman konfirmasi pesanan online.
 *
 * Menampilkan:
 * - Detail pesanan (invoiceNumber, item, total, info pelanggan)
 * - Status pembayaran real-time via `useOrderStatus`
 * - Instruksi pembayaran sesuai metode
 * - State "Pembayaran Diterima" saat paymentStatus berubah ke "paid"
 *
 * Requirements:
 * - 5.2: Tampilkan invoiceNumber, ringkasan item, total harga, metode pembayaran,
 *         nama pelanggan, dan alamat pengiriman
 * - 5.3: QRIS → tampilkan QR Code + countdown 5 menit
 * - 5.4: CASH → tampilkan instruksi COD
 * - 5.5: paymentStatus "paid" → tampilkan "Pembayaran Diterima" secara real-time
 *
 * @param {{ order: {
 *   _id: string,
 *   invoiceNumber: string,
 *   orderType: string,
 *   orderStatus: string,
 *   paymentStatus: string,
 *   paymentMethod: string,
 *   totalAmount: number,
 *   customerName: string,
 *   shippingAddress: string,
 *   items: Array<{ name: string, quantity: number, unitPrice: number }>,
 *   qrisCode: string | null,
 *   qrisExpiresAt: string | null,
 *   sseToken: string | null,
 * }}} props
 */
export default function OrderConfirmation({ order: initialOrder }) {
  const [order, setOrder] = useState(initialOrder);
  const [isPaid, setIsPaid] = useState(
    initialOrder.paymentStatus === "paid"
  );
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState("");

  // ── Real-time status updates via SSE ──────────────────────────────────────

  const handleEvent = useCallback((event) => {
    if (!event?.type) return;

    switch (event.type) {
      case "payment_confirmed":
        // Req 5.5: Update tampilan ke "Pembayaran Diterima"
        setIsPaid(true);
        setOrder((prev) => ({ ...prev, paymentStatus: "paid" }));
        break;

      case "order_ready":
        setOrder((prev) => ({ ...prev, orderStatus: "ready" }));
        break;

      case "order_shipping":
        setOrder((prev) => ({ ...prev, orderStatus: "shipping" }));
        break;

      case "order_completed":
        setOrder((prev) => ({
          ...prev,
          orderStatus: "completed",
          paymentStatus: "paid",
        }));
        setIsPaid(true);
        break;

      case "qris_expired":
        setOrder((prev) => ({ ...prev, qrisExpiresAt: null }));
        break;

      default:
        break;
    }
  }, []);

  useOrderStatus(order.invoiceNumber, order.sseToken, handleEvent);

  // ── Regenerate QRIS ───────────────────────────────────────────────────────

  async function handleRegenerate() {
    setIsRegenerating(true);
    setRegenError("");

    try {
      const res = await fetch(`/api/orders/${order._id}/qris`, {
        method: "POST",
      });

      const json = await res.json();

      if (!res.ok) {
        setRegenError(
          json?.error?.message ||
            json?.message ||
            "Gagal membuat ulang kode QR. Silakan coba lagi."
        );
        return;
      }

      // Update order dengan qrisCode dan qrisExpiresAt baru
      setOrder((prev) => ({
        ...prev,
        qrisCode: json?.data?.qrisCode ?? prev.qrisCode,
        qrisExpiresAt: json?.data?.qrisExpiresAt ?? prev.qrisExpiresAt,
      }));
    } catch {
      setRegenError("Gagal terhubung ke server. Periksa koneksi internet Anda.");
    } finally {
      setIsRegenerating(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const paymentMethodLabel =
    PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod;
  const paymentMethodIcon =
    PAYMENT_METHOD_ICONS[order.paymentMethod] ?? "💳";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6 space-y-6">

      {/* ── Header ── */}
      <div className="text-center space-y-1">
        <div className="text-4xl" aria-hidden="true">
          {isPaid ? "✅" : "📋"}
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          {isPaid ? "Pesanan Dikonfirmasi" : "Konfirmasi Pesanan"}
        </h1>
        <p className="text-sm text-gray-500">
          Nomor Invoice:{" "}
          <span className="font-mono font-semibold text-gray-800">
            {order.invoiceNumber}
          </span>
        </p>
      </div>

      {/* ── Payment Confirmed Banner (Req 5.5) ── */}
      {isPaid && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 rounded-xl border border-green-300 bg-green-50 px-5 py-4 shadow-sm"
        >
          <span className="flex-shrink-0 text-2xl" aria-hidden="true">✅</span>
          <div>
            <p className="text-base font-bold text-green-800">Pembayaran Diterima</p>
            <p className="text-sm text-green-700">
              Pesanan Anda sedang diproses oleh tim kami.
            </p>
          </div>
        </div>
      )}

      {/* ── Shipping Status Banner ── */}
      {order.orderStatus === "shipping" && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 rounded-xl border border-indigo-300 bg-indigo-50 px-5 py-4 shadow-sm"
        >
          <span className="flex-shrink-0 text-2xl" aria-hidden="true">🚚</span>
          <div>
            <p className="text-base font-bold text-indigo-800">Pesanan Sedang Dikirim</p>
            <p className="text-sm text-indigo-700">
              Pesanan Anda sedang dalam perjalanan ke alamat pengiriman.
            </p>
          </div>
        </div>
      )}

      {/* ── Payment Instructions (only when not yet paid) ── */}
      {!isPaid && (
        <section aria-labelledby="payment-instructions-heading">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2
                id="payment-instructions-heading"
                className="text-base font-semibold text-gray-900"
              >
                Instruksi Pembayaran
              </h2>
            </div>
            <div className="px-5 py-5 space-y-4">
              {regenError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
                >
                  <span className="mt-0.5 flex-shrink-0 text-red-500" aria-hidden="true">⚠️</span>
                  <p className="text-sm font-medium text-red-700">{regenError}</p>
                </div>
              )}
              <PaymentInstructions
                order={order}
                onRegenerate={handleRegenerate}
                isRegenerating={isRegenerating}
                onPaymentSubmitted={() => {
                  // Tampilkan banner "menunggu verifikasi" setelah pelanggan konfirmasi
                  setOrder((prev) => ({ ...prev, _paymentSubmitted: true }));
                }}
              />
              {order._paymentSubmitted && !isPaid && (
                <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
                  <span className="flex-shrink-0 text-2xl" aria-hidden="true">⏳</span>
                  <div>
                    <p className="text-sm font-bold text-blue-800">Menunggu Verifikasi</p>
                    <p className="text-xs text-blue-700 mt-0.5">Tim kami sedang memverifikasi pembayaran Anda. Halaman ini akan otomatis diperbarui.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Order Details (Req 5.2) ── */}
      <section aria-labelledby="order-details-heading">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2
              id="order-details-heading"
              className="text-base font-semibold text-gray-900"
            >
              Detail Pesanan
            </h2>
          </div>

          {/* Item list */}
          <ul className="divide-y divide-gray-100" role="list" aria-label="Daftar item pesanan">
            {order.items?.map((item, index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.productName ?? item.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatRupiah(item.unitPrice)} × {item.quantity}
                  </p>
                </div>
                <p className="text-sm font-semibold text-gray-900 flex-shrink-0">
                  {formatRupiah(item.unitPrice * item.quantity)}
                </p>
              </li>
            ))}
          </ul>

          {/* Total */}
          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Total Pembayaran</span>
              <span className="text-base font-bold text-gray-900">
                {formatRupiah(order.totalAmount)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Payment Method & Customer Info (Req 5.2) ── */}
      <section aria-labelledby="order-info-heading">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2
              id="order-info-heading"
              className="text-base font-semibold text-gray-900"
            >
              Informasi Pesanan
            </h2>
          </div>

          <dl className="divide-y divide-gray-100">
            {/* Metode Pembayaran */}
            <div className="flex items-center justify-between gap-3 px-5 py-3.5">
              <dt className="text-sm text-gray-600">Metode Pembayaran</dt>
              <dd className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <span aria-hidden="true">{paymentMethodIcon}</span>
                {paymentMethodLabel}
              </dd>
            </div>

            {/* Status Pesanan */}
            <div className="flex items-center justify-between gap-3 px-5 py-3.5">
              <dt className="text-sm text-gray-600">Status Pesanan</dt>
              <dd>
                <OrderStatusBadge status={order.orderStatus} />
              </dd>
            </div>

            {/* Status Pembayaran */}
            <div className="flex items-center justify-between gap-3 px-5 py-3.5">
              <dt className="text-sm text-gray-600">Status Pembayaran</dt>
              <dd>
                <PaymentStatusBadge status={order.paymentStatus} />
              </dd>
            </div>

            {/* Nama Pelanggan */}
            <div className="flex items-center justify-between gap-3 px-5 py-3.5">
              <dt className="text-sm text-gray-600">Nama Pelanggan</dt>
              <dd className="text-sm font-medium text-gray-900 text-right">
                {order.customerName}
              </dd>
            </div>

            {/* Alamat Pengiriman */}
            <div className="flex items-start justify-between gap-3 px-5 py-3.5">
              <dt className="text-sm text-gray-600 flex-shrink-0">Alamat Pengiriman</dt>
              <dd className="text-sm font-medium text-gray-900 text-right">
                {order.shippingAddress}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ── Back to Store ── */}
      <div className="text-center">
        <a
          href="/store"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors"
        >
          ← Kembali ke Katalog
        </a>
      </div>
    </div>
  );
}

// ─── Order Status Badge ───────────────────────────────────────────────────────

/**
 * OrderStatusBadge — badge status pesanan dengan warna sesuai status.
 *
 * @param {{ status: string }} props
 */
function OrderStatusBadge({ status }) {
  const config = {
    waiting_preparation: {
      label: "Menunggu Persiapan",
      className: "bg-yellow-100 text-yellow-800 border-yellow-200",
    },
    preparing: {
      label: "Sedang Disiapkan",
      className: "bg-blue-100 text-blue-800 border-blue-200",
    },
    ready: {
      label: "Siap",
      className: "bg-green-100 text-green-800 border-green-200",
    },
    shipping: {
      label: "Sedang Dikirim 🚚",
      className: "bg-indigo-100 text-indigo-800 border-indigo-200",
    },
    completed: {
      label: "Selesai ✅",
      className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    },
    cancelled: {
      label: "Dibatalkan",
      className: "bg-red-100 text-red-800 border-red-200",
    },
  };

  const { label, className } = config[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-800 border-gray-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

/**
 * PaymentStatusBadge — badge status pembayaran dengan warna sesuai status.
 *
 * @param {{ status: string }} props
 */
function PaymentStatusBadge({ status }) {
  const config = {
    pending: {
      label: "Menunggu Pembayaran",
      className: "bg-amber-100 text-amber-800 border-amber-200",
    },
    paid: {
      label: "Pembayaran Diterima",
      className: "bg-green-100 text-green-800 border-green-200",
    },
    expired: {
      label: "Kedaluwarsa",
      className: "bg-red-100 text-red-800 border-red-200",
    },
  };

  const { label, className } = config[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-800 border-gray-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}
