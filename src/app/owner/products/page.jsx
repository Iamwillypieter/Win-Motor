import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import OwnerProductList from "@/components/owner/OwnerProductList";

export const metadata = {
  title: "Produk — Owner",
};

export default async function OwnerProductsPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== "OWNER") {
    redirect("/403");
  }

  let products = [];
  try {
    await connectDB();
    const docs = await Product.find({ isActive: true })
      .sort({ name: 1 })
      .lean();

    products = docs.map((p) => ({
      _id: p._id.toString(),
      name: p.name,
      sku: p.sku,
      price: p.price,
      stock: p.stock,
      imageUrl: p.imageUrl ?? null,
      createdAt: p.createdAt?.toISOString() ?? null,
      updatedAt: p.updatedAt?.toISOString() ?? null,
    }));
  } catch (err) {
    console.error("OwnerProductsPage: failed to fetch products", err);
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produk Toko</h1>
          <p className="text-sm text-gray-500 mt-1">
            {products.length} produk aktif
          </p>
        </div>
        <OwnerProductList initialProducts={products} />
      </div>
    </main>
  );
}
