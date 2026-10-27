"use client";

import { useState } from "react";
import { formatRupiah } from "@/lib/utils";

/**
 * Format a date string to a human-readable Indonesian time.
 * @param {string | Date} dateStr
 * @returns {string}
 */
function formatTime(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Format a date string to a full Indonesian date-time.
 * @param {string | Date} dateStr
 * @returns {string}
 */
function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Status badge color mapping.
 */
const STATUS_STYLES = {
  waiting_preparation: "bg-yellow-100 text-yellow-800 border-yellow-200",
  preparing: "bg-blue-100 text-blue-800 border-blue-200",
  ready: "bg-green-100 text-green-800 border-green-200",
  shipping: "bg-indigo-100 text-indigo-800 border-indigo-200",
};

const STATUS_LABELS = {
  waiting_preparation: "Menunggu",
  preparing: "Sedang Disiapkan",
  ready: "Siap",
  shipping: "Sedang Dikirim",
};

/**
 * Get order type badge styling and label.
 */
function getOrderTypeBadge(orderType) {
  if (orderType === "ONLINE") {
    return {
      style: "bg-green-100 text-green-800 border-green-200",
      label: "ONLINE",
    };
  }
  return {
    style: "bg-blue-100 text-blue-800 border-blue-200",
    label: "KASIR",
  };
}

/**
 * Get payment method badge label and styling.
 */
function getPaymentBadge(paymentMethod, paymentStatus) {
  if (paymentMethod === "CASH") {
    return {
      label: "COD",
      style: "bg-amber-100 text-amber-800 border-amber-200",
    };
  }
  if (paymentMethod === "QRIS" && paymentStatus === "paid") {
    return {
      label: "QRIS — Lunas",
      style: "bg-emerald-100 text-emerald-800 border-emerald-200",
    };
  }
  if (paymentMethod === "QRIS") {
    return {
      label: "QRIS",
      style: "bg-purple-100 text-purple-800 border-purple-200",
    };
  }
  if (paymentMethod === "BANK_TRANSFER") {
    return {
      label: paymentStatus === "paid" ? "Transfer — Lunas ✓" : "Transfer Bank",
      style: paymentStatus === "paid"
        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
        : "bg-indigo-100 text-indigo-800 border-indigo-200",
    };
  }
  if (paymentMethod?.startsWith("EWALLET_")) {
    const walletName = paymentMethod.replace("EWALLET_", "");
    return {
      label: paymentStatus === "paid" ? `${walletName} — Lunas ✓` : walletName,
      style: paymentStatus === "paid"
        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
        : "bg-cyan-100 text-cyan-800 border-cyan-200",
    };
  }
  return null;
}

/**
 * OrderQueueCard — displays a single order in the warehouse queue.
 *
 * @param {{
 *   order: Object,
 *   onMarkReady: (orderId: string) => void,
 *   isProcessing?: boolean,
 *   onConfirmCOD?: (orderId: string) => void,
 *   onConfirmTransfer?: (orderId: string) => void,
 *   onMarkShipping?: (orderId: string) => void,
 * }} props
 */
export default function OrderQueueCard({
  order,
  onMarkReady,
  isProcessing = false,
  onConfirmCOD,
  onConfirmTransfer,
  onMarkShipping,
  onCancelOrder,
}) {
  const [isConfirmingCOD, setIsConfirmingCOD] = useState(false);
  const [codError, setCodError] = useState(null);
  const [isConfirmingTransfer, setIsConfirmingTransfer] = useState(false);
  const [transferError, setTransferError] = useState(null);
  const [isConfirmingEwallet, setIsConfirmingEwallet] = useState(false);
  const [ewalletError, setEwalletError] = useState(null);
  const [isMarkingShipping, setIsMarkingShipping] = useState(false);
  const [shippingError, setShippingError] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const statusStyle =
    STATUS_STYLES[order.orderStatus] || "bg-gray-100 text-gray-700 border-gray-200";
  const statusLabel = STATUS_LABELS[order.orderStatus] || order.orderStatus;

  const orderTypeBadge = getOrderTypeBadge(order.orderType);
  const paymentBadge = getPaymentBadge(order.paymentMethod, order.paymentStatus);

  /** Whether this card should show the "Konfirmasi COD" button */
  const showConfirmCOD =
    order.orderType === "ONLINE" &&
    order.paymentMethod === "CASH" &&
    order.orderStatus === "ready";

  /** Whether this card should show the "Konfirmasi Transfer" button */
  const showConfirmTransfer =
    order.orderType === "ONLINE" &&
    order.paymentMethod === "BANK_TRANSFER" &&
    order.paymentStatus !== "paid" &&
    order.orderStatus === "ready";

  /**
   * Konfirmasi e-wallet — untuk ONLINE + EWALLET_* yang belum "paid".
   * Gudang memverifikasi secara manual bahwa pembayaran sudah masuk.
   */
  const showConfirmEwallet =
    order.orderType === "ONLINE" &&
    order.paymentMethod?.startsWith("EWALLET_") &&
    order.paymentStatus !== "paid" &&
    order.orderStatus === "ready";

  /**
   * Tombol "Siap Dikirim" — muncul untuk pesanan ONLINE yang sudah dibayar
   * (paymentStatus: "paid") dan masih dalam proses persiapan (preparing/ready).
   * Ini menandai pesanan sedang dikirim dan mengirim notifikasi WA ke pelanggan.
   */
  const showMarkShipping =
    order.orderType === "ONLINE" &&
    order.paymentStatus === "paid" &&
    ["preparing", "ready"].includes(order.orderStatus);

  /**
   * Gudang bisa batalkan pesanan yang belum disiapkan (waiting_preparation/preparing + pending).
   */
  const showCancelButton =
    ["waiting_preparation", "preparing"].includes(order.orderStatus) &&
    order.paymentStatus === "pending";

  async function handleCancel() {
    const orderId = order._id?.toString();
    if (!orderId) return;
    setCancelError(null);
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setCancelError(json?.error?.message || "Gagal membatalkan pesanan.");
        setShowCancelConfirm(false);
        return;
      }
      if (typeof onCancelOrder === "function") onCancelOrder(orderId);
    } catch {
      setCancelError("Terjadi kesalahan jaringan. Silakan coba lagi.");
    } finally {
      setIsCancelling(false);
      setShowCancelConfirm(false);
    }
  }

  /**
   * Handle COD confirmation — calls PATCH /api/orders/[id]/status with { orderStatus: "completed" }.
   * If a parent callback is provided via onConfirmCOD, it is called after success so the parent
   * can refresh the queue. Otherwise the component handles the API call internally.
   */
  async function handleConfirmCOD() {
    const orderId = order._id?.toString();
    if (!orderId) return;

    setCodError(null);
    setIsConfirmingCOD(true);

    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus: "completed" }),
      });

      const json = await res.json();

      if (!res.ok) {
        const message =
          json?.error?.message || "Gagal mengkonfirmasi COD. Silakan coba lagi.";
        setCodError(message);
        return;
      }

      // Notify parent so it can refresh the queue
      if (typeof onConfirmCOD === "function") {
        onConfirmCOD(orderId);
      }
    } catch {
      setCodError("Terjadi kesalahan jaringan. Silakan coba lagi.");
    } finally {
      setIsConfirmingCOD(false);
    }
  }

  /**
   * Handle Bank Transfer confirmation
   */
  async function handleConfirmTransfer() {
    const orderId = order._id?.toString();
    if (!orderId) return;

    setTransferError(null);
    setIsConfirmingTransfer(true);

    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus: "completed" }),
      });

      const json = await res.json();

      if (!res.ok) {
        const message =
          json?.error?.message || "Gagal mengkonfirmasi transfer. Silakan coba lagi.";
        setTransferError(message);
        return;
      }

      if (typeof onConfirmTransfer === "function") {
        onConfirmTransfer(orderId);
      }
    } catch {
      setTransferError("Terjadi kesalahan jaringan. Silakan coba lagi.");
    } finally {
      setIsConfirmingTransfer(false);
    }
  }

  /**
   * Handle E-Wallet confirmation — gudang verifikasi manual bahwa e-wallet sudah masuk.
   * Memanggil completePayment via status route.
   */
  async function handleConfirmEwallet() {
    const orderId = order._id?.toString();
    if (!orderId) return;

    setEwalletError(null);
    setIsConfirmingEwallet(true);

    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus: "completed" }),
      });

      const json = await res.json();

      if (!res.ok) {
        setEwalletError(json?.error?.message || "Gagal mengkonfirmasi pembayaran e-wallet.");
        return;
      }

      if (typeof onConfirmTransfer === "function") {
        onConfirmTransfer(orderId);
      }
    } catch {
      setEwalletError("Terjadi kesalahan jaringan. Silakan coba lagi.");
    } finally {
      setIsConfirmingEwallet(false);
    }
  }

  /**
   * Handle "Siap Dikirim" — calls PATCH /api/orders/[id]/status with { orderStatus: "shipping" }.
   * Mengirim notifikasi WhatsApp ke pelanggan bahwa pesanan sedang dikirim.
   */
  async function handleMarkShipping() {
    const orderId = order._id?.toString();
    if (!orderId) return;

    setShippingError(null);
    setIsMarkingShipping(true);

    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus: "shipping" }),
      });

      const json = await res.json();

      if (!res.ok) {
        const message =
          json?.error?.message || "Gagal menandai pesanan dikirim. Silakan coba lagi.";
        setShippingError(message);
        return;
      }

      if (typeof onMarkShipping === "function") {
        onMarkShipping(orderId);
      }
    } catch {
      setShippingError("Terjadi kesalahan jaringan. Silakan coba lagi.");
    } finally {
      setIsMarkingShipping(false);
    }
  }

  return (
    <article
      className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
      aria-label={`Pesanan ${order.invoiceNumber}`}
    >
      {/* Card header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {/* Order type badge */}
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded border ${orderTypeBadge.style}`}
            >
              {orderTypeBadge.label}
            </span>
            {/* Payment method badge */}
            {paymentBadge && (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded border ${paymentBadge.style}`}
              >
                {paymentBadge.label}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            No. Invoice
          </p>
          <p className="text-base font-mono font-bold text-gray-900">
            {order.invoiceNumber}
          </p>
          {/* Nama kasir */}
          {order.cashierName && (
            <p className="text-xs text-blue-600 font-medium mt-0.5">
              👤 {order.cashierName}
            </p>
          )}
          {/* Nama pelanggan (untuk pesanan ONLINE) */}
          {order.customerName && order.orderType === "ONLINE" && (
            <p className="text-xs text-green-600 font-medium mt-0.5">
              🛍️ {order.customerName}
            </p>
          )}
          {/* Alamat pengiriman (untuk pesanan ONLINE) */}
          {order.shippingAddress && order.orderType === "ONLINE" && (
            <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
              📍 {order.shippingAddress}
            </p>
          )}
        </div>

        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusStyle}`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Items list */}
      <div className="px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Item Pesanan
        </p>
        <ul className="space-y-1.5" aria-label="Daftar item">
          {order.items?.map((item, idx) => (
            <li
              key={item.productId?.toString() ?? idx}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-gray-800 font-medium truncate max-w-[60%]">
                {item.productName}
              </span>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-gray-500 font-mono">
                  {item.sku}
                </span>
                <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2 py-0.5 rounded-md">
                  ×{item.quantity}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer: total + timestamp + action */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-sm font-bold text-gray-900">
            {formatRupiah(order.totalAmount)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5" title={formatDateTime(order.createdAt)}>
            {formatTime(order.createdAt)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* "Tandai Siap" button — shown when order is not yet ready */}
          {order.orderStatus !== "ready" && (
            <button
              onClick={() => onMarkReady(order._id?.toString())}
              disabled={isProcessing}
              aria-label={`Tandai pesanan ${order.invoiceNumber} siap`}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Memproses...
                </span>
              ) : (
                "Tandai Siap"
              )}
            </button>
          )}

          {/* "Konfirmasi COD" button — shown only for ONLINE + CASH + ready orders */}
          {showConfirmCOD && (
            <button
              onClick={handleConfirmCOD}
              disabled={isConfirmingCOD}
              aria-label={`Konfirmasi pembayaran COD pesanan ${order.invoiceNumber}`}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isConfirmingCOD ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Memproses...
                </span>
              ) : (
                "Konfirmasi COD"
              )}
            </button>
          )}

          {/* Inline error message for COD confirmation failure */}
          {codError && (
            <p className="text-xs text-red-600 text-right max-w-[180px]" role="alert">
              {codError}
            </p>
          )}

          {/* "Konfirmasi Transfer" button — shown only for ONLINE + BANK_TRANSFER + ready orders */}
          {showConfirmTransfer && (
            <button
              onClick={handleConfirmTransfer}
              disabled={isConfirmingTransfer}
              aria-label={`Konfirmasi pembayaran transfer bank pesanan ${order.invoiceNumber}`}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isConfirmingTransfer ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Memproses...
                </span>
              ) : (
                "Konfirmasi Transfer"
              )}
            </button>
          )}

          {/* Inline error message for bank transfer confirmation failure */}
          {transferError && (
            <p className="text-xs text-red-600 text-right max-w-[180px]" role="alert">
              {transferError}
            </p>
          )}

          {/* "Konfirmasi E-Wallet" button — untuk ONLINE + EWALLET + ready + belum paid */}
          {showConfirmEwallet && (
            <button
              onClick={handleConfirmEwallet}
              disabled={isConfirmingEwallet}
              aria-label={`Konfirmasi pembayaran e-wallet pesanan ${order.invoiceNumber}`}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isConfirmingEwallet ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Memproses...
                </span>
              ) : (
                `✓ Konfirmasi ${order.paymentMethod?.replace("EWALLET_", "")}`
              )}
            </button>
          )}

          {/* Inline error message for e-wallet confirmation */}
          {ewalletError && (
            <p className="text-xs text-red-600 text-right max-w-[180px]" role="alert">
              {ewalletError}
            </p>
          )}

          {/* "Siap Dikirim" button — untuk pesanan ONLINE yang sudah dibayar */}
          {showMarkShipping && (
            <button
              onClick={handleMarkShipping}
              disabled={isMarkingShipping}
              aria-label={`Tandai pesanan ${order.invoiceNumber} sedang dikirim`}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isMarkingShipping ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Memproses...
                </span>
              ) : (
                "🚚 Siap Dikirim"
              )}
            </button>
          )}

          {/* Inline error message for shipping */}
          {shippingError && (
            <p className="text-xs text-red-600 text-right max-w-[180px]" role="alert">
              {shippingError}
            </p>
          )}

          {/* "Batalkan Pesanan" — hanya untuk order yang belum disiapkan */}
          {showCancelButton && (
            <>
              {!showCancelConfirm ? (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={isProcessing || isCancelling}
                  aria-label={`Batalkan pesanan ${order.invoiceNumber}`}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50 transition-colors"
                >
                  ✕ Batalkan
                </button>
              ) : (
                <div className="flex flex-col items-end gap-1.5">
                  <p className="text-xs text-red-700 font-medium text-right">
                    Yakin batalkan pesanan ini?
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      disabled={isCancelling}
                      className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Tidak
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={isCancelling}
                      className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      {isCancelling && (
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      )}
                      Ya, Batalkan
                    </button>
                  </div>
                </div>
              )}
              {cancelError && (
                <p className="text-xs text-red-600 text-right max-w-[180px]" role="alert">
                  {cancelError}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
