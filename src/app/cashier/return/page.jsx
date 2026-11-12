import ReturnPage from "@/components/cashier/ReturnPage";

export const metadata = {
  title: "Retur Barang — Kasir",
};

/**
 * CashierReturnPage — halaman retur barang untuk role kasir.
 *
 * Server Component tipis: hanya set metadata dan render client component.
 * Auth guard sudah ditangani oleh CashierLayout (layout.jsx).
 */
export default function CashierReturnPage() {
  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <ReturnPage />
    </main>
  );
}
