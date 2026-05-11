"use client";

import { useState, useEffect } from "react";
import { formatRupiah } from "@/lib/utils";

const MEDAL = ["🥇", "🥈", "🥉"];

/**
 * CashierRanking — menampilkan ranking kasir berdasarkan total penjualan bulan ini.
 * @param {{ refreshKey?: number }} props
 */
export default function CashierRanking({ refreshKey }) {
  const [ranking, setRanking] = useState([]);
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchRanking() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/analytics/ranking");
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message || "Gagal memuat ranking");
        setRanking(body.data || []);
        setMonth(body.month || "");
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchRanking();
  }, [refreshKey]); // re-fetch setiap kali refreshKey berubah

  // Hitung max revenue untuk progress bar
  const maxRevenue = ranking.length > 0 ? ranking[0].totalRevenue : 1;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Ranking Kasir</h2>
          {month && (
            <p className="text-xs text-gray-500 mt-0.5">Penjualan terbaik — {month}</p>
          )}
        </div>
        <span className="text-2xl">🏆</span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-200 rounded w-1/3" />
                <div className="h-2 bg-gray-100 rounded w-full" />
              </div>
              <div className="h-3 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Empty */}
      {!loading && !error && ranking.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-3xl mb-2">📊</p>
          <p className="text-sm">Belum ada data penjualan bulan ini</p>
        </div>
      )}

      {/* Ranking list — single column full width */}
      {!loading && !error && ranking.length > 0 && (
        <div className="space-y-4">
          {ranking.map((cashier, idx) => {
            const barWidth = maxRevenue > 0
              ? Math.round((cashier.totalRevenue / maxRevenue) * 100)
              : 0;

            const isTop3 = idx < 3;
            const barColor = idx === 0
              ? "bg-yellow-400"
              : idx === 1
              ? "bg-gray-400"
              : idx === 2
              ? "bg-amber-600"
              : "bg-blue-400";

            return (
              <div key={cashier.cashierName}>
                <div className="flex items-center gap-3 mb-1.5">
                  {/* Rank badge */}
                  <div className="w-8 text-center flex-shrink-0">
                    {isTop3 ? (
                      <span className="text-xl leading-none">{MEDAL[idx]}</span>
                    ) : (
                      <span className="text-sm font-bold text-gray-400">#{idx + 1}</span>
                    )}
                  </div>

                  {/* Name + stats */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {cashier.cashierName}
                      </span>
                      <span className="text-sm font-bold text-gray-800 flex-shrink-0">
                        {formatRupiah(cashier.totalRevenue)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">
                        {cashier.totalOrders} transaksi
                      </span>
                      <span className="text-xs text-gray-400">
                        rata-rata {formatRupiah(Math.round(cashier.totalRevenue / cashier.totalOrders))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="ml-11 h-1.5 bg-gray-100 rounded-full overflow-hidden">
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
