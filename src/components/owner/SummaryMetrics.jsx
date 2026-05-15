"use client";

import { useState, useEffect, useCallback } from "react";
import { formatRupiah } from "@/lib/utils";

/**
 * SummaryMetrics — menampilkan metrik harian (reset tiap hari) dan bulanan (tanggal 1 s/d akhir bulan).
 * @param {{ refreshKey?: number }} props
 */
export default function SummaryMetrics({ refreshKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics/summary");
      const body = await res.json();
      if (res.ok) setData(body);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary, refreshKey]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl border border-gray-200 bg-gray-100" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const { daily, monthly, todayLabel } = data;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Hari ini */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Hari Ini</p>
            <p className="text-xs text-blue-500 mt-0.5">{todayLabel}</p>
          </div>
          <span className="text-2xl">📅</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-blue-500">Pendapatan</p>
            <p className="text-lg font-bold text-blue-900">{formatRupiah(daily.totalRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-blue-500">Pesanan</p>
            <p className="text-lg font-bold text-blue-900">{daily.totalOrders}</p>
          </div>
          <div>
            <p className="text-xs text-blue-500">Rata-rata</p>
            <p className="text-lg font-bold text-blue-900">{formatRupiah(daily.averageOrderValue)}</p>
          </div>
        </div>
        <p className="text-xs text-blue-400 mt-3">Dihitung Setiap Hari</p>
      </div>

      {/* Bulan ini */}
      <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Bulan Ini</p>
            <p className="text-xs text-purple-500 mt-0.5">{monthly.monthLabel}</p>
          </div>
          <span className="text-2xl">📆</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-purple-500">Pendapatan</p>
            <p className="text-lg font-bold text-purple-900">{formatRupiah(monthly.totalRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-purple-500">Pesanan</p>
            <p className="text-lg font-bold text-purple-900">{monthly.totalOrders}</p>
          </div>
          <div>
            <p className="text-xs text-purple-500">Rata-rata</p>
            <p className="text-lg font-bold text-purple-900">{formatRupiah(monthly.averageOrderValue)}</p>
          </div>
        </div>
        <p className="text-xs text-purple-400 mt-3">Dihitung dari tanggal 1 s/d akhir bulan</p>
      </div>
    </div>
  );
}
