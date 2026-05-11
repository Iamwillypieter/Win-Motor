"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatRupiah } from "@/lib/utils";

/**
 * Custom tooltip for the revenue chart.
 */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-sm font-bold text-gray-900">
        {formatRupiah(payload[0].value)}
      </p>
    </div>
  );
}

/**
 * Format a date string (YYYY-MM-DD) to a short label.
 * @param {string} dateStr
 * @returns {string}
 */
function formatDateLabel(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

/**
 * Format Y-axis tick values as abbreviated rupiah.
 * @param {number} value
 * @returns {string}
 */
function formatYAxis(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}rb`;
  return String(value);
}

/**
 * RevenueChart — bar chart of daily revenue using Recharts.
 *
 * @param {{
 *   data: Array<{ date: string, revenue: number }>,
 *   loading?: boolean,
 *   range?: string,
 *   month?: string|null
 * }} props
 */
export default function RevenueChart({ data = [], loading = false, range, month }) {
  if (loading) {
    return (
      <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-gray-100" />
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatDateLabel(d.date),
  }));

  // Judul dinamis berdasarkan filter aktif
  const chartTitle = (() => {
    if (range === "month" && month) {
      const [year, m] = month.split("-");
      const date = new Date(Number(year), Number(m) - 1, 1);
      return `Pendapatan Harian — ${date.toLocaleString("id-ID", { month: "long", year: "numeric" })}`;
    }
    if (range === "daily") return "Pendapatan Hari Ini";
    if (range === "weekly") return "Pendapatan 7 Hari Terakhir";
    return `Pendapatan Bulan Ini`;
  })();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold text-gray-700">
        {chartTitle}
      </h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={chartData}
          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatYAxis}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f3f4f6" }} />
          <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
