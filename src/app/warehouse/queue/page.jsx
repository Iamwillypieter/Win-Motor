import { auth } from "@/lib/auth";
import OrderQueueList from "@/components/warehouse/OrderQueueList";

export const metadata = {
  title: "Antrean Gudang",
};

/**
 * WarehouseQueuePage — real-time order queue for Warehouse staff.
 *
 * This is a Server Component that renders the page shell.
 * The real-time queue is handled by the client-side `OrderQueueList` component
 * which uses SSE via `useOrderQueue` hook.
 */
export default async function WarehouseQueuePage() {
  const session = await auth();

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Real-time queue — client component */}
        <OrderQueueList />
      </div>
    </main>
  );
}
