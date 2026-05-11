import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import Invoice from "@/models/Invoice";
import Order from "@/models/Order";
import InvoicePrint from "@/components/shared/InvoicePrint";
import PrintButton from "@/components/shared/PrintButton";
import Link from "next/link";

export const metadata = {
  title: "Invoice — Kasir",
};

/**
 * InvoicePage — halaman invoice yang bisa dicetak.
 * Dapat diakses dari halaman pesanan aktif setelah transaksi selesai.
 */
export default async function InvoicePage({ params }) {
  await auth();

  let invoice = null;

  try {
    await connectDB();
    const doc = await Invoice.findOne({ orderId: params.orderId }).lean();

    if (!doc) notFound();

    // Ambil customerName dari Order karena Invoice tidak menyimpannya
    const order = await Order.findById(params.orderId).select("customerName").lean();

    invoice = {
      ...doc,
      _id: doc._id.toString(),
      orderId: doc.orderId.toString(),
      customerName: order?.customerName ?? null,
      transactionAt: doc.transactionAt?.toISOString() ?? null,
      createdAt: doc.createdAt?.toISOString() ?? null,
      items: doc.items.map((item) => ({
        ...item,
        _id: item._id?.toString(),
      })),
    };
  } catch (err) {
    throw err;
  }

  return (
    <>
      {/* Toolbar — hanya tampil di layar, tidak ikut tercetak */}
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <Link
          href="/cashier/orders"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Kembali ke Pesanan
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 font-mono">
            {invoice.invoiceNumber}
          </span>
          <PrintButton />
        </div>
      </div>

      {/* Invoice content */}
      <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
        <InvoicePrint invoice={invoice} />
      </div>
    </>
  );
}
