"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import RevenueChart from "@/components/owner/RevenueChart";
import DateRangePicker from "@/components/owner/DateRangePicker";
import CashierRanking from "@/components/owner/CashierRanking";
import TopProducts from "@/components/owner/TopProducts";
import LowStockAlert from "@/components/owner/LowStockAlert";
import SummaryMetrics from "@/components/owner/SummaryMetrics";
import MetricCards from "@/components/owner/MetricCards";

// Events SSE yang memicu refresh analytics
const SSE_REFRESH_EVENTS = new Set([
  "order_completed",
  "order_status_updated",
  "debt_settled",
  "stock_updated",
  "product_updated",
]);

// Debounce SSE refresh agar tidak fetch berulang kali saat banyak event sekaligus
const SSE_DEBOUNCE_MS = 2_000;

export default function OwnerDashboardPage() {
  const [range, setRange] = useState("monthly");
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [summary, setSummary] = useState(null);
  const [chart, setChart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now()); // trigger untuk child components
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Ref untuk debounce SSE-triggered refresh
  const sseDebounceRef = useRef(null);
  // Ref stabil untuk range/month agar tidak perlu dependency di SSE handler
  const rangeRef = useRef(range);
  const monthRef = useRef(selectedMonth);
  useEffect(() => { rangeRef.current = range; }, [range]);
  useEffect(() => { monthRef.current = selectedMonth; }, [selectedMonth]);

  const fetchData = useCallback(async (currentRange, currentMonth, silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      let url = `/api/analytics?range=${currentRange}`;
      if (currentRange === "month" && currentMonth) {
        url += `&month=${currentMonth}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || "Gagal memuat data");
      }
      const data = await res.json();
      setSummary(data.summary);
      setChart(data.chart);
      setLastRefresh(Date.now());
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError(err.message || "Terjadi kesalahan saat memuat data");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Fetch saat range/bulan berubah
  useEffect(() => {
    fetchData(range, selectedMonth);
  }, [range, selectedMonth, fetchData]);

  // SSE — subscribe ke event transaksi dan refresh analytics secara real-time
  // Menggantikan polling 30 detik agar data selalu segar tanpa request sia-sia
  useEffect(() => {
    if (typeof EventSource === "undefined") return;

    const es = new EventSource("/api/sse");

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (!SSE_REFRESH_EVENTS.has(parsed.type)) return;

        // Debounce: batalkan timer sebelumnya, set yang baru
        if (sseDebounceRef.current) clearTimeout(sseDebounceRef.current);
        sseDebounceRef.current = setTimeout(() => {
          fetchData(rangeRef.current, monthRef.current, true);
        }, SSE_DEBOUNCE_MS);
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // EventSource akan reconnect sendiri — tidak perlu action manual
    };

    return () => {
      es.close();
      if (sseDebounceRef.current) clearTimeout(sseDebounceRef.current);
    };
  }, [fetchData]);

  const handleRangeChange = (newRange, newMonth) => {
    setRange(newRange);
    setSelectedMonth(newMonth);
  };

  const handleManualRefresh = () => {
    fetchData(range, selectedMonth, true);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      let exportUrl = `/api/reports/export?range=${range}`;
      if (range === "month" && selectedMonth) {
        exportUrl += `&month=${selectedMonth}`;
      }
      const res = await fetch(exportUrl);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || "Gagal mengekspor laporan");
      }

      // Trigger file download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Use filename from Content-Disposition header if available
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename=([^;]+)/);
      a.download = match ? match[1] : `report-${range}.csv`;

      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
      alert(err.message || "Gagal mengekspor laporan");
    } finally {
      setExporting(false);
    }
  };

  const hasNoData = !loading && summary?.totalOrders === 0;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard Analitik</h1>
            {/* Auto-refresh indicator */}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing || loading}
              title="Refresh data"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <span className={isRefreshing ? "animate-spin" : ""}>🔄</span>
              {isRefreshing ? "Memperbarui..." : "Refresh"}
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <DateRangePicker range={range} month={selectedMonth} onChange={handleRangeChange} />

            <button
              onClick={handleExport}
              disabled={hasNoData || exporting || loading}
              className={[
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                hasNoData || exporting || loading
                  ? "cursor-not-allowed bg-gray-100 text-gray-400"
                  : "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800",
              ].join(" ")}
              aria-disabled={hasNoData || exporting || loading}
            >
              {exporting ? "Mengekspor..." : "Ekspor Laporan"}
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Metrik utama — total, online, offline, pesanan, rata-rata (sesuai range yang dipilih) */}
        <MetricCards
          totalRevenue={summary?.totalRevenue ?? 0}
          onlineRevenue={summary?.onlineRevenue ?? 0}
          offlineRevenue={summary?.offlineRevenue ?? 0}
          totalOrders={summary?.totalOrders ?? 0}
          averageOrderValue={summary?.averageOrderValue ?? 0}
          loading={loading}
        />

        {/* Summary harian & bulanan — selalu menampilkan hari ini dan bulan berjalan */}
        <SummaryMetrics refreshKey={lastRefresh} />

        {/* Revenue chart — full width */}
        {!hasNoData && (
          <RevenueChart data={chart} loading={loading} range={range} month={selectedMonth} />
        )}

        {/* Empty state */}
        {hasNoData && !error && (
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
            <p className="text-gray-500">
              Tidak ada data transaksi untuk periode ini
            </p>
          </div>
        )}

        {/* Cashier ranking — horizontal full width, di bawah grafik */}
        <CashierRanking refreshKey={lastRefresh} />

        {/* Top products — horizontal full width */}
        <TopProducts refreshKey={lastRefresh} />

        {/* Low stock alert — di bawah semua konten */}
        <LowStockAlert refreshKey={lastRefresh} />
      </div>
    </main>
  );
}
