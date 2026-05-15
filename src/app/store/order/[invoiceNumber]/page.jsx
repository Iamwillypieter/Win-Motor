import connectDB from "@/lib/db";
import Order from "@/models/Order";
import OrderConfirmation from "@/components/store/OrderConfirmation";

/**
 * Halaman konfirmasi pesanan online.
 *
 * Server Component yang:
 * - Fetch data pesanan dari MongoDB berdasarkan `invoiceNumber` dari URL params
 * - Serialisasi data (ObjectId dan Date ke string) sebelum dikirim ke client
 * - Render OrderConfirmation (client component) dengan data pesanan
 * - Tampilkan pesan "Pesanan tidak ditemukan" jika invoiceNumber tidak ada di DB
 *
 * Tidak memerlukan autentikasi staf — halaman ini publik untuk pelanggan.
 *
 * Requirements:
 * - 5.1: Redirect ke /store/order/[invoiceNumber] setelah pesanan berhasil dibuat
 * - 5.2: Tampilkan detail pesanan pada halaman konfirmasi
 */
export async function generateMetadata({ params }) {
  return {
    title: `Konfirmasi Pesanan ${params.invoiceNumber} — Toko Online`,
  };
}

/**
 * Fetch data pesanan dari MongoDB berdasarkan invoiceNumber.
 * Mengembalikan null jika tidak ditemukan.
 *
 * @param {string} invoiceNumber
 * @returns {Promise<object | null>}
 */
async function getOrder(invoiceNumber) {
  try {
    await connectDB();

    const doc = await Order.findOne({ invoiceNumber })
      .select(
        "_id invoiceNumber orderType orderStatus paymentStatus paymentMethod " +
        "totalAmount customerName shippingAddress items qrisCode qrisExpiresAt " +
        "sseToken bankTransferBank bankTransferAccount createdAt"
      )
      .lean();

    if (!doc) return null;

    // Serialisasi: konversi ObjectId dan Date ke string agar bisa dikirim ke Client Component
    return {
      _id: doc._id.toString(),
      invoiceNumber: doc.invoiceNumber,
      orderType: doc.orderType ?? "ONLINE",
      orderStatus: doc.orderStatus,
      paymentStatus: doc.paymentStatus,
      paymentMethod: doc.paymentMethod ?? null,
      totalAmount: doc.totalAmount,
      customerName: doc.customerName ?? null,
      shippingAddress: doc.shippingAddress ?? null,
      qrisCode: doc.qrisCode ?? null,
      qrisExpiresAt: doc.qrisExpiresAt ? doc.qrisExpiresAt.toISOString() : null,
      sseToken: doc.sseToken ?? null,
      bankTransferBank: doc.bankTransferBank ?? null,
      bankTransferAccount: doc.bankTransferAccount ?? null,
      createdAt: doc.createdAt ? doc.createdAt.toISOString() : null,
      items: (doc.items ?? []).map((item) => ({
        _id: item._id?.toString() ?? null,
        productId: item.productId?.toString() ?? null,
        productName: item.productName,
        sku: item.sku,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
    };
  } catch (err) {
    console.error(`Gagal mengambil pesanan ${invoiceNumber}:`, err);
    return null;
  }
}

export default async function OrderConfirmationPage({ params }) {
  const { invoiceNumber } = params;
  const order = await getOrder(invoiceNumber);

  // Pesanan tidak ditemukan — tampilkan pesan error yang ramah
  if (!order) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <div
          className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-4xl"
          aria-hidden="true"
        >
          🔍
        </div>
        <h1 className="text-xl font-bold text-gray-900">Pesanan Tidak Ditemukan</h1>
        <p className="text-sm text-gray-500">
          Pesanan dengan nomor{" "}
          <span className="font-mono font-semibold text-gray-700">{invoiceNumber}</span>{" "}
          tidak ditemukan di sistem kami.
        </p>
        <p className="text-xs text-gray-400">
          Pastikan nomor pesanan sudah benar, atau hubungi kami jika Anda yakin pesanan sudah dibuat.
        </p>
        <a
          href="/store"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          ← Kembali ke Katalog
        </a>
      </div>
    );
  }

  return <OrderConfirmation order={order} />;
}
