"use client";

import { useState, useEffect } from "react";
import { formatRupiah } from "@/lib/utils";

/**
 * TopProducts — menampilkan produk terlaris berdasarkan jumlah terjual bulan ini.
 * @param {{ refreshKey?: number }} props
 */
export default function TopProducts({ refreshKey }) {
  const [products, setProducts] = useState([]);
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchTopProducts() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/analytics/top-products");
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message || "Gagal memuat data");
        setProducts(body.data || []);
        setMonth(body.month || "");
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchTopProducts();
  }, [refreshKey]); // re-fetch setiap kali refreshKey berubah

  const maxQty = products.length > 0 ? products[0].totalQty : 1;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Produk Terlaris</h2>
          {month && (
            <p className="text-xs text-gray-500 mt-0.5">Penjualan terbanyak — {month}</p>
          )}
        </div>
        <span className="text-2xl">🛒</span>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="animate-pulse flex items-center gap-3">
              <div className="w-6 h-4 bg-gray-200 rounded flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-200 rounded w-2/3" />
                <div className="h-2 bg-gray-100 rounded w-full" />
              </div>
              <div className="h-3 bg-gray-200 rounded w-12 flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Empty */}
      {!loading && !error && products.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-3xl mb-2">📦</p>
          <p className="text-sm">Belum ada data penjualan produk bulan ini</p>
        </div>
      )}

      {/* Product list — single column full width */}
      {!loading && !error && products.length > 0 && (
        <div className="space-y-3">
          {products.map((product, idx) => {
            const barWidth = maxQty > 0
              ? Math.round((product.totalQty / maxQty) * 100)
              : 0;

            const barColor =
              idx === 0 ? "bg-orange-400" :
              idx === 1 ? "bg-orange-300" :
              idx === 2 ? "bg-yellow-300" :
              "bg-blue-300";

            return (
              <div key={`${product.sku}-${idx}`}>
                <div className="flex items-center gap-2 mb-1">
                  {/* Rank number */}
                  <span className="text-xs font-bold text-gray-400 w-5 text-right flex-shrink-0">
                    {idx + 1}
                  </span>

                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {product.productName}
                      </span>
                      <span className="text-sm font-bold text-gray-700 flex-shrink-0">
                        {product.totalQty} pcs
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-gray-400 font-mono">
                        {product.sku}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatRupiah(product.totalRevenue)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="ml-7 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
