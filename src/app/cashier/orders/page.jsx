import { auth } from "@/lib/auth";
import CashierOrderList from "@/components/cashier/CashierOrderList";

export const metadata = {
  title: "Pesanan Aktif — Kasir",
};

/**
 * CashierOrdersPage — shows the cashier's active orders with real-time status.
 *
 * This is a Server Component that renders the page shell.
 * The real-time order list is handled by the client-side `CashierOrderList`
 * component which uses SSE to receive status updates.
 */
export default async function CashierOrdersPage() {
  const session = await auth();

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Order list — client component with real-time updates */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        <CashierOrderList cashierId={session?.user?.id} />
      </div>
    </main>
  );
}
