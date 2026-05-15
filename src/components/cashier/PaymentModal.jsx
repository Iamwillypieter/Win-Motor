"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatRupiah } from "@/lib/utils";
import { playNotificationSound } from "@/components/shared/SoundNotification";

/**
 * PaymentModal — Client Component for processing Cash or QRIS payments.
 *
 * Features:
 *  - Tab toggle: CASH vs QRIS
 *  - CASH: input for amount received, real-time change calculation
 *  - QRIS: QR code display, 5-minute countdown timer, refresh button
 *  - After success: invoice summary display
 *  - Shows "Pesanan Belum Siap" warning if orderStatus !== "ready"
 *
 * @param {{ order: Object, cashierName: string }} props
 */
export default function PaymentModal({ order: initialOrder, cashierName }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("CASH");
  const [isPending, startTransition] = useTransition();
  const [currentOrder, setCurrentOrder] = useState(initialOrder);

  // Subscribe to SSE events for real-time order status updates
  // Replaces the previous 3-second polling approach
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    if (currentOrder.orderStatus === "ready" || currentOrder.orderStatus === "completed") return;

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
      } catch {
        // ignore parse errors
      }
    };

    return () => es.close();
  }, [currentOrder._id, currentOrder.orderStatus]);

  // CASH state
  const [cashReceived, setCashReceived] = useState("");
  const [cashError, setCashError] = useState("");

  // QRIS state
  const [qrisData, setQrisData] = useState(null);
  const [qrisLoading, setQrisLoading] = useState(false);
  const [qrisError, setQrisError] = useState("");
  const [timeLeft, setTimeLeft] = useState(0); // seconds remaining

  // Success state
  const [invoice, setInvoice] = useState(null);
  const [changeAmount, setChangeAmount] = useState(null);

  // Computed change for CASH
  const cashReceivedNum = parseInt(cashReceived, 10) || 0;
  const computedChange = cashReceivedNum >= currentOrder.totalAmount
    ? cashReceivedNum - currentOrder.totalAmount
    : null;

  const isOrderReady = currentOrder.orderStatus === "ready";

  // ─── QRIS countdown timer ───────────────────────────────────────────────────
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

  const formatTimeLeft = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const isQrisExpired = qrisData && timeLeft === 0;

  // ─── Generate QRIS ──────────────────────────────────────────────────────────
  const handleGenerateQRIS = useCallback(async () => {
    setQrisLoading(true);
    setQrisError("");
    setQrisData(null);

    try {
      const res = await fetch(`/api/orders/${currentOrder._id}/qris`, {
        method: "POST",
      });
      const result = await res.json();

      if (!res.ok) {
        setQrisError(result.error?.message || "Gagal membuat kode QRIS");
        return;
      }

      setQrisData(result.data);
    } catch {
      setQrisError("Gagal terhubung ke server");
    } finally {
      setQrisLoading(false);
    }
  }, [currentOrder._id]);

  // Auto-generate QRIS when switching to QRIS tab
  useEffect(() => {
    if (activeTab === "QRIS" && !qrisData && !qrisLoading) {
      handleGenerateQRIS();
    }
  }, [activeTab, qrisData, qrisLoading, handleGenerateQRIS]);

  // ─── Confirm Cash Payment ───────────────────────────────────────────────────
  const handleCashPayment = () => {
    setCashError("");

    if (!isOrderReady) {
      setCashError("Pesanan belum siap. Tunggu konfirmasi dari staf gudang.");
      return;
    }

    const amount = parseInt(cashReceived, 10);

    if (!cashReceived || isNaN(amount)) {
      setCashError("Masukkan jumlah uang yang diterima");
      return;
    }

    if (amount < currentOrder.totalAmount) {
      setCashError(
        `Uang yang diterima kurang. Minimal ${formatRupiah(currentOrder.totalAmount)}`
      );
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/orders/${currentOrder._id}/payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cashReceived: amount }),
        });

        const result = await res.json();

        if (!res.ok) {
          setCashError(result.error?.message || "Pembayaran gagal");
          return;
        }

        setInvoice(result.data.invoice);
        setChangeAmount(result.data.changeAmount);
        // Mainkan suara pembayaran berhasil
        playNotificationSound("payment_success");
      } catch {
        setCashError("Gagal terhubung ke server");
      }
    });
  };

  // ─── Invoice Summary (success state) ───────────────────────────────────────
  if (invoice) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg mx-auto">
        {/* Success header */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl">
            ✓
          </div>
          <h2 className="text-xl font-bold text-gray-900">Pembayaran Berhasil!</h2>
          <p className="text-sm text-gray-500">
            {invoice.paymentMethod === "CASH" ? "Tunai" : "QRIS"}
          </p>
        </div>

        {/* Invoice details */}
        <div className="border border-gray-200 rounded-lg p-4 space-y-3 mb-4">
          {currentOrder.customerName && (
            <div className="text-center pb-2 border-b border-gray-100">
              <p className="font-bold text-gray-900 text-base">{currentOrder.customerName}</p>
              <p className="text-xs text-gray-400">Pelanggan</p>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">No. Invoice</span>
            <span className="font-mono font-semibold text-blue-600">
              {invoice.invoiceNumber}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Kasir</span>
            <span className="font-medium">{invoice.cashierName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Waktu</span>
            <span className="font-medium">
              {new Date(invoice.transactionAt).toLocaleString("id-ID")}
            </span>
          </div>

          {/* Items */}
          <div className="border-t border-gray-100 pt-3 space-y-1">
            {invoice.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-gray-700">
                  {item.productName}{" "}
                  <span className="text-gray-400">×{item.quantity}</span>
                </span>
                <span className="font-medium">{formatRupiah(item.subtotal)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-200 pt-3 space-y-1">
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatRupiah(invoice.totalAmount)}</span>
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

  // ─── Payment form ───────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg mx-auto">
      {/* Order summary */}
      <div className="mb-6">
        {currentOrder.customerName && (
          <p className="text-center font-bold text-gray-900 text-lg mb-2">
            {currentOrder.customerName}
          </p>
        )}
        <h2 className="text-lg font-bold text-gray-900 mb-1">
          Konfirmasi Pembayaran
        </h2>
        <p className="text-sm text-gray-500">Invoice: {currentOrder.invoiceNumber}</p>
      </div>

      {/* Order status banner */}
      {!isOrderReady ? (
        <div
          role="alert"
          className="mb-6 rounded-lg bg-yellow-50 border border-yellow-300 px-4 py-3 flex items-center gap-3"
        >
          <span className="text-xl">⏳</span>
          <div>
            <p className="text-sm font-semibold text-yellow-800">Pesanan Belum Siap</p>
            <p className="text-xs text-yellow-700 mt-0.5">
              Menunggu staf gudang menandai pesanan sebagai siap. Halaman ini akan otomatis diperbarui.
            </p>
          </div>
        </div>
      ) : (
        <div
          role="status"
          className="mb-6 rounded-lg bg-green-50 border border-green-300 px-4 py-3 flex items-center gap-3"
        >
          <span className="text-xl">✅</span>
          <p className="text-sm font-semibold text-green-800">Pesanan Siap — Silakan proses pembayaran</p>
        </div>
      )}

      {/* Items summary */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
        {currentOrder.items.map((item, idx) => (
          <div key={idx} className="flex justify-between text-sm">
            <span className="text-gray-700">
              {item.productName}{" "}
              <span className="text-gray-400">×{item.quantity}</span>
            </span>
            <span className="font-medium">
              {formatRupiah(item.unitPrice * item.quantity)}
            </span>
          </div>
        ))}
        <div className="border-t border-gray-200 pt-2 flex justify-between font-bold">
          <span>Total</span>
          <span className="text-blue-600">{formatRupiah(currentOrder.totalAmount)}</span>
        </div>
      </div>

      {/* Payment method tabs */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-6">
        <button
          onClick={() => setActiveTab("CASH")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors focus:outline-none ${
            activeTab === "CASH"
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          💵 Tunai (Cash)
        </button>
        <button
          onClick={() => setActiveTab("QRIS")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors focus:outline-none ${
            activeTab === "QRIS"
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          📱 QRIS
        </button>
      </div>

      {/* ── CASH tab ── */}
      {activeTab === "CASH" && (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="cashReceived"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Jumlah Uang Diterima (Rp)
            </label>
            <input
              id="cashReceived"
              type="number"
              min={currentOrder.totalAmount}
              step={1000}
              value={cashReceived}
              onChange={(e) => {
                setCashReceived(e.target.value);
                setCashError("");
              }}
              disabled={!isOrderReady}
              placeholder={`Min. ${formatRupiah(currentOrder.totalAmount)}`}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>

          {/* Real-time change display */}
          {cashReceivedNum > 0 && (
            <div
              className={`rounded-lg p-3 text-sm ${
                computedChange !== null
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              {computedChange !== null ? (
                <div className="flex justify-between font-semibold text-green-800">
                  <span>Kembalian</span>
                  <span>{formatRupiah(computedChange)}</span>
                </div>
              ) : (
                <p className="text-red-700">
                  Kurang {formatRupiah(currentOrder.totalAmount - cashReceivedNum)}
                </p>
              )}
            </div>
          )}

          {cashError && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700"
            >
              {cashError}
            </div>
          )}

          <button
            onClick={handleCashPayment}
            disabled={isPending || computedChange === null || !isOrderReady}
            aria-busy={isPending}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? "Memproses..." : !isOrderReady ? "Menunggu Pesanan Siap..." : "Konfirmasi Pembayaran Cash"}
          </button>
        </div>
      )}

      {/* ── QRIS tab ── */}
      {activeTab === "QRIS" && (
        <div className="space-y-4">
          {!isOrderReady && (
            <div className="flex flex-col items-center gap-3 py-6 text-yellow-700 bg-yellow-50 rounded-lg border border-yellow-200">
              <span className="text-3xl">⏳</span>
              <p className="text-sm font-medium">Menunggu pesanan siap dari gudang</p>
            </div>
          )}

          {isOrderReady && qrisLoading && (
            <div className="flex flex-col items-center gap-3 py-8 text-gray-500">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Membuat kode QRIS...</p>
            </div>
          )}

          {isOrderReady && qrisError && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700"
            >
              {qrisError}
            </div>
          )}

          {isOrderReady && qrisData && !qrisLoading && (
            <div className="flex flex-col items-center gap-4">
              {/* QR Code — tampilkan sebagai teks kode karena tidak ada payment gateway sungguhan */}
              <div
                className={`w-full p-4 border-2 rounded-xl text-center ${
                  isQrisExpired ? "border-red-300 opacity-50" : "border-gray-200"
                }`}
              >
                <p className="text-xs text-gray-400 mb-2">Kode Pembayaran QRIS</p>
                <p className="font-mono text-sm font-bold text-gray-800 break-all">
                  {qrisData.qrisCode}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  (Dalam produksi, ini akan ditampilkan sebagai QR Code)
                </p>
              </div>

              {/* Countdown timer */}
              <div
                className={`text-center ${
                  isQrisExpired ? "text-red-600" : timeLeft <= 60 ? "text-orange-600" : "text-gray-600"
                }`}
              >
                {isQrisExpired ? (
                  <p className="text-sm font-semibold">Kode QRIS sudah kedaluwarsa</p>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 mb-1">Berlaku selama</p>
                    <p className="text-2xl font-mono font-bold">
                      {formatTimeLeft(timeLeft)}
                    </p>
                  </>
                )}
              </div>

              {/* Refresh button */}
              <button
                onClick={handleGenerateQRIS}
                disabled={qrisLoading}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
              >
                🔄 Buat Ulang Kode QR
              </button>

              {!isQrisExpired && (
                <p className="text-xs text-gray-400 text-center">
                  Tunjukkan kode ini kepada pelanggan. Pembayaran akan dikonfirmasi secara otomatis.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
