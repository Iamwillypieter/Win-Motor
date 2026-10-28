import { auth } from "@/lib/auth";
import OrderHistory from "@/components/orders/OrderHistory";

export const metadata = {
  title: "Riwayat Pesanan — Gudang",
};

/**
 * WarehouseOrderHistoryPage — halaman riwayat pesanan untuk Staf Gudang.
 *
 * Menampilkan pesanan yang sudah selesai atau dibatalkan dengan filter,
 * pagination, dan ringkasan. Server Component shell; interaksi ditangani
 * oleh komponen klien `OrderHistory`.
 */
export default async function WarehouseOrderHistoryPage() {
  const session = await auth();

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <OrderHistory title="Riwayat Pesanan" />
      </div>
    </main>
  );
}
