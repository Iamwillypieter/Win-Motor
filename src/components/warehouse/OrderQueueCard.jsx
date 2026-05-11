"use client";

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
};

const STATUS_LABELS = {
  waiting_preparation: "Menunggu",
  preparing: "Sedang Disiapkan",
  ready: "Siap",
};

/**
 * OrderQueueCard — displays a single order in the warehouse queue.
 *
 * @param {{
 *   order: Object,
 *   onMarkReady: (orderId: string) => void,
 *   isProcessing?: boolean,
 * }} props
 */
export default function OrderQueueCard({ order, onMarkReady, isProcessing = false }) {
  const statusStyle =
    STATUS_STYLES[order.orderStatus] || "bg-gray-100 text-gray-700 border-gray-200";
  const statusLabel = STATUS_LABELS[order.orderStatus] || order.orderStatus;

  return (
    <article
      className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
      aria-label={`Pesanan ${order.invoiceNumber}`}
    >
      {/* Card header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <div>
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
          {/* Nama pelanggan */}
          {order.customerName && (
            <p className="text-xs text-green-600 font-medium mt-0.5">
              🛍️ {order.customerName}
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
      </div>
    </article>
  );
}
