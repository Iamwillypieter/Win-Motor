"use client";

import { useState, useCallback } from "react";
import { formatRupiah } from "@/lib/utils";

const TYPE_LABELS = {
  in: { label: "Masuk", color: "bg-green-100 text-green-700" },
  out: { label: "Keluar", color: "bg-red-100 text-red-700" },
  adjustment: { label: "Koreksi", color: "bg-yellow-100 text-yellow-700" },
  create: { label: "Stok Awal", color: "bg-blue-100 text-blue-700" },
};

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
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

/**
 * Bangun map state produk (harga jual & status aktif) dari daftar mutasi.
 * Struktur: { [productId]: { price, active, input, saving, toggling, error } }
 */
function buildProductState(movements) {
  const map = {};
  for (const m of movements) {
    const id = m.productId;
    if (!id || map[id]) continue;
    map[id] = {
      price: m.productPrice ?? 0,
      active: m.productActive ?? true,
      input: m.productPrice != null ? String(m.productPrice) : "",
      saving: false,
      toggling: false,
      error: "",
    };
  }
  return map;
}

/**
 * StockHistory — halaman histori mutasi stok untuk Owner.
 *
 * Filter: produk, tipe mutasi, rentang tanggal, teks bebas.
 * Pagination server-side via /api/stock-movements.
 *
 * Selain riwayat, tabel juga menampilkan Asal Barang & Harga Beli Satuan per
 * mutasi, serta Harga Jual produk yang bisa diedit inline, dan tombol untuk
 * menonaktifkan/mengaktifkan produk (mencegah penjualan saat harga naik/rugi).
 *
 * @param {{ products: Array<{_id, name, sku, category}> }} props
 */
