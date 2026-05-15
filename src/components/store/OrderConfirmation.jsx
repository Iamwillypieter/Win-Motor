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

/**
 * EwalletPaymentDisplay — menampilkan instruksi pembayaran e-wallet.
 *
 * @param {{ paymentMethod: string, qrisCode: string | null, qrisExpiresAt: string | null, totalAmount: number, orderId: string, onRegenerate: () => void, isRegenerating: boolean }} props
 */
function EwalletPaymentDisplay({
  paymentMethod,
  qrisCode,
  qrisExpiresAt,
  totalAmount,
  orderId,
  onRegenerate,
  isRegenerating,
}) {
  const walletNames = {
    EWALLET_DANA: "DANA",
    EWALLET_OVO: "OVO",
    EWALLET_GOPAY: "GoPay",
  };

  const walletName = walletNames[paymentMethod] ?? paymentMethod;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl" aria-hidden="true">
            {PAYMENT_METHOD_ICONS[paymentMethod]}
          </span>
          <p className="text-sm font-semibold text-blue-800">
            Bayar via {walletName}
          </p>
        </div>
        <p className="text-sm text-blue-700">
          Nominal yang harus dibayar:{" "}
          <span className="font-bold">{formatRupiah(totalAmount)}</span>
        </p>
      </div>

      {/* Jika ada qrisCode, tampilkan QR untuk e-wallet */}
      {qrisCode ? (
        <QrisPaymentDisplay
          orderId={orderId}
          qrisCode={qrisCode}
          qrisExpiresAt={qrisExpiresAt}
          onRegenerate={onRegenerate}
          isRegenerating={isRegenerating}
        />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-sm text-gray-600">
            Buka aplikasi <strong>{walletName}</strong> dan scan kode QR, atau ikuti
            instruksi yang dikirimkan ke nomor WhatsApp Anda.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Payment Instructions Section ────────────────────────────────────────────

/**
 * PaymentInstructions — menampilkan instruksi pembayaran sesuai metode.
 *
 * Requirements:
 * - 5.3: QRIS → tampilkan QR Code + countdown 5 menit
 * - 5.4: CASH → tampilkan "Pembayaran akan dilakukan saat barang diterima (COD)"
 *
 * @param {{ order: object, onRegenerate: () => void, isRegenerating: boolean }} props
 */
function PaymentInstructions({ order, onRegenerate, isRegenerating }) {
  const { paymentMethod, qrisCode, qrisExpiresAt, totalAmount, _id } = order;

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
        qrisCode={qrisCode}
        qrisExpiresAt={qrisExpiresAt}
        totalAmount={totalAmount}
        orderId={_id}
        onRegenerate={onRegenerate}
        isRegenerating={isRegenerating}
      />
    );
  }

  if (paymentMethod === "BANK_TRANSFER") {
    return (
      <BankTransferDisplay
        orderId={_id}
        totalAmount={totalAmount}
        bankTransferBank={order.bankTransferBank ?? null}
        bankTransferAccount={order.bankTransferAccount ?? null}
        recipientName={order.bankTransferRecipientName ?? null}
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
              />
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
                    {item.name}
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
