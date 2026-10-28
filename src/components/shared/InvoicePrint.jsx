"use client";

import { formatRupiah } from "@/lib/utils";

const PAYMENT_METHOD_LABEL = {
  CASH: "Tunai",
  QRIS: "QRIS",
  EWALLET_DANA: "DANA",
  EWALLET_OVO: "OVO",
  EWALLET_GOPAY: "GoPay",
  BANK_TRANSFER: "Transfer Bank",
  DEBT: "Piutang",
};

/**
 * InvoicePrint — komponen invoice yang dioptimalkan untuk printer thermal 58mm / 80mm.
 *
 * @param {{ invoice: Object, paperWidth?: "58mm" | "80mm" }} props
 */
export default function InvoicePrint({ invoice, paperWidth = "80mm" }) {
  if (!invoice) return null;

  const is58mm = paperWidth === "58mm";

  const transactionDate = invoice.transactionAt
    ? new Date(invoice.transactionAt).toLocaleString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  const methodLabel =
    PAYMENT_METHOD_LABEL[invoice.paymentMethod] ?? invoice.paymentMethod;

  // Compact char separator matching paper width
  const divider = is58mm
    ? "--------------------------------"
    : "------------------------------------------------";

  return (
    <div
      className={`thermal-receipt font-mono bg-white mx-auto text-black ${
        is58mm ? "w-[58mm] text-[10px]" : "w-[80mm] text-[11px]"
      }`}
      data-paper={paperWidth}
    >
      {/* ── Header toko ── */}
      <div className="text-center mb-1">
        <p className="font-bold text-[13px] tracking-widest uppercase">TOKO POS</p>
        <p className="text-[9px] mt-0.5">Sistem Point of Sale</p>
      </div>

      <p className="text-center leading-none">{divider}</p>

      {/* ── Nama pelanggan (opsional) ── */}
      {invoice.customerName && (
        <>
          <div className="text-center my-1">
            <p className="font-bold uppercase">{invoice.customerName}</p>
            {invoice.shippingAddress && (
              <p className="text-[9px] whitespace-pre-wrap">{invoice.shippingAddress}</p>
            )}
          </div>
          <p className="text-center leading-none">{divider}</p>
        </>
      )}

      {/* ── Info transaksi ── */}
      <div className="my-1 space-y-0.5">
        <div className="flex justify-between gap-1">
          <span className="shrink-0">No.</span>
          <span className="text-right font-bold truncate">{invoice.invoiceNumber}</span>
        </div>
        <div className="flex justify-between gap-1">
          <span className="shrink-0">Tgl</span>
          <span className="text-right">{transactionDate}</span>
        </div>
        <div className="flex justify-between gap-1">
          <span className="shrink-0">Kasir</span>
          <span className="text-right truncate">{invoice.cashierName}</span>
        </div>
        <div className="flex justify-between gap-1">
          <span className="shrink-0">Bayar</span>
          <span className="text-right">{methodLabel}</span>
        </div>
        {invoice.orderType === "ONLINE" && (
          <div className="flex justify-between gap-1">
            <span className="shrink-0">Tipe</span>
            <span className="text-right">Online</span>
          </div>
        )}
      </div>

      <p className="text-center leading-none">{divider}</p>

      {/* ── Detail item ── */}
      <div className="my-1 space-y-1">
        {invoice.items.map((item, idx) => (
          <div key={idx}>
            {/* Nama produk — potong jika terlalu panjang */}
            <p className="font-medium leading-tight break-words">{item.productName}</p>
            <div className="flex justify-between pl-1">
              <span className="text-[9px]">
                {item.quantity} x {formatRupiah(item.unitPrice)}
                {item.discountPercent > 0 ? ` (-${item.discountPercent}%)` : ""}
              </span>
              <span className="font-semibold">{formatRupiah(item.subtotal)}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center leading-none">{divider}</p>

      {/* ── Ringkasan harga ── */}
      <div className="my-1 space-y-0.5">
        {invoice.discountTotal > 0 && (
          <div className="flex justify-between">
            <span>Diskon</span>
            <span>- {formatRupiah(invoice.discountTotal)}</span>
          </div>
        )}

        <div className="flex justify-between font-bold">
          <span>TOTAL</span>
          <span>{formatRupiah(invoice.totalAmount)}</span>
        </div>

        {invoice.paymentMethod === "CASH" && (
          <>
            <div className="flex justify-between">
              <span>Tunai</span>
              <span>{formatRupiah(invoice.cashReceived)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Kembali</span>
              <span>{formatRupiah(invoice.changeAmount)}</span>
            </div>
          </>
        )}
      </div>

      <p className="text-center leading-none">{divider}</p>

      {/* ── Footer ── */}
      <div className="text-center my-1 space-y-0.5 text-[9px]">
        <p>Terima kasih atas kunjungan Anda!</p>
        <p>Barang yg sudah dibeli tidak dapat</p>
        <p>dikembalikan.</p>
      </div>

      {/* Ekstra whitespace di bawah agar kertas bisa dipotong */}
      <div className="h-8" />
    </div>
  );
}