export default function StockHistory({ products = [] }) {
  // Filter state
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState(thirtyDaysAgoStr());
  const [to, setTo] = useState(todayStr());

  // Data state
  const [movements, setMovements] = useState([]);
  // State produk per-mutasi: harga jual (editable) & status aktif (toggle)
  const [productState, setProductState] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);

  const LIMIT = 50;

  const fetchData = useCallback(async (targetPage = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (productId) params.set("productId", productId);
      if (type) params.set("type", type);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("limit", String(LIMIT));
      params.set("page", String(targetPage));

      const res = await fetch(`/api/stock-movements?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message || "Gagal memuat data");
        return;
      }

      setMovements(json.data);
      setProductState(buildProductState(json.data));
      setTotal(json.total);
      setPage(json.page);
      setTotalPages(json.totalPages);
      setHasLoaded(true);
    } catch {
      setError("Gagal terhubung ke server");
    } finally {
      setLoading(false);
    }
  }, [search, productId, type, from, to]);

  function handleSearch(e) {
    e.preventDefault();
    fetchData(1);
  }

  function handleReset() {
    setSearch("");
    setProductId("");
    setType("");
    setFrom(thirtyDaysAgoStr());
    setTo(todayStr());
    setMovements([]);
    setProductState({});
    setTotal(0);
    setHasLoaded(false);
  }

  // ── Edit harga jual (inline) ──────────────────────────────────────────────

  function updatePriceDraft(id, value) {
    setProductState((prev) => ({
      ...prev,
      [id]: { ...prev[id], input: value, error: "" },
    }));
  }

  async function savePrice(id) {
    const ps = productState[id];
    if (!ps) return;

    const num = parseInt(ps.input, 10);
    if (isNaN(num) || num < 0) {
      setProductState((prev) => ({
        ...prev,
        [id]: { ...prev[id], error: "Harga tidak valid" },
      }));
      return;
    }
    // Tidak ada perubahan → kembalikan input ke nilai tersimpan
    if (num === ps.price) {
      setProductState((prev) => ({
        ...prev,
        [id]: { ...prev[id], input: String(ps.price), error: "" },
      }));
      return;
    }

    setProductState((prev) => ({
      ...prev,
      [id]: { ...prev[id], saving: true, error: "" },
    }));

    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: num }),
      });
      const json = await res.json();

      if (!res.ok) {
        setProductState((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            saving: false,
            error: json.error?.message || "Gagal menyimpan harga",
          },
        }));
        return;
      }

      setProductState((prev) => ({
        ...prev,
        [id]: { ...prev[id], price: num, input: String(num), saving: false, error: "" },
      }));
    } catch {
      setProductState((prev) => ({
        ...prev,
        [id]: { ...prev[id], saving: false, error: "Gagal terhubung ke server" },
      }));
    }
  }

  // ── Toggle aktif/nonaktif produk ───────────────────────────────────────────

  async function toggleActive(id, productName) {
    const ps = productState[id];
    if (!ps) return;
    const next = !ps.active;

    if (!next) {
      const ok = window.confirm(
        `Nonaktifkan "${productName}"?\n\nProduk tidak akan muncul di katalog kasir hingga diaktifkan kembali. Gunakan ini jika harga naik untuk menghindari penjualan rugi.`
      );
      if (!ok) return;
    }

    setProductState((prev) => ({
      ...prev,
      [id]: { ...prev[id], toggling: true },
    }));

    try {
      const res = await fetch(`/api/products/${id}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      const json = await res.json();

      if (!res.ok) {
        setProductState((prev) => ({
          ...prev,
          [id]: { ...prev[id], toggling: false },
        }));
        setError(json.error?.message || "Gagal mengubah status produk");
        return;
      }

      setProductState((prev) => ({
        ...prev,
        [id]: { ...prev[id], active: next, toggling: false },
      }));
    } catch {
      setProductState((prev) => ({
        ...prev,
        [id]: { ...prev[id], toggling: false },
      }));
      setError("Gagal terhubung ke server");
    }
  }

  // Ringkasan dari data yang dimuat
  const summary = movements.reduce((acc, m) => {
    if (m.type === "in" || m.type === "create") acc.totalIn += m.quantity;
    if (m.type === "out") acc.totalOut += Math.abs(m.quantity);
    if (m.type === "adjustment") acc.totalAdj += 1;
    return acc;
  }, { totalIn: 0, totalOut: 0, totalAdj: 0 });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Riwayat Mutasi Stok</h1>
        <p className="text-sm text-gray-500 mt-1">
          Catatan setiap perubahan stok — barang masuk, terjual, dan koreksi manual.
        </p>
      </div>

      {/* Filter form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Cari teks bebas */}
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Cari (nama produk / SKU / invoice / user)
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filter produk */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Produk</label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Semua Produk</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>

            {/* Filter tipe */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipe Mutasi</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Semua Tipe</option>
                <option value="in">Masuk</option>
                <option value="out">Keluar (Terjual)</option>
                <option value="adjustment">Koreksi Manual</option>
                <option value="create">Stok Awal</option>
              </select>
            </div>

            {/* Dari tanggal */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Dari Tanggal</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Sampai tanggal */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sampai Tanggal</label>
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
              ) : "Tampilkan"}
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
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary cards — hanya muncul setelah data dimuat */}
      {hasLoaded && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Total Record</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{total}</p>
          </div>
          <div className="bg-white rounded-xl border border-green-200 p-4">
            <p className="text-xs text-gray-500">Total Masuk</p>
            <p className="text-2xl font-bold text-green-600 mt-1">+{summary.totalIn}</p>
            <p className="text-xs text-gray-400">unit</p>
          </div>
          <div className="bg-white rounded-xl border border-red-200 p-4">
            <p className="text-xs text-gray-500">Total Keluar</p>
            <p className="text-2xl font-bold text-red-600 mt-1">−{summary.totalOut}</p>
            <p className="text-xs text-gray-400">unit</p>
          </div>
          <div className="bg-white rounded-xl border border-yellow-200 p-4">
            <p className="text-xs text-gray-500">Koreksi Manual</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">{summary.totalAdj}</p>
            <p className="text-xs text-gray-400">kali</p>
          </div>
        </div>
      )}

      {/* Info pengingat */}
      {hasLoaded && (
        <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800">
          <span className="font-medium">Tips:</span> Harga Jual bisa diedit langsung di tabel
          (klik kolom, ubah, lalu tekan Enter/klik luar untuk menyimpan). Jika harga beli naik
          melebihi harga jual, gunakan tombol <span className="font-medium">Nonaktifkan</span>{" "}
          agar produk tidak bisa dijual hingga harga jual disesuaikan.
        </div>
      )}

      {/* Tabel */}
      {hasLoaded && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Waktu</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Produk</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Tipe</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Jml</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Stok Sebelum</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Stok Sesudah</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Asal Barang</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Harga Beli Satuan</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Harga Jual</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Keterangan</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">User</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-gray-400">
                      Tidak ada data mutasi stok untuk filter yang dipilih
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => {
                    const typeCfg = TYPE_LABELS[m.type] ?? {
                      label: m.type,
                      color: "bg-gray-100 text-gray-700",
                    };
                    const isPositive = m.quantity > 0;
                    const ps = m.productId ? productState[m.productId] : undefined;
                    // Indikator rugi: harga jual <= harga beli mutasi (barang masuk/awal)
                    const isLoss =
                      m.purchasePrice != null &&
                      m.purchasePrice > 0 &&
                      ps &&
                      ps.price != null &&
                      ps.price <= m.purchasePrice;

                    return (
                      <tr key={m._id} className="hover:bg-gray-50 transition-colors">
                        {/* Waktu */}
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {formatDate(m.createdAt)}
                        </td>

                        {/* Produk */}
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 text-sm">{m.productName}</p>
                          <p className="text-xs text-gray-400 font-mono">{m.sku}</p>
                        </td>

                        {/* Tipe */}
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${typeCfg.color}`}>
                            {typeCfg.label}
                          </span>
                        </td>

                        {/* Jumlah */}
                        <td className={`px-4 py-3 text-right font-semibold ${isPositive ? "text-green-600" : "text-red-600"}`}>
                          {isPositive ? "+" : ""}{m.quantity}
                        </td>

                        {/* Stok sebelum */}
                        <td className="px-4 py-3 text-right text-gray-600">
                          {m.previousStock}
                        </td>

                        {/* Stok sesudah */}
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {m.newStock}
                        </td>

                        {/* Asal Barang */}
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                          {m.supplierName || <span className="text-gray-300">—</span>}
                        </td>

                        {/* Harga Beli Satuan */}
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                          {m.purchasePrice != null
                            ? formatRupiah(m.purchasePrice)
                            : <span className="text-gray-300">—</span>}
                        </td>

                        {/* Harga Jual — editable */}
                        <td className="px-4 py-3">
                          {ps ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-400">Rp</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={ps.input}
                                  onChange={(e) => updatePriceDraft(m.productId, e.target.value)}
                                  onBlur={() => savePrice(m.productId)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.target.blur();
                                  }}
                                  disabled={ps.saving}
                                  aria-label={`Harga jual ${m.productName}`}
                                  className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                />
                              </div>
                              {ps.saving && (
                                <span className="flex items-center gap-1 text-[10px] text-blue-600">
                                  <span className="w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                  menyimpan
                                </span>
                              )}
                              {ps.error && (
                                <span className="text-[10px] text-red-600">{ps.error}</span>
                              )}
                              {isLoss && (
                                <span className="text-[10px] text-red-600 font-medium">
                                  ⚠ harga jual ≤ harga beli
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>

                        {/* Keterangan */}
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {m.reason || "—"}
                          {m.invoiceNumber && (
                            <p className="font-mono text-blue-600">{m.invoiceNumber}</p>
                          )}
                        </td>

                        {/* User */}
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {m.userName || "—"}
                        </td>

                        {/* Aksi — toggle aktif/nonaktif */}
                        <td className="px-4 py-3 text-center">
                          {ps ? (
                            <button
                              onClick={() => toggleActive(m.productId, m.productName)}
                              disabled={ps.toggling}
                              className={
                                ps.active
                                  ? "rounded-lg bg-red-50 border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50 whitespace-nowrap"
                                  : "rounded-lg bg-green-50 border border-green-200 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50 whitespace-nowrap"
                              }
                            >
                              {ps.toggling ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                </span>
                              ) : ps.active ? (
                                "Nonaktifkan"
                              ) : (
                                "Aktifkan"
                              )}
                            </button>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
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
          {movements.length > 0 && totalPages <= 1 && (
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              Menampilkan {movements.length} dari {total} record
            </div>
          )}
        </div>
      )}

      {/* Empty state — belum pernah klik tampilkan */}
      {!hasLoaded && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <span className="text-5xl">📊</span>
          <p className="text-base font-medium text-gray-500">Belum ada data</p>
          <p className="text-sm text-center max-w-xs">
            Atur filter di atas lalu klik <strong>Tampilkan</strong> untuk melihat riwayat mutasi stok.
          </p>
        </div>
      )}
    </div>
  );
}
