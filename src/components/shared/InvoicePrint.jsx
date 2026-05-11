"use client";

import { formatRupiah } from "@/lib/utils";

/**
 * InvoicePrint — komponen invoice yang dioptimalkan untuk cetak.
 * Bisa digunakan di halaman print maupun sebagai preview.
 *
 * @param {{ invoice: Object }} props
 */
export default function InvoicePrint({ invoice }) {
  if (!invoice) return null;

  const transactionDate = invoice.transactionAt
    ? new Date(invoice.transactionAt).toLocaleString("id-ID", {
        dateStyle: "long",
        timeStyle: "short",
      })
    : "-";

  return (
    <div className="invoice-print bg-white p-8 max-w-sm mx-auto font-mono text-sm">
      {/* Header toko */}
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold tracking-wide">TOKO POS</h1>
        <p className="text-xs text-gray-500 mt-1">Sistem Point of Sale</p>
        <div className="border-t-2 border-dashed border-gray-400 mt-3" />
      </div>

      {/* Nama pelanggan — di atas No. Invoice, bold, tengah */}
      {invoice.customerName && (
        <div className="text-center mb-4">
          <p className="text-base font-bold text-gray-900">{invoice.customerName}</p>
          <p className="text-xs text-gray-400">Pelanggan</p>
        </div>
      )}

      {/* Info invoice */}
      <div className="mb-4 space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-500">No. Invoice</span>
          <span className="font-bold text-blue-700">{invoice.invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Tanggal</span>
          <span>{transactionDate}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Kasir</span>
          <span>{invoice.cashierName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Metode</span>
          <span>{invoice.paymentMethod === "CASH" ? "Tunai" : "QRIS"}</span>
        </div>
      </div>

      <div className="border-t border-dashed border-gray-400 my-3" />

      {/* Items */}
      <div className="space-y-2 mb-3">
        {invoice.items.map((item, idx) => (
          <div key={idx}>
            <div className="flex justify-between">
              <span className="font-medium">{item.productName}</span>
              <span>{formatRupiah(item.subtotal)}</span>
            </div>
            <div className="text-xs text-gray-500 pl-2">
              {item.quantity} × {formatRupiah(item.unitPrice)}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t-2 border-dashed border-gray-400 my-3" />

      {/* Total */}
      <div className="space-y-1">
        <div className="flex justify-between font-bold text-base">
          <span>TOTAL</span>
          <span>{formatRupiah(invoice.totalAmount)}</span>
        </div>

        {invoice.paymentMethod === "CASH" && (
          <>
            <div className="flex justify-between text-gray-600">
              <span>Tunai</span>
              <span>{formatRupiah(invoice.cashReceived)}</span>
            </div>
            <div className="flex justify-between font-semibold text-green-700">
              <span>Kembalian</span>
              <span>{formatRupiah(invoice.changeAmount)}</span>
            </div>
          </>
        )}
      </div>

      <div className="border-t-2 border-dashed border-gray-400 mt-4 mb-4" />

      {/* Footer */}
      <div className="text-center text-xs text-gray-500 space-y-1">
        <p>Terima kasih atas kunjungan Anda!</p>
        <p>Barang yang sudah dibeli tidak dapat dikembalikan.</p>
      </div>
    </div>
  );
}
