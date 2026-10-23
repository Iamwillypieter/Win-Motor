"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import useSSE from "@/hooks/useSSE";
import { formatRupiah } from "@/lib/utils";
import EditOrderModal from "./EditOrderModal";

/** Human-readable labels and colours for each order status */
const STATUS_CONFIG = {
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
  completed: {
    label: "Selesai",
    className: "bg-gray-100 text-gray-700 border-gray-200",
  },
  cancelled: {
    label: "Dibatalkan",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

const PAYMENT_STATUS_LABEL = {
  pending: "Belum Dibayar",
  paid: "Sudah Dibayar",
  expired: "Kedaluwarsa",
};

/** Format Date ke string YYYY-MM-DD lokal */
function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Cek apakah order dibuat pada tanggal tertentu (lokal) */
function isOnDate(order, dateStr) {
  if (!order.createdAt) return false;
  return toLocalDateStr(new Date(order.createdAt)) === dateStr;
}

export default function CashierOrderList({ cashierId }) {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter tanggal — default: hari ini
  const todayStr = toLocalDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr); // "today" | "all" | "YYYY-MM-DD"

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const url = cashierId
        ? `/api/orders?cashierId=${cashierId}`
        : "/api/orders";
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Gagal memuat pesanan");
      const sorted = (json.data || []).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      setOrders(sorted);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [cashierId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Filter pesanan berdasarkan tanggal yang dipilih
  const filteredOrders = useMemo(() => {
    if (selectedDate === "all") return orders;
    return orders.filter((o) => isOnDate(o, selectedDate));
  }, [orders, selectedDate]);

  // Kumpulkan daftar tanggal unik dari semua pesanan untuk dropdown
  const availableDates = useMemo(() => {
    const dates = new Set(
      orders
        .filter((o) => o.createdAt)
        .map((o) => toLocalDateStr(new Date(o.createdAt)))
    );
    return Array.from(dates).sort((a, b) => b.localeCompare(a)); // terbaru dulu
  }, [orders]);

  const handleEvent = useCallback((event) => {
    if (event.type === "order_ready") {
      const { orderId } = event.data || {};
      if (!orderId) return;
      setOrders((prev) =>
        prev.map((o) => o._id === orderId ? { ...o, orderStatus: "ready" } : o)
      );
    }
    if (event.type === "order_status_updated") {
      const { orderId, orderStatus } = event.data || {};
      if (!orderId) return;
      setOrders((prev) =>
        prev.map((o) => o._id === orderId ? { ...o, orderStatus } : o)
      );
    }
    if (event.type === "order_completed") {
      const { orderId } = event.data || {};
      if (!orderId) return;
      setOrders((prev) =>
        prev.map((o) =>
          o._id === orderId
            ? { ...o, orderStatus: "completed", paymentStatus: "paid" }
            : o
        )
      );
    }
    // Pesanan baru yang dibuat kasir ini di tab/device lain
    if (event.type === "new_order") {
      const newOrder = event.data;
      if (!newOrder?._id) return;
      // Hanya tambahkan jika cashierId cocok dengan kasir yang sedang login
      if (cashierId && newOrder.cashierId && newOrder.cashierId !== cashierId) return;
      setOrders((prev) => {
        if (prev.some((o) => o._id === newOrder._id)) return prev;
        return [newOrder, ...prev];
      });
    }
  }, [cashierId]);

  useSSE(handleEvent);

  // Edit & cancel state
  const [editingOrder, setEditingOrder] = useState(null);

  async function handleCancelOrder(orderId) {
    if (!window.confirm("Batalkan pesanan ini? Tindakan ini tidak dapat dibatalkan.")) return;
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
      const json = await res.json();
      if (res.ok) {
        setOrders((prev) =>
          prev.map((o) => o._id === orderId ? { ...o, orderStatus: "cancelled" } : o)
        );
      } else {
        alert(json.error?.message || "Gagal membatalkan pesanan");
      }
    } catch {
      alert("Gagal terhubung ke server");
    }
  }

  function handleEditSuccess(updatedOrder) {
    setOrders((prev) =>
      prev.map((o) => o._id === updatedOrder._id ? {
        ...o,
        items: updatedOrder.items,
        totalAmount: updatedOrder.totalAmount,
        customerName: updatedOrder.customerName,
      } : o)
    );
    setEditingOrder(null);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm">Memuat pesanan...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        <p className="font-semibold mb-1">Gagal memuat pesanan</p>
        <p>{error}</p>
        <button onClick={fetchOrders} className="mt-2 text-red-700 underline text-xs hover:text-red-900">
          Coba lagi
        </button>
      </div>
    );
  }

  // Format label tanggal untuk tampilan
  function formatDateLabel(dateStr) {
    if (dateStr === todayStr) return "Hari Ini";
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === toLocalDateStr(yesterday)) return "Kemarin";
    return new Date(dateStr + "T00:00:00").toLocaleDateString("id-ID", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">
            {filteredOrders.length} pesanan
          </span>
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter tanggal */}
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
            {/* Tombol Hari Ini */}
            <button
              onClick={() => setSelectedDate(todayStr)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedDate === todayStr
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Hari Ini
            </button>

            {/* Dropdown tanggal lain */}
            <select
              value={selectedDate === todayStr || selectedDate === "all" ? "" : selectedDate}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(e.target.value);
              }}
              className={`rounded-md px-2 py-1.5 text-xs font-medium bg-transparent border-0 focus:outline-none cursor-pointer ${
                selectedDate !== todayStr && selectedDate !== "all"
                  ? "text-gray-900"
                  : "text-gray-500"
              }`}
            >
              <option value="" disabled>Pilih Tanggal</option>
              {availableDates
                .filter((d) => d !== todayStr)
                .map((d) => (
                  <option key={d} value={d}>{formatDateLabel(d)}</option>
                ))}
            </select>

            {/* Tombol Semua */}
            <button
              onClick={() => setSelectedDate("all")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedDate === "all"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Semua
            </button>
          </div>

          <button
            onClick={fetchOrders}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium focus:outline-none focus:underline"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Label tanggal aktif */}
      <div className="mb-3">
        <p className="text-xs text-gray-500">
          Menampilkan pesanan:{" "}
          <span className="font-semibold text-gray-700">
            {selectedDate === "all" ? "Semua tanggal" : formatDateLabel(selectedDate)}
          </span>
        </p>
      </div>

      {/* Empty state */}
      {filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <span className="text-5xl">🧾</span>
          <p className="text-base font-medium text-gray-500">
            {selectedDate === todayStr
              ? "Belum ada pesanan hari ini"
              : "Tidak ada pesanan pada tanggal ini"}
          </p>
          <p className="text-sm text-center max-w-xs text-gray-400">
            {selectedDate === todayStr
              ? "Pesanan yang Anda buat hari ini akan muncul di sini."
              : "Coba pilih tanggal lain atau klik \"Semua\" untuk melihat semua pesanan."}
          </p>
          {selectedDate === todayStr && (
            <Link
              href="/cashier"
              className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Buat Pesanan Baru
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4" aria-label="Daftar pesanan" aria-live="polite">
          {filteredOrders.map((order) => {
            const statusCfg = STATUS_CONFIG[order.orderStatus] ?? {
              label: order.orderStatus,
              className: "bg-gray-100 text-gray-700 border-gray-200",
            };
            const isActive = ["waiting_preparation", "preparing", "ready"].includes(order.orderStatus);
            // Kasir bisa bayar kapanpun selama pesanan belum selesai/dibatalkan
            const canPay = isActive && order.paymentStatus === "pending";
            const canCancel = ["waiting_preparation", "preparing"].includes(order.orderStatus) && order.paymentStatus === "pending";

            return (
              <div key={order._id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                {order.customerName && (
                  <p className="text-center font-bold text-gray-900 text-base mb-3 pb-3 border-b border-gray-100">
                    {order.customerName}
                  </p>
                )}

                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-blue-700">{order.invoiceNumber}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(order.createdAt).toLocaleString("id-ID")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusCfg.className}`}>
                      {statusCfg.label}
                    </span>
                    <span className="text-xs text-gray-500">
                      {PAYMENT_STATUS_LABEL[order.paymentStatus] ?? order.paymentStatus}
                    </span>
                  </div>
                </div>

                <div className="space-y-1 mb-3">
                  {(order.items || []).map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-gray-700">
                        {item.productName} <span className="text-gray-400">×{item.quantity}</span>
                      </span>
                      <span className="font-medium text-gray-800">
                        {formatRupiah(item.unitPrice * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between font-bold text-sm border-t border-gray-100 pt-2 mb-4">
                  <span>Total</span>
                  <span className="text-blue-700">{formatRupiah(order.totalAmount)}</span>
                </div>

                {canPay && (
                  <div className="flex gap-2">
                    <Link
                      href={`/cashier/payment/${order._id}`}
                      className="flex-1 block rounded-lg bg-green-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-green-700 transition-colors"
                    >
                      💳 Bayar
                    </Link>
                    <button
                      onClick={() => setEditingOrder(order)}
                      className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      ✏️ Edit
                    </button>
                    {canCancel && (
                      <button
                        onClick={() => handleCancelOrder(order._id)}
                        className="rounded-lg border border-red-300 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                      >
                        ✕ Batal
                      </button>
                    )}
                  </div>
                )}
                {order.orderStatus === "completed" && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-green-600 font-medium">✓ Transaksi selesai</p>
                    <Link
                      href={`/cashier/invoice/${order._id}`}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      🖨️ Cetak Invoice
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Order Modal */}
      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          onSuccess={handleEditSuccess}
          onClose={() => setEditingOrder(null)}
        />
      )}
    </div>
  );
}


