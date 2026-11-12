"use client";

/**
 * ReturnPage — halaman retur barang kasir.
 *
 * Alur penggunaan:
 * 1. Kasir scan barcode / input manual SKU → produk muncul di tabel item
 * 2. Kasir atur jumlah & alasan per item
 * 3. Pilih metode refund dan isi catatan (opsional)
 * 4. Submit → stok otomatis dikembalikan + nomor retur digenerate
 */

import { useState, useCallback, useRef } from "react";
import BarcodeScanner from "@/components/ui/BarcodeScanner";
import {
  RotateCcw,
  PackageSearch,
  Trash2,
  Plus,
  Minus,
  CheckCircle,
  AlertCircle,
  X,
  ClipboardList,
} from "lucide-react";

// Label metode refund
const REFUND_METHOD_LABELS = {
  CASH: "Uang Tunai",
  CREDIT: "Kredit Toko",
  EXCHANGE: "Tukar Produk",
};

/**
 * Format angka ke rupiah.
 * @param {number} amount
 * @returns {string}
 */
function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default function ReturnPage() {
  // ── State item retur ─────────────────────────────────────────────────────────
  const [returnItems, setReturnItems] = useState([]); // [{ product, quantity, reason }]

  // ── State form ───────────────────────────────────────────────────────────────
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [note, setNote] = useState("");
  const [orderRef, setOrderRef] = useState(""); // nomor invoice referensi (opsional)

  // ── State UI ─────────────────────────────────────────────────────────────────
  const [scanMode, setScanMode] = useState(false); // tampilkan kamera scanner
  const [manualSku, setManualSku] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [successResult, setSuccessResult] = useState(null); // return doc setelah sukses

  const manualInputRef = useRef(null);

  // ── Lookup produk via API ────────────────────────────────────────────────────
  const lookupProduct = useCallback(async (sku) => {
    if (!sku.trim()) return;

    setLookupLoading(true);
    setLookupError("");

    try {
      const res = await fetch(`/api/returns/lookup?sku=${encodeURIComponent(sku.trim())}`);
      const json = await res.json();

      if (!res.ok) {
        setLookupError(json.error?.message ?? "Produk tidak ditemukan");
        return;
      }

      const product = json.data;

      // Cek apakah produk sudah ada di daftar retur
      setReturnItems((prev) => {
        const existing = prev.find((it) => it.product._id === product._id);
        if (existing) {
          // Tambah quantity
          return prev.map((it) =>
            it.product._id === product._id
              ? { ...it, quantity: it.quantity + 1 }
              : it
          );
        }
        return [...prev, { product, quantity: 1, reason: "" }];
      });
    } catch {
      setLookupError("Gagal menghubungi server. Coba lagi.");
    } finally {
      setLookupLoading(false);
    }
  }, []);

  // ── Handler scan barcode ─────────────────────────────────────────────────────
  const handleScan = useCallback(
    async (value) => {
      setScanMode(false); // tutup kamera setelah scan
      await lookupProduct(value);
    },
    [lookupProduct]
  );

  // ── Handler input manual SKU ─────────────────────────────────────────────────
  const handleManualSearch = async (e) => {
    e.preventDefault();
    await lookupProduct(manualSku);
    setManualSku("");
    manualInputRef.current?.focus();
  };

  // ── Ubah quantity item ───────────────────────────────────────────────────────
  const setQuantity = (productId, qty) => {
    if (qty < 1) return;
    setReturnItems((prev) =>
      prev.map((it) =>
        it.product._id === productId ? { ...it, quantity: qty } : it
      )
    );
  };

  // ── Ubah alasan item ─────────────────────────────────────────────────────────
  const setItemReason = (productId, reason) => {
    setReturnItems((prev) =>
      prev.map((it) =>
        it.product._id === productId ? { ...it, reason } : it
      )
    );
  };

  // ── Hapus item dari daftar ───────────────────────────────────────────────────
  const removeItem = (productId) => {
    setReturnItems((prev) => prev.filter((it) => it.product._id !== productId));
  };

  // ── Hitung total ─────────────────────────────────────────────────────────────
  const totalAmount = returnItems.reduce(
    (sum, it) => sum + it.product.price * it.quantity,
    0
  );

  // ── Submit retur ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (returnItems.length === 0) {
      setSubmitError("Tambahkan minimal satu produk sebelum submit.");
      return;
    }

    setSubmitLoading(true);
    setSubmitError("");

    try {
      const payload = {
        items: returnItems.map((it) => ({
          productId: it.product._id,
          quantity: it.quantity,
          reason: it.reason || undefined,
        })),
        refundMethod,
        note: note || undefined,
        orderId: undefined, // akan dicari berdasarkan orderRef jika ada
      };

      // Jika kasir mengisi referensi invoice, kirim sebagai catatan nomor —
      // lookup orderId dilakukan di sisi server melalui invoiceNumber nanti.
      // Untuk MVP saat ini, note sudah cukup menyimpan referensi.
      if (orderRef.trim()) {
        payload.note = [note, `Ref: ${orderRef.trim()}`]
          .filter(Boolean)
          .join(" | ");
      }

      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setSubmitError(json.error?.message ?? "Gagal menyimpan retur.");
        return;
      }

      setSuccessResult(json.data);
      // Reset form
      setReturnItems([]);
      setNote("");
      setOrderRef("");
      setRefundMethod("CASH");
    } catch {
      setSubmitError("Gagal menghubungi server. Periksa koneksi dan coba lagi.");
    } finally {
      setSubmitLoading(false);
    }
  };

  // ── Mulai retur baru setelah sukses ─────────────────────────────────────────
  const handleNewReturn = () => {
    setSuccessResult(null);
    setSubmitError("");
    setLookupError("");
  };

  // ── Render: sukses ───────────────────────────────────────────────────────────
  if (successResult) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-12 text-center">
        <div className="rounded-full bg-green-100 p-4 mb-4">
          <CheckCircle className="h-12 w-12 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Retur Berhasil Dicatat</h2>
        <p className="text-gray-500 mb-2">
          Stok produk telah dikembalikan ke inventori.
        </p>
        <p className="font-mono text-sm text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg mb-6">
          {successResult.returnNumber}
        </p>

        {/* Ringkasan */}
        <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-left mb-6">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Ringkasan Retur</p>
          <div className="space-y-1.5">
            {successResult.items.map((item) => (
              <div key={item._id} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.productName} ×{item.quantity}</span>
                <span className="text-gray-900 font-medium">
                  {formatRupiah(item.subtotal)}
                </span>
              </div>
            ))}
            <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between text-sm font-semibold">
              <span>Total Retur</span>
              <span>{formatRupiah(successResult.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>Metode Refund</span>
              <span>{REFUND_METHOD_LABELS[successResult.refundMethod]}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleNewReturn}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Buat Retur Baru
        </button>
      </div>
    );
  }

  // ── Render: form retur ───────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-orange-100 p-2">
          <RotateCcw className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Retur Barang</h1>
          <p className="text-sm text-gray-500">
            Scan atau cari SKU produk yang dikembalikan
          </p>
        </div>
      </div>

      {/* Scanner kamera */}
      {scanMode ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">Scan Barcode Produk</p>
            <button
              onClick={() => setScanMode(false)}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Tutup scanner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <BarcodeScanner onScan={handleScan} onStop={() => setScanMode(false)} autoStart />
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Tambah Produk</p>
          <div className="flex gap-2">
            {/* Tombol scan kamera */}
            <button
              type="button"
              onClick={() => {
                setLookupError("");
                setScanMode(true);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap"
            >
              <PackageSearch className="h-4 w-4" />
              Scan
            </button>

            {/* Input manual SKU */}
            <form onSubmit={handleManualSearch} className="flex flex-1 gap-2">
              <input
                ref={manualInputRef}
                type="text"
                value={manualSku}
                onChange={(e) => setManualSku(e.target.value)}
                placeholder="Ketik SKU produk…"
                disabled={lookupLoading}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={lookupLoading || !manualSku.trim()}
                className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-40 whitespace-nowrap"
              >
                {lookupLoading ? "…" : "Cari"}
              </button>
            </form>
          </div>

          {/* Error lookup */}
          {lookupError && (
            <div className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {lookupError}
            </div>
          )}
        </div>
      )}

      {/* Daftar item retur */}
      {returnItems.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-700">
              Item Retur ({returnItems.length})
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {returnItems.map(({ product, quantity, reason }) => (
              <div key={product._id} className="p-4 space-y-3">
                {/* Baris produk */}
                <div className="flex items-start gap-3">
                  {/* Gambar produk (opsional) */}
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="h-12 w-12 rounded-lg object-cover flex-shrink-0 border border-gray-200"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <PackageSearch className="h-5 w-5 text-gray-400" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{product.sku}</p>
                    <p className="text-xs text-gray-500">{formatRupiah(product.price)} / pcs</p>
                  </div>

                  {/* Kontrol quantity */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => setQuantity(product._id, quantity - 1)}
                      disabled={quantity <= 1}
                      className="rounded-md border border-gray-300 p-1 hover:bg-gray-50 disabled:opacity-30 focus:outline-none focus:ring-1 focus:ring-gray-400"
                      aria-label="Kurang"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm font-medium tabular-nums">
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity(product._id, quantity + 1)}
                      className="rounded-md border border-gray-300 p-1 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-gray-400"
                      aria-label="Tambah"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>

                    {/* Hapus item */}
                    <button
                      onClick={() => removeItem(product._id)}
                      className="ml-1 rounded-md p-1 text-red-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-1 focus:ring-red-400"
                      aria-label="Hapus item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Subtotal + alasan */}
                <div className="flex items-center gap-3 pl-15">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setItemReason(product._id, e.target.value)}
                      placeholder="Alasan retur (opsional)…"
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                  <p className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                    {formatRupiah(product.price * quantity)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">Total Nilai Retur</span>
            <span className="text-base font-bold text-gray-900">{formatRupiah(totalAmount)}</span>
          </div>
        </div>
      )}

      {/* Metode refund + catatan */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 space-y-4">
        <p className="text-sm font-medium text-gray-700">Detail Retur</p>

        {/* Metode refund */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Metode Refund</label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(REFUND_METHOD_LABELS).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRefundMethod(value)}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  refundMethod === value
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Referensi invoice (opsional) */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">
            No. Invoice Asli <span className="text-gray-400">(opsional)</span>
          </label>
          <input
            type="text"
            value={orderRef}
            onChange={(e) => setOrderRef(e.target.value)}
            placeholder="Contoh: INV-20261111-0001"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Catatan */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">
            Catatan <span className="text-gray-400">(opsional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan tambahan untuk transaksi retur ini…"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm resize-none focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Error submit */}
      {submitError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{submitError}</p>
        </div>
      )}

      {/* Tombol submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitLoading || returnItems.length === 0}
        className="w-full rounded-xl bg-orange-500 px-6 py-3.5 text-sm font-semibold text-white hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
      >
        {submitLoading ? (
          <>
            <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            Memproses…
          </>
        ) : (
          <>
            <ClipboardList className="h-4 w-4" />
            Simpan Retur
            {returnItems.length > 0 && ` (${formatRupiah(totalAmount)})`}
          </>
        )}
      </button>

      {/* Pesan kosong */}
      {returnItems.length === 0 && !scanMode && (
        <p className="text-center text-sm text-gray-400 pb-6">
          Belum ada produk ditambahkan. Scan barcode atau ketik SKU di atas.
        </p>
      )}
    </div>
  );
}
