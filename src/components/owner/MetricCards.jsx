"use client";

import { formatRupiah } from "@/lib/utils";

/**
 * A single metric card.
 */
function MetricCard({ title, value, subtitle }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
}

/**
 * MetricCards — displays totalRevenue, onlineRevenue, offlineRevenue, totalOrders, averageOrderValue.
 *
 * @param {{
 *   totalRevenue: number,
 *   onlineRevenue: number,
 *   offlineRevenue: number,
 *   totalOrders: number,
 *   averageOrderValue: number,
 *   loading?: boolean
 * }} props
 */
export default function MetricCards({
  totalRevenue = 0,
  onlineRevenue = 0,
  offlineRevenue = 0,
  totalOrders = 0,
  averageOrderValue = 0,
  loading = false,
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl border border-gray-200 bg-gray-100"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <MetricCard
        title="Total Pendapatan"
        value={formatRupiah(totalRevenue)}
        subtitle="Dari pesanan selesai"
      />
      <MetricCard
        title="Pendapatan Online"
        value={formatRupiah(onlineRevenue)}
        subtitle="Pesanan kanal online"
      />
      <MetricCard
        title="Pendapatan Toko"
        value={formatRupiah(offlineRevenue)}
        subtitle="Pesanan kasir toko"
      />
      <MetricCard
        title="Total Pesanan"
        value={totalOrders.toLocaleString("id-ID")}
        subtitle="Pesanan selesai"
      />
      <MetricCard
        title="Rata-rata per Pesanan"
        value={formatRupiah(averageOrderValue)}
        subtitle="Nilai rata-rata transaksi"
      />
    </div>
  );
}
