import { auth } from "@/lib/auth";
import { getProducts } from "@/server/services/product.service";
import ProductTable from "@/components/warehouse/ProductTable";

export const metadata = {
  title: "Inventori — Gudang",
};

export default async function WarehouseInventoryPage() {
  const session = await auth();

  // Initial product list fetched server-side
  let initialProducts = [];
  try {
    const raw = await getProducts();
    // Serialize MongoDB ObjectId and Date fields to plain values
    initialProducts = raw.map((p) => ({
      ...p,
      _id: p._id.toString(),
      createdBy: p.createdBy?.toString() ?? null,
      createdAt: p.createdAt?.toISOString() ?? null,
      updatedAt: p.updatedAt?.toISOString() ?? null,
    }));
  } catch (err) {
    console.error("Failed to load products:", err);
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <ProductTable initialProducts={initialProducts} />
      </div>
    </main>
  );
}
