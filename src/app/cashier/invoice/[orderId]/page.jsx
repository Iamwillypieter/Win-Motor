import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import Invoice from "@/models/Invoice";
import Order from "@/models/Order";
import InvoicePageClient from "@/components/shared/InvoicePageClient";
import Link from "next/link";

export const metadata = {
  title: "Invoice — Kasir",
};

/**
 * InvoicePage — halaman invoice yang bisa dicetak.
 * Data di-fetch server-side; rendering dan print dihandle client component.
 */
export default async function InvoicePage({ params }) {
  await auth();

  let invoice = null;

  try {
    await connectDB();
    const doc = await Invoice.findOne({ orderId: params.orderId }).lean();

    if (!doc) notFound();

    const order = await Order.findById(params.orderId)
      .select("customerName")
      .lean();

    invoice = {
      ...doc,
      _id: doc._id.toString(),
      orderId: doc.orderId.toString(),
      customerName: order?.customerName ?? doc.customerName ?? null,
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
        <span className="text-sm text-gray-500 font-mono">
          {invoice.invoiceNumber}
        </span>
      </div>

      {/* Invoice content — client component untuk sync paper size */}
      <InvoicePageClient invoice={invoice} />
    </>
  );
}
