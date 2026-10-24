import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import StockHistory from "@/components/owner/StockHistory";

export const metadata = {
  title: "Riwayat Stok — Owner",
};

export default async function StockHistoryPage() {
  const session = await auth();

  // Ambil daftar produk untuk dropdown filter
  let products = [];
  try {
    await connectDB();
    const docs = await Product.find({ isActive: true })
      .select("_id name sku category")
      .sort({ name: 1 })
      .lean();
    products = docs.map((p) => ({
      _id: p._id.toString(),
      name: p.name,
      sku: p.sku,
      category: p.category ?? null,
    }));
  } catch (err) {
    console.error("StockHistoryPage: failed to load products", err);
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <StockHistory products={products} />
      </div>
    </main>
  );
}
