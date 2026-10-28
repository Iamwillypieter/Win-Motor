import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import CashierPOSLayout from "@/components/cashier/CashierPOSLayout";

export const metadata = {
  title: "POS — Kasir",
};

/**
 * CashierPage — main POS page (Server Component).
 * Fetches active products server-side, lalu menyerahkan rendering ke
 * CashierPOSLayout (client) agar layout bisa responsif (cart inline di
 * desktop, drawer di mobile).
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

  return <CashierPOSLayout products={products} />;
}
