import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import PaymentModal from "@/components/cashier/PaymentModal";

export const metadata = {
  title: "Pembayaran — Kasir",
};

/**
 * PaymentPage — Server Component for the payment page.
 * Fetches order details and renders the PaymentModal.
 * Redirects to cashier home after payment is completed.
 */
export default async function PaymentPage({ params }) {
  const session = await auth();
  const { orderId } = params;

  let order = null;

  try {
    await connectDB();
    const orderDoc = await Order.findById(orderId).lean();

    if (!orderDoc) {
      notFound();
    }

    // Redirect if already paid or cancelled
    if (orderDoc.paymentStatus === "paid" || orderDoc.orderStatus === "completed") {
      redirect("/cashier");
    }

    // Serialize MongoDB document
    order = {
      ...orderDoc,
      _id: orderDoc._id.toString(),
      cashierId: orderDoc.cashierId?.toString() ?? null,
      customerName: orderDoc.customerName ?? null,
      items: orderDoc.items.map((item) => ({
        ...item,
        _id: item._id?.toString(),
        productId: item.productId?.toString(),
      })),
      createdAt: orderDoc.createdAt?.toISOString() ?? null,
      updatedAt: orderDoc.updatedAt?.toISOString() ?? null,
      completedAt: orderDoc.completedAt?.toISOString() ?? null,
      qrisExpiresAt: orderDoc.qrisExpiresAt?.toISOString() ?? null,
    };
  } catch (err) {
    // notFound() and redirect() throw special errors — rethrow them
    throw err;
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Pembayaran</h1>
            <p className="text-sm text-gray-500">
              Invoice: {order.invoiceNumber}
            </p>
            {order.customerName && (
              <p className="text-base font-bold text-gray-900 text-center mt-1">
                {order.customerName}
              </p>
            )}
          </div>
          <a
            href="/cashier"
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            ← Kembali ke POS
          </a>
        </div>
      </div>

      {/* Payment modal content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <PaymentModal order={order} cashierName={session?.user?.name ?? "Kasir"} />
      </div>
    </main>
  );
}
