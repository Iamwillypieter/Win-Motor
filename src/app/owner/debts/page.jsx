import { auth } from "@/lib/auth";
import { getDebtOrders } from "@/server/services/payment.service";
import DebtList from "@/components/owner/DebtList";

export const metadata = {
  title: "Piutang — Owner",
};

export default async function DebtsPage() {
  const session = await auth();

  let initialDebts = [];
  let initialSummary = { totalUnpaid: 0, totalUnpaidAmount: 0, totalAll: 0 };

  try {
    const all = await getDebtOrders({ status: "all" });
    initialDebts = all;

    const unpaid = all.filter((d) => d.paymentStatus === "pending");
    initialSummary = {
      totalUnpaid: unpaid.length,
      totalUnpaidAmount: unpaid.reduce((s, d) => s + d.totalAmount, 0),
      totalAll: all.length,
    };
  } catch (err) {
    console.error("DebtsPage: failed to load debts", err);
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <DebtList
          initialDebts={initialDebts}
          initialSummary={initialSummary}
          ownerName={session.user.name}
        />
      </div>
    </main>
  );
}
