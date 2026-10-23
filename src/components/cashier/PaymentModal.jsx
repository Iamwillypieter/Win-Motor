"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatRupiah } from "@/lib/utils";
import { playNotificationSound } from "@/components/shared/SoundNotification";

/**
 * PaymentModal — Client Component for processing Cash, QRIS, or Debt payments.
 *
 * Features:
 *  - Input diskon % per item — kasir ketik angka di samping setiap item, total langsung update
 *  - Tab toggle: CASH | QRIS | UTANG
 *  - CASH: input uang diterima, kembalian real-time
 *  - QRIS: QR code display, 5-minute countdown
 *  - UTANG: jatuh tempo opsional, catatan opsional
 *  - Invoice summary tampilkan harga coret + diskon + harga akhir
 *
 * @param {{ order: Object, cashierName: string }} props
 */
export default function PaymentModal({ order: initialOrder, cashierName }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("CASH");
  const [isPending, startTransition] = useTransition();
  const [currentOrder, setCurrentOrder] = useState(initialOrder);

  // ── Diskon per item ──────────────────────────────────────────────────────────
  // discounts: { [productId]: number (0–100) }
  const [discounts, setDiscounts] = useState(() => {
    const init = {};
    for (const item of initialOrder.items) {
      init[item.productId] = 0;
    }
    return init;
  });

  // Kalkulasi derived values dari diskon
  const itemsWithCalc = currentOrder.items.map((item) => {
    const pct = discounts[item.productId] ?? 0;
    const originalSubtotal = item.unitPrice * item.quantity;
    const discountAmount = pct > 0 ? Math.round(originalSubtotal * pct / 100) : 0;
    const finalSubtotal = originalSubtotal - discountAmount;
    return { ...item, pct, originalSubtotal, discountAmount, finalSubtotal };
  });

  const discountTotal = itemsWithCalc.reduce((s, i) => s + i.discountAmount, 0);
  const effectiveTotal = currentOrder.totalAmount - discountTotal;
  const hasDiscount = discountTotal > 0;

  // Helper: itemDiscounts array untuk dikirim ke API
  const buildItemDiscounts = () =>
    currentOrder.items.map((item) => ({
      productId: item.productId,
      discountPercent: discounts[item.productId] ?? 0,
    }));

  // ── SSE — update status pesanan real-time ───────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    if (currentOrder.orderStatus === "completed") return;

    const es = new EventSource("/api/sse");
    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (
          (parsed.type === "order_ready" || parsed.type === "order_status_updated") &&
          parsed.data?.orderId === currentOrder._id
        ) {
          setCurrentOrder((prev) => ({
            ...prev,
            orderStatus: parsed.data.orderStatus ?? "ready",
          }));
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [currentOrder._id, currentOrder.orderStatus]);

  // ── CASH state ───────────────────────────────────────────────────────────────
  const [cashReceived, setCashReceived] = useState("");
  const [cashError, setCashError] = useState("");

  const cashReceivedNum = parseInt(cashReceived, 10) || 0;
  const computedChange = cashReceivedNum >= effectiveTotal
    ? cashReceivedNum - effectiveTotal
    : null;

  // ── QRIS state ───────────────────────────────────────────────────────────────
  const [qrisData, setQrisData] = useState(null);
  const [qrisLoading, setQrisLoading] = useState(false);
  const [qrisError, setQrisError] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!qrisData?.qrisExpiresAt) return;
    const updateTimer = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(qrisData.qrisExpiresAt) - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [qrisData?.qrisExpiresAt]);

  const formatTimeLeft = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const isQrisExpired = qrisData && timeLeft === 0;

  // ── DEBT state ───────────────────────────────────────────────────────────────
  const [debtDueDate, setDebtDueDate] = useState("");
  const [debtNote, setDebtNote] = useState("");
  const [debtError, setDebtError] = useState("");
  const [debtSubmitting, setDebtSubmitting] = useState(false);

  // ── Success state ────────────────────────────────────────────────────────────
  const [invoice, setInvoice] = useState(null);
  const [changeAmount, setChangeAmount] = useState(null);

  // ── Generate QRIS ────────────────────────────────────────────────────────────
  const handleGenerateQRIS = useCallback(async () => {
    setQrisLoading(true);
    setQrisError("");
    setQrisData(null);
    try {
      const res = await fetch(`/api/orders/${currentOrder._id}/qris`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) { setQrisError(result.error?.message || "Gagal membuat kode QRIS"); return; }
      setQrisData(result.data);
    } catch { setQrisError("Gagal terhubung ke server"); }
    finally { setQrisLoading(false); }
  }, [currentOrder._id]);

  useEffect(() => {
    if (activeTab === "QRIS" && !qrisData && !qrisLoading) handleGenerateQRIS();
  }, [activeTab, qrisData, qrisLoading, handleGenerateQRIS]);

  // ── Confirm Cash Payment ─────────────────────────────────────────────────────
  const handleCashPayment = () => {
    setCashError("");
    const amount = parseInt(cashReceived, 10);
    if (!cashReceived || isNaN(amount)) {
      setCashError("Masukkan jumlah uang yang diterima");
      return;
    }
    if (amount < effectiveTotal) {
      setCashError(`Uang yang diterima kurang. Minimal ${formatRupiah(effectiveTotal)}`);
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/orders/${currentOrder._id}/payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cashReceived: amount,
            itemDiscounts: buildItemDiscounts(),
          }),
        });
        const result = await res.json();
        if (!res.ok) { setCashError(result.error?.message || "Pembayaran gagal"); return; }
        setInvoice(result.data.invoice);
        setChangeAmount(result.data.changeAmount);
        playNotificationSound("payment_success");
      } catch { setCashError("Gagal terhubung ke server"); }
    });
  };

  // ── Confirm Debt ─────────────────────────────────────────────────────────────
  const handleDebtPayment = async () => {
    setDebtError("");
    if (!currentOrder.customerName?.trim()) {
      setDebtError("Nama pelanggan wajib diisi sebelum mencatat utang.");
      return;
    }
    setDebtSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${currentOrder._id}/debt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dueDate: debtDueDate || undefined,
          note: debtNote || undefined,
          itemDiscounts: buildItemDiscounts(),
        }),
      });
      const result = await res.json();
      if (!res.ok) { setDebtError(result.error?.message || "Gagal mencatat utang"); return; }
      setInvoice(result.data.invoice);
      playNotificationSound("payment_success");
    } catch { setDebtError("Gagal terhubung ke server"); }
    finally { setDebtSubmitting(false); }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Invoice Summary (success state)
  // ────────────────────────────────────────────────────────────────────────────
  if (invoice) {
    const invoiceDiscountTotal = invoice.discountTotal ?? 0;
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg mx-auto">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl ${
            invoice.paymentMethod === "DEBT" ? "bg-orange-100" : "bg-green-100"
          }`}>
            {invoice.paymentMethod === "DEBT" ? "📋" : "✓"}
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            {invoice.paymentMethod === "DEBT" ? "Utang Dicatat!" : "Pembayaran Berhasil!"}
          </h2>
          <p className="text-sm text-gray-500">
            {invoice.paymentMethod === "CASH" ? "Tunai"
              : invoice.paymentMethod === "QRIS" ? "QRIS"
              : "Utang — Belum Lunas"}
          </p>
          {invoice.paymentMethod === "DEBT" && (
            <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 text-center">
              Transaksi dicatat sebagai utang. Owner akan dikonfirmasi saat pelunasan.
            </p>
          )}
        </div>

        {/* Invoice detail */}
        <div className="border border-gray-200 rounded-lg p-4 space-y-3 mb-4">
          {invoice.customerName && (
            <div className="text-center pb-2 border-b border-gray-100">
              <p className="font-bold text-gray-900 text-base">{invoice.customerName}</p>
              <p className="text-xs text-gray-400">Pelanggan</p>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">No. Invoice</span>
            <span className="font-mono font-semibold text-blue-600">{invoice.invoiceNumber}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Kasir</span>
            <span className="font-medium">{invoice.cashierName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Waktu</span>
            <span className="font-medium">{new Date(invoice.transactionAt).toLocaleString("id-ID")}</span>
          </div>

          {/* Items */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            {invoice.items.map((item, idx) => (
              <div key={idx} className="text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-700">
                    {item.productName} <span className="text-gray-400">×{item.quantity}</span>
                  </span>
                  <div className="text-right">
                    {item.discountPercent > 0 ? (
                      <>
                        <p className="text-xs text-gray-400 line-through">
                          {formatRupiah(item.unitPrice * item.quantity)}
                        </p>
                        <p className="font-medium text-green-700">{formatRupiah(item.subtotal)}</p>
                      </>
                    ) : (
                      <p className="font-medium">{formatRupiah(item.subtotal)}</p>
                    )}
                  </div>
                </div>
                {item.discountPercent > 0 && (
                  <p className="text-xs text-green-600 mt-0.5">
                    Diskon {item.discountPercent}% — hemat {formatRupiah(item.discountAmount)}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-gray-200 pt-3 space-y-1">
            {invoiceDiscountTotal > 0 && (
              <>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal</span>
                  <span>{formatRupiah(invoice.totalAmount + invoiceDiscountTotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-green-600 font-medium">
                  <span>Total Diskon</span>
                  <span>− {formatRupiah(invoiceDiscountTotal)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-bold text-base">
              <span>Total Bayar</span>
              <span className={invoiceDiscountTotal > 0 ? "text-green-700" : ""}>
                {formatRupiah(invoice.totalAmount)}
              </span>
            </div>
            {invoice.paymentMethod === "CASH" && (
              <>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Uang Diterima</span>
                  <span>{formatRupiah(invoice.cashReceived)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-green-700">
                  <span>Kembalian</span>
                  <span>{formatRupiah(changeAmount ?? invoice.changeAmount)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            🖨️ Cetak Invoice
          </button>
          <button
            onClick={() => router.push(`/cashier/invoice/${invoice.orderId}`)}
            className="flex-1 rounded-lg border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            📄 Lihat Invoice
          </button>
          <button
            onClick={() => router.push("/cashier")}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Pesanan Baru
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Payment form
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg mx-auto">
      {/* Order summary */}
      <div className="mb-4">
        {currentOrder.customerName && (
          <p className="text-center font-bold text-gray-900 text-lg mb-2">
            {currentOrder.customerName}
          </p>
        )}
        <h2 className="text-lg font-bold text-gray-900 mb-1">Konfirmasi Pembayaran</h2>
        <p className="text-sm text-gray-500">Invoice: {currentOrder.invoiceNumber}</p>
      </div>

      {/* Status banner */}
      <div
        role="status"
        className={`mb-5 rounded-lg px-4 py-3 flex items-center gap-3 ${
          currentOrder.orderStatus === "ready" || currentOrder.orderStatus === "completed"
            ? "bg-green-50 border border-green-300"
            : "bg-blue-50 border border-blue-200"
        }`}
      >
        <span className="text-xl">
          {currentOrder.orderStatus === "ready" || currentOrder.orderStatus === "completed" ? "✅" : "📦"}
        </span>
        <p className="text-sm font-medium text-gray-800">
          {currentOrder.orderStatus === "ready"
            ? "Gudang sudah menandai pesanan siap"
            : currentOrder.orderStatus === "completed"
            ? "Pesanan selesai"
            : "Pesanan sedang diproses gudang — kasir bisa lanjut bayar"}
        </p>
      </div>

      {/* ── Item list + input diskon ── */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 mb-5 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Detail Item
          </p>
          <p className="text-xs text-gray-400">Ketik % diskon di kolom kanan</p>
        </div>

        <div className="divide-y divide-gray-100">
          {itemsWithCalc.map((item) => (
            <div key={item.productId} className="px-4 py-3">
              {/* Baris nama + harga */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.productName}</p>
                  <p className="text-xs text-gray-400">
                    {formatRupiah(item.unitPrice)} × {item.quantity}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Input diskon % */}
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={discounts[item.productId] === 0 ? "" : discounts[item.productId]}
                      onChange={(e) => {
                        const v = e.target.value === "" ? 0 : Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
                        setDiscounts((prev) => ({ ...prev, [item.productId]: v }));
                      }}
                      placeholder="0"
                      className="w-14 rounded-lg border border-gray-300 px-2 py-1.5 text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label={`Diskon % untuk ${item.productName}`}
                    />
                    <span className="text-sm text-gray-500 font-medium">%</span>
                  </div>

                  {/* Subtotal */}
                  <div className="text-right w-24">
                    {item.pct > 0 ? (
                      <>
                        <p className="text-xs text-gray-400 line-through">
                          {formatRupiah(item.originalSubtotal)}
                        </p>
                        <p className="text-sm font-semibold text-green-700">
                          {formatRupiah(item.finalSubtotal)}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-semibold text-gray-900">
                        {formatRupiah(item.originalSubtotal)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Badge hemat */}
              {item.pct > 0 && (
                <p className="mt-1 text-xs text-green-600">
                  Hemat {formatRupiah(item.discountAmount)} ({item.pct}%)
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Footer total */}
        <div className="px-4 py-3 bg-white border-t border-gray-200 space-y-1">
          {hasDiscount && (
            <>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span>
                <span>{formatRupiah(currentOrder.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium text-green-600">
                <span>Total Diskon</span>
                <span>− {formatRupiah(discountTotal)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between font-bold text-base">
            <span>Total Bayar</span>
            <span className={hasDiscount ? "text-green-700" : "text-blue-600"}>
              {formatRupiah(effectiveTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Payment method tabs */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-6">
        <button
          onClick={() => setActiveTab("CASH")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors focus:outline-none ${
            activeTab === "CASH" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          💵 Tunai
        </button>
        <button
          onClick={() => setActiveTab("QRIS")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors focus:outline-none ${
            activeTab === "QRIS" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          📱 QRIS
        </button>
        <button
          onClick={() => setActiveTab("DEBT")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors focus:outline-none ${
            activeTab === "DEBT" ? "bg-orange-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          📋 Utang
        </button>
      </div>

      {/* ── CASH tab ── */}
      {activeTab === "CASH" && (
        <div className="space-y-4">
          <div>
            <label htmlFor="cashReceived" className="block text-sm font-medium text-gray-700 mb-1">
              Jumlah Uang Diterima (Rp)
            </label>
            <input
              id="cashReceived"
              type="number"
              min={effectiveTotal}
              step={1000}
              value={cashReceived}
              onChange={(e) => { setCashReceived(e.target.value); setCashError(""); }}
              placeholder={`Min. ${formatRupiah(effectiveTotal)}`}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {cashReceivedNum > 0 && (
            <div className={`rounded-lg p-3 text-sm ${
              computedChange !== null
                ? "bg-green-50 border border-green-200"
                : "bg-red-50 border border-red-200"
            }`}>
              {computedChange !== null ? (
                <div className="flex justify-between font-semibold text-green-800">
                  <span>Kembalian</span>
                  <span>{formatRupiah(computedChange)}</span>
                </div>
              ) : (
                <p className="text-red-700">
                  Kurang {formatRupiah(effectiveTotal - cashReceivedNum)}
                </p>
              )}
            </div>
          )}

          {cashError && (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {cashError}
            </div>
          )}

          <button
            onClick={handleCashPayment}
            disabled={isPending || computedChange === null}
            aria-busy={isPending}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? "Memproses..." : "Konfirmasi Pembayaran Cash"}
          </button>
        </div>
      )}

      {/* ── QRIS tab ── */}
      {activeTab === "QRIS" && (
        <div className="space-y-4">
          {qrisLoading && (
            <div className="flex flex-col items-center gap-3 py-8 text-gray-500">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Membuat kode QRIS...</p>
            </div>
          )}

          {qrisError && (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {qrisError}
            </div>
          )}

          {qrisData && !qrisLoading && (
            <div className="flex flex-col items-center gap-4">
              <div className={`w-full p-4 border-2 rounded-xl text-center ${isQrisExpired ? "border-red-300 opacity-50" : "border-gray-200"}`}>
                <p className="text-xs text-gray-400 mb-2">Kode Pembayaran QRIS</p>
                <p className="font-mono text-sm font-bold text-gray-800 break-all">{qrisData.qrisCode}</p>
                {hasDiscount && (
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Total: {formatRupiah(effectiveTotal)}
                    {" "}(hemat {formatRupiah(discountTotal)})
                  </p>
                )}
              </div>

              <div className={`text-center ${isQrisExpired ? "text-red-600" : timeLeft <= 60 ? "text-orange-600" : "text-gray-600"}`}>
                {isQrisExpired ? (
                  <p className="text-sm font-semibold">Kode QRIS sudah kedaluwarsa</p>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 mb-1">Berlaku selama</p>
                    <p className="text-2xl font-mono font-bold">{formatTimeLeft(timeLeft)}</p>
                  </>
                )}
              </div>

              <button
                onClick={handleGenerateQRIS}
                disabled={qrisLoading}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
              >
                🔄 Buat Ulang Kode QR
              </button>

              {!isQrisExpired && (
                <p className="text-xs text-gray-400 text-center">
                  Tunjukkan kode ini kepada pelanggan.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── DEBT tab ── */}
      {activeTab === "DEBT" && (
        <div className="space-y-4">
          {!currentOrder.customerName?.trim() ? (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-300 px-4 py-3 flex items-start gap-3">
              <span className="text-xl flex-shrink-0">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-red-800">Nama Pelanggan Belum Diisi</p>
                <p className="text-xs text-red-700 mt-0.5">
                  Kembali ke halaman POS dan isi nama pelanggan terlebih dahulu.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-orange-50 border border-orange-200 px-4 py-3 flex items-center gap-3">
              <span className="text-xl">📋</span>
              <div>
                <p className="text-sm font-semibold text-orange-800">
                  Utang atas nama: {currentOrder.customerName}
                </p>
                <p className="text-xs text-orange-700 mt-0.5">
                  Total: {formatRupiah(effectiveTotal)}
                  {hasDiscount && ` (hemat ${formatRupiah(discountTotal)})`}
                </p>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="debtDueDate" className="block text-sm font-medium text-gray-700 mb-1">
              Jatuh Tempo <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <input
              id="debtDueDate"
              type="date"
              value={debtDueDate}
              onChange={(e) => setDebtDueDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              disabled={!currentOrder.customerName?.trim()}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="debtNote" className="block text-sm font-medium text-gray-700 mb-1">
              Catatan <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <textarea
              id="debtNote"
              rows={2}
              value={debtNote}
              onChange={(e) => setDebtNote(e.target.value)}
              disabled={!currentOrder.customerName?.trim()}
              placeholder="Contoh: Lunas akhir bulan, nomor HP 08xx..."
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>

          {debtError && (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {debtError}
            </div>
          )}

          <button
            onClick={handleDebtPayment}
            disabled={debtSubmitting || !currentOrder.customerName?.trim()}
            className="w-full rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {debtSubmitting
              ? "Menyimpan..."
              : !currentOrder.customerName?.trim()
              ? "Isi Nama Pelanggan Dulu"
              : "📋 Catat sebagai Utang"}
          </button>
        </div>
      )}
    </div>
  );
}
