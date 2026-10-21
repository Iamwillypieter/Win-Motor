"use client";

import { useState, useTransition } from "react";
import { formatRupiah } from "@/lib/utils";

/**
 * DebtList — halaman piutang untuk Owner.
 *
 * Fitur:
 *  - Ringkasan: total utang belum lunas + total nominal
 *  - Filter: Belum Lunas | Sudah Lunas | Semua
 *  - Cari berdasarkan nama pelanggan atau invoice number
 *  - Per baris: detail pesanan, jatuh tempo, catatan, tombol "Lunasi"
 *  - Konfirmasi modal sebelum melunasi
 *
 * @param {{ initialDebts: Object[], initialSummary: Object, ownerName: string }} props
 */
export default function DebtList({ initialDebts = [], initialSummary = {}, ownerName }) {
  const [debts, setDebts] = useState(initialDebts);
  const [summary, setSummary] = useState(initialSummary);
  const [filter, setFilter] = useState("unpaid"); // "unpaid" | "paid" | "all"
  const [search, setSearch] = useState("");
  const [confirmId, setConfirmId] = useState(null); // orderId yang sedang dikonfirmasi
  const [settling, setSettling] = useState(null);   // orderId yang sedang diproses
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [expandedId, setExpandedId] = useState(null); // detail items
  const [isPending, startTransition] = useTransition();

  // ── Filter + search ──────────────────────────────────────────────────────────
  const filtered = debts.filter((d) => {
    const matchFilter =
      filter === "all" ||
      (filter === "unpaid" && d.paymentStatus === "pending") ||
      (filter === "paid" && d.paymentStatus === "paid");

    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      d.customerName?.toLowerCase().includes(q) ||
      d.invoiceNumber?.toLowerCase().includes(q) ||
      d.cashierName?.toLowerCase().includes(q);

    return matchFilter && matchSearch;
  });

  // ── Refresh list from server ─────────────────────────────────────────────────
  async function refreshDebts() {
    try {
      const res = await fetch("/api/debts?status=all");
      const json = await res.json();
      if (json.data) {
        setDebts(json.data);
        setSummary(json.summary);
      }
    } catch (err) {
      console.error("Failed to refresh debts:", err);
    }
  }

  // ── Settle debt ──────────────────────────────────────────────────────────────
  async function handleSettle(orderId) {
    setSettling(orderId);
    setError("");

    try {
      const res = await fetch(`/api/orders/${orderId}/debt`, {
        method: "PATCH",
      });
      const json = await res.json();

      if (res.ok) {
        setSuccessMsg("Utang berhasil dilunasi!");
        setConfirmId(null);

        // Update lokal — tidak perlu full refresh
        setDebts((prev) =>
          prev.map((d) =>
            d._id === orderId
              ? {
                  ...d,
                  paymentStatus: "paid",
                  debtPaidAt: new Date().toISOString(),
                  debtPaidByName: ownerName,
                }
              : d
          )
        );

        // Update summary
        setSummary((prev) => {
          const debt = debts.find((d) => d._id === orderId);
          return {
            ...prev,
            totalUnpaid: Math.max(0, prev.totalUnpaid - 1),
            totalUnpaidAmount: Math.max(
              0,
              prev.totalUnpaidAmount - (debt?.totalAmount ?? 0)
            ),
          };
        });

        setTimeout(() => setSuccessMsg(""), 3000);
      } else {
        setError(json.error?.message || "Gagal melunasi utang");
      }
    } catch {
      setError("Gagal terhubung ke server");
    } finally {
      setSettling(null);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function isDueSoon(iso) {
    if (!iso) return false;
    const diff = new Date(iso) - new Date();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000; // 3 hari
  }

  function isOverdue(iso) {
    if (!iso) return false;
    return new Date(iso) < new Date();
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Piutang</h1>
        <p className="text-sm text-gray-500 mt-1">
          Daftar transaksi yang belum dilunasi pelanggan.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-orange-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Belum Lunas</p>
          <p className="text-2xl font-bold text-orange-600">{summary.totalUnpaid}</p>
          <p className="text-xs text-gray-400 mt-0.5">transaksi</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Total Piutang</p>
          <p className="text-xl font-bold text-red-600">
            {formatRupiah(summary.totalUnpaidAmount)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">belum diterima</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Total Semua</p>
          <p className="text-2xl font-bold text-gray-700">{summary.totalAll}</p>
          <p className="text-xs text-gray-400 mt-0.5">transaksi utang</p>
        </div>
      </div>

      {/* Success / error banners */}
      {successMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          ✓ {successMsg}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          {/* Search */}
          <input
            type="text"
            placeholder="Cari nama pelanggan atau invoice..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-72"
          />

          {/* Filter tabs */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
            {[
              { key: "unpaid", label: "Belum Lunas" },
              { key: "paid", label: "Lunas" },
              { key: "all", label: "Semua" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === tab.key
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Pelanggan</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Invoice</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Kasir</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tanggal</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Jatuh Tempo</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    {debts.length === 0
                      ? "Belum ada transaksi utang."
                      : "Tidak ada data yang cocok."}
                  </td>
                </tr>
              ) : (
                filtered.map((debt) => (
                  <>
                    <tr
                      key={debt._id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() =>
                        setExpandedId(expandedId === debt._id ? null : debt._id)
                      }
                    >
                      {/* Pelanggan */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {debt.customerName || <span className="text-gray-400 italic">—</span>}
                        </p>
                        {debt.debtNote && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[160px]">
                            {debt.debtNote}
                          </p>
                        )}
                      </td>

                      {/* Invoice */}
                      <td className="px-4 py-3 font-mono text-xs text-blue-600">
                        {debt.invoiceNumber}
                      </td>

                      {/* Kasir */}
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {debt.cashierName}
                      </td>

                      {/* Tanggal */}
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {formatDate(debt.createdAt)}
                      </td>

                      {/* Jatuh Tempo */}
                      <td className="px-4 py-3 text-xs">
                        {debt.debtDueDate ? (
                          <span
                            className={`font-medium ${
                              debt.paymentStatus === "paid"
                                ? "text-gray-400"
                                : isOverdue(debt.debtDueDate)
                                ? "text-red-600"
                                : isDueSoon(debt.debtDueDate)
                                ? "text-orange-600"
                                : "text-gray-700"
                            }`}
                          >
                            {formatDate(debt.debtDueDate)}
                            {debt.paymentStatus !== "paid" && isOverdue(debt.debtDueDate) && (
                              <span className="ml-1 text-red-500">⚠ Lewat</span>
                            )}
                            {debt.paymentStatus !== "paid" && isDueSoon(debt.debtDueDate) && (
                              <span className="ml-1 text-orange-500">⚡ Segera</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {formatRupiah(debt.totalAmount)}
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3 text-center">
                        {debt.paymentStatus === "paid" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                            ✓ Lunas
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                            ⏳ Belum
                          </span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {debt.paymentStatus === "pending" ? (
                          <button
                            onClick={() => setConfirmId(debt._id)}
                            className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                          >
                            Lunasi
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {formatDate(debt.debtPaidAt)}
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {expandedId === debt._id && (
                      <tr key={`${debt._id}-detail`} className="bg-blue-50">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                              Detail Barang
                            </p>
                            {debt.items?.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex justify-between text-sm text-gray-700"
                              >
                                <span>
                                  {item.productName}{" "}
                                  <span className="text-gray-400 text-xs">× {item.quantity}</span>
                                </span>
                                <span className="font-medium">
                                  {formatRupiah(item.unitPrice * item.quantity)}
                                </span>
                              </div>
                            ))}
                            <div className="border-t border-blue-200 pt-2 flex justify-between font-semibold text-sm">
                              <span>Total</span>
                              <span>{formatRupiah(debt.totalAmount)}</span>
                            </div>
                            {debt.paymentStatus === "paid" && debt.debtPaidByName && (
                              <p className="text-xs text-gray-500 mt-1">
                                Dilunasi oleh: <span className="font-medium">{debt.debtPaidByName}</span> pada{" "}
                                {formatDate(debt.debtPaidAt)}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
            Menampilkan {filtered.length} dari {debts.length} transaksi utang
          </div>
        )}
      </div>

      {/* ── Konfirmasi Pelunasan Modal ── */}
      {confirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmId(null)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const debt = debts.find((d) => d._id === confirmId);
              return (
                <>
                  <div className="flex flex-col items-center gap-3 mb-5 text-center">
                    <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-2xl">
                      ✓
                    </div>
                    <h3 className="font-semibold text-gray-900 text-lg">Konfirmasi Pelunasan</h3>
                    <p className="text-sm text-gray-600">
                      Tandai utang{" "}
                      <span className="font-semibold text-gray-900">
                        {debt?.customerName}
                      </span>{" "}
                      sebagai lunas?
                    </p>
                    <div className="bg-gray-50 rounded-lg px-4 py-3 w-full text-left space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Invoice</span>
                        <span className="font-mono text-blue-600">{debt?.invoiceNumber}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Total</span>
                        <span className="font-semibold">{formatRupiah(debt?.totalAmount)}</span>
                      </div>
                      {debt?.debtDueDate && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Jatuh Tempo</span>
                          <span>{formatDate(debt.debtDueDate)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSettle(confirmId)}
                      disabled={settling === confirmId}
                      className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                    >
                      {settling === confirmId ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Memproses...
                        </span>
                      ) : (
                        "Ya, Tandai Lunas"
                      )}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      disabled={settling === confirmId}
                      className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none disabled:opacity-50"
                    >
                      Batal
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
