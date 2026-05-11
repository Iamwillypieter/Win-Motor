import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import ProductCatalog from "@/components/cashier/ProductCatalog";
import CartPanel from "@/components/cashier/CartPanel";

export const metadata = {
  title: "POS — Kasir",
};

/**
 * CashierPage — main POS page (Server Component).
 * Fetches active products server-side and renders the catalog + cart layout.
 */
export default async function CashierPage() {
  const session = await auth();

  // Fetch active products server-side
  let products = [];
  try {
    await connectDB();
    products = await Product.find({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();

    // Serialize MongoDB documents (convert ObjectId, Date, etc. to plain values)
    products = products.map((p) => ({
      ...p,
      _id: p._id.toString(),
      createdBy: p.createdBy?.toString() ?? null,
      createdAt: p.createdAt?.toISOString() ?? null,
      updatedAt: p.updatedAt?.toISOString() ?? null,
    }));
  } catch (err) {
    console.error("CashierPage: failed to fetch products", err);
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Main layout: catalog (left, wider) + cart panel (right) */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-6 items-start">
          {/* Product catalog — takes up most of the width */}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
              Katalog Produk
            </h2>
            <ProductCatalog products={products} />
          </div>

          {/* Cart panel — fixed width on the right */}
          <div className="w-80 flex-shrink-0 sticky top-6">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
              Keranjang
            </h2>
            <CartPanel />
          </div>
        </div>
      </div>
    </main>
  );
}
