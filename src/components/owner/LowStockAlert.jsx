"use client";

import { useState, useEffect, useCallback } from "react";

const THRESHOLD = 5; // produk dengan stok <= 5 dianggap hampir habis
const REFRESH_INTERVAL = 60_000; // refresh setiap 1 menit

/**
 * LowStockAlert — menampilkan peringatan produk stok habis dan hampir habis.
 * Ditampilkan di dashboard Owner.
 *
 * @param {{ refreshKey?: number }} props
 */
export default function LowStockAlert({ refreshKey }) {
  const [products, setProducts] = useState([]);
  const [outOfStock, setOutOfStock] = useState(0);
  const [lowStock, setLowStock] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const fetchLowStock = useCallback(async () => {
    try {
      const res = await fetch(`/api/products/low-stock?threshold=${THRESHOLD}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Gagal memuat data");
      setProducts(body.data || []);
      setOutOfStock(body.outOfStock || 0);
      setLowStock(body.lowStock || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLowStock();
  }, [fetchLowStock, refreshKey]);

  // Auto-refresh setiap 1 menit
  useEffect(() => {
    const interval = setInterval(fetchLowStock, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchLowStock]);

  // Tidak tampilkan apa-apa jika loading pertama kali dan tidak ada masalah
  if (loading) return null;
  if (error) return null;
  if (products.length === 0) return null;

  const hasOutOfStock = outOfStock > 0;

  return (
    <div
      className={`rounded-xl border ${
        hasOutOfStock
          ? "border-red-200 bg-red-50"
          : "border-yellow-200 bg-yellow-50"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">{hasOutOfStock ? "🚨" : "⚠️"}</span>
          <div>
            <h3
              className={`text-sm font-semibold ${
                hasOutOfStock ? "text-red-800" : "text-yellow-800"
              }`}
            >
              {hasOutOfStock
                ? `${outOfStock} produk stok habis`
                : `${lowStock} produk hampir habis`}
              {outOfStock > 0 && lowStock > 0 && (
                <span className="font-normal">
                  {" "}dan {lowStock} hampir habis
                </span>
              )}
            </h3>
            <p
              className={`text-xs mt-0.5 ${
                hasOutOfStock ? "text-red-600" : "text-yellow-700"
              }`}
            >
              Segera hubungi staf gudang untuk menambah stok
            </p>
          </div>
        </div>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
            hasOutOfStock
              ? "text-red-700 hover:bg-red-100"
              : "text-yellow-700 hover:bg-yellow-100"
          }`}
          aria-expanded={!collapsed}
        >
          {collapsed ? "Lihat detail" : "Sembunyikan"}
        </button>
      </div>

      {/* Product list */}
      {!collapsed && (
        <div className="px-5 pb-4">
          <div className="rounded-lg overflow-hidden border border-white/60">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className={`text-xs font-medium uppercase tracking-wide ${
                    hasOutOfStock
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  <th className="px-3 py-2 text-left">Nama Produk</th>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-right">Stok</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/40 bg-white/50">
                {products.map((product) => (
                  <tr key={product._id} className="hover:bg-white/70 transition-colors">
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {product.name}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">
                      {product.sku}
                    </td>
                    <td className="px-3 py-2 text-right font-bold">
                      <span
                        className={
                          product.stock === 0
                            ? "text-red-600"
                            : "text-yellow-600"
                        }
                      >
                        {product.stock}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          product.stock === 0
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {product.stock === 0 ? "Habis" : "Hampir Habis"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-2">
            Menampilkan produk dengan stok ≤ {THRESHOLD} unit
          </p>
        </div>
      )}
    </div>
  );
}
