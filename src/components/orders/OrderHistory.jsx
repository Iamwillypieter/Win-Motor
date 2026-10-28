"use client";

import { Fragment, useState, useCallback, useEffect, useRef } from "react";
import { formatRupiah } from "@/lib/utils";

/** Status label & badge style untuk seluruh orderStatus enum. */
const STATUS_LABELS = {
  waiting_preparation: "Menunggu",
  preparing: "Disiapkan",
  ready: "Siap",
  shipping: "Dikirim",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const STATUS_STYLES = {
  waiting_preparation: "bg-yellow-100 text-yellow-800 border-yellow-200",
  preparing: "bg-blue-100 text-blue-800 border-blue-200",
  ready: "bg-green-100 text-green-800 border-green-200",
  shipping: "bg-indigo-100 text-indigo-800 border-indigo-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

/** Label singkat untuk metode pembayaran. */
const PAYMENT_LABELS = {
  CASH: "Tunai",
  QRIS: "QRIS",
  BANK_TRANSFER: "Transfer Bank",
  EWALLET_DANA: "DANA",
  EWALLET_OVO: "OVO",
  EWALLET_GOPAY: "GoPay",
  DEBT: "Utang",
};

function paymentLabel(method) {
  if (!method) return "—";
  return PAYMENT_LABELS[method] ?? method;
}

/** Format tanggal lengkap (id-ID). */
function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function thirtyDaysAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split("T")[0];
}

const LIMIT = 20;

/**
 * OrderHistory — halaman riwayat pesanan (status terminal: selesai & dibatalkan)
 * dengan filter, pagination server-side, ringkasan, dan baris yang dapat
 * diexpand untuk melihat detail item.
 *
 * Mengambil data dari GET /api/orders/history (role: WAREHOUSE, OWNER).
 *
 * @param {{ title?: string }} props
 */
export default function OrderHistory({ title = "Riwayat Pesanan" }) {
  // Filter state
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(""); // "" => default (completed,cancelled)
  const [orderType, setOrderType] = useState("");
  const [from, setFrom] = useState(thirtyDaysAgoStr());
  const [to, setTo] = useState(todayStr());

  // Data state
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [summary, setSummary] = useState({ completed: 0, cancelled: 0, totalRevenue: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);

  // Baris yang sedang di-expand (null = semua tertutup)
  const [expandedId, setExpandedId] = useState(null);

  // Ref agar fetchData bisa dipanggil setelah reset state tanpa menunggu re-render
  const fetchData = useCallback(async (targetPage = 1, overrides = {}) => {
    setLoading(true);
    setError("");

    const f = { search, status, orderType, from, to, ...overrides };

    const params = new URLSearchParams();
    if (f.search?.trim()) params.set("search", f.search.trim());
    if (f.status) params.set("status", f.status);
    if (f.orderType) params.set("orderType", f.orderType);
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
    params.set("limit", String(LIMIT));
    params.set("page", String(targetPage));

    try {
      const res = await fetch(`/api/orders/history?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message || "Gagal memuat data");
        return;
      }

      setData(json.data || []);
      setTotal(json.total ?? 0);
      setPage(json.page ?? targetPage);
      setTotalPages(json.totalPages ?? 0);
      setSummary(
        json.summary || { completed: 0, cancelled: 0, totalRevenue: 0 }
      );
      setHasLoaded(true);
      setExpandedId(null);
    } catch {
      setError("Gagal terhubung ke server");
    } finally {
      setLoading(false);
    }
  }, [search, status, orderType, from, to]);

  // Muat data pertama kali saat halaman dibuka (default: 30 hari terakhir)
  useEffect(() => {
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    fetchData(1);
  }

  function handleReset() {
    const defaults = {
      search: "",
      status: "",
      orderType: "",
      from: thirtyDaysAgoStr(),
      to: todayStr(),
    };
    setSearch("");
    setStatus("");
    setOrderType("");
    setFrom(defaults.from);
    setTo(defaults.to);
    fetchData(1, defaults);
  }

  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Daftar pesanan yang sudah selesai atau dibatalkan. Klik baris untuk
          melihat detail item.
        </p>
      </div>

      {/* Filter form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Cari teks bebas */}
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Cari (no. invoice / nama pelanggan / nama kasir)
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filter status */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selesai &amp; Dibatalkan</option>
                <option value="completed">Selesai</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
            </div>

            {/* Filter tipe pesanan */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Tipe Pesanan
              </label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Semua Tipe</option>
                <option value="OFFLINE">Kasir</option>
                <option value="ONLINE">Online</option>
              </select>
            </div>

            {/* Dari tanggal */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Dari Tanggal
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Sampai tanggal */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Sampai Tanggal
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Memuat...
                </span>
              ) : (
                "Tampilkan"
              )}
            </button>
            <button
              type="button"
              onClick={() => fetchData(page)}
              disabled={loading}
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none disabled:opacity-50"
            >
              Muat Ulang
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Summary cards — muncul setelah data dimuat */}
      {hasLoaded && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Total Record</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{total}</p>
          </div>
          <div className="bg-white rounded-xl border border-emerald-200 p-4">
            <p className="text-xs text-gray-500">Pesanan Selesai</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {summary.completed}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-red-200 p-4">
            <p className="text-xs text-gray-500">Dibatalkan</p>
            <p className="text-2xl font-bold text-red-600 mt-1">
              {summary.cancelled}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-blue-200 p-4">
            <p className="text-xs text-gray-500">Total Penjualan</p>
            <p className="text-xl font-bold text-blue-600 mt-1">
              {formatRupiah(summary.totalRevenue)}
            </p>
            <p className="text-xs text-gray-400">dari pesanan selesai</p>
          </div>
        </div>
      )}

      {/* Tabel */}
      {hasLoaded && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-10 px-2 py-3" aria-label="Detail" />
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Waktu</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">No. Invoice</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Tipe</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Pembayaran</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Pelanggan / Kasir</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-gray-400"
                    >
                      Tidak ada pesanan untuk filter yang dipilih
                    </td>
                  </tr>
                ) : (
                  data.map((o) => {
                    const isOpen = expandedId === o._id;
                    const statusStyle =
                      STATUS_STYLES[o.orderStatus] ||
                      "bg-gray-100 text-gray-700 border-gray-200";
                    const statusLabel =
                      STATUS_LABELS[o.orderStatus] || o.orderStatus;
                    const typeBadge =
                      o.orderType === "ONLINE"
                        ? { label: "Online", style: "bg-green-100 text-green-800" }
                        : { label: "Kasir", style: "bg-blue-100 text-blue-800" };
                    const who =
                      o.orderType === "ONLINE"
                        ? o.customerName || "Pelanggan Online"
                        : o.cashierName || "Kasir";

                    return (
                      <Fragment key={o._id}>
                        <tr
                          className={`hover:bg-gray-50 transition-colors cursor-pointer ${
                            isOpen ? "bg-gray-50" : ""
                          }`}
                          onClick={() => toggleExpand(o._id)}
                        >
                          {/* Expand chevron */}
                          <td className="px-2 py-3 text-center">
                            <span
                              aria-hidden="true"
                              className={`inline-block text-gray-400 transition-transform ${
                                isOpen ? "rotate-90" : ""
                              }`}
                            >
                              ▶
                            </span>
                          </td>

                          {/* Waktu */}
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {formatDate(o.createdAt)}
                          </td>

                          {/* Invoice */}
                          <td className="px-4 py-3">
                            <p className="font-mono font-semibold text-gray-900">
                              {o.invoiceNumber}
                            </p>
                            <p className="text-xs text-gray-400">
                              {o.items?.length || 0} item
                            </p>
                          </td>

                          {/* Tipe */}
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge.style}`}
                            >
                              {typeBadge.label}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyle}`}
                            >
                              {statusLabel}
                            </span>
                          </td>

                          {/* Pembayaran */}
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-800">
                              {paymentLabel(o.paymentMethod)}
                            </p>
                            <p className="text-xs text-gray-400">
                              {o.paymentStatus === "paid"
                                ? "Lunas"
                                : o.paymentStatus === "pending"
                                ? "Belum dibayar"
                                : o.paymentStatus}
                            </p>
                          </td>

                          {/* Pelanggan / Kasir */}
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-800 truncate max-w-[160px]">
                              {who}
                            </p>
                          </td>

                          {/* Total */}
                          <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                            {formatRupiah(o.totalAmount)}
                          </td>
                        </tr>

                        {/* Baris detail item (di-expand) */}
                        {isOpen && (
                          <tr className="bg-gray-50">
                            <td colSpan={8} className="px-4 py-3">
                              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                                <p className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase border-b border-gray-100">
                                  Item Pesanan
                                </p>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-xs text-gray-500">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-medium">Produk</th>
                                        <th className="px-3 py-2 text-left font-medium">SKU</th>
                                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                                        <th className="px-3 py-2 text-right font-medium">Harga Satuan</th>
                                        <th className="px-3 py-2 text-right font-medium">Diskon</th>
                                        <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {(o.items || []).map((it, i) => (
                                        <tr key={it._id ?? i}>
                                          <td className="px-3 py-2 text-gray-800 font-medium">
                                            {it.productName}
                                          </td>
                                          <td className="px-3 py-2 text-gray-400 font-mono text-xs">
                                            {it.sku}
                                          </td>
                                          <td className="px-3 py-2 text-right text-gray-600">
                                            ×{it.quantity}
                                          </td>
                                          <td className="px-3 py-2 text-right text-gray-600">
                                            {formatRupiah(it.unitPrice)}
                                          </td>
                                          <td className="px-3 py-2 text-right text-gray-500">
                                            {it.discountAmount > 0
                                              ? `-${formatRupiah(it.discountAmount)}`
                                              : "—"}
                                          </td>
                                          <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                            {formatRupiah(
                                              it.finalPrice ??
                                                it.unitPrice * it.quantity -
                                                  (it.discountAmount || 0)
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                {o.discountTotal > 0 && (
                                  <p className="px-3 py-2 text-xs text-gray-500 border-t border-gray-100">
                                    Total diskon:{" "}
                                    <span className="font-medium text-red-600">
                                      -{formatRupiah(o.discountTotal)}
                                    </span>
                                  </p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
              <p className="text-gray-500">
                Halaman {page} dari {totalPages} · {total} record
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchData(page - 1)}
                  disabled={page <= 1 || loading}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  ← Sebelumnya
                </button>
                <button
                  onClick={() => fetchData(page + 1)}
                  disabled={page >= totalPages || loading}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Berikutnya →
                </button>
              </div>
            </div>
          )}

          {/* Footer count */}
          {data.length > 0 && totalPages <= 1 && (
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              Menampilkan {data.length} dari {total} record
            </div>
          )}
        </div>
      )}
    </div>
  );
}
