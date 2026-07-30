import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Product from "@/models/Product";

// Paksa route ini selalu dynamic — tidak boleh di-cache
// agar stok dan harga selalu sinkron dengan data terbaru dari gudang/kasir
export const dynamic = "force-dynamic";

/**
 * GET /api/store/products
 * Public endpoint — no authentication required.
 * Returns active products for the public storefront catalog.
 *
 * Data diambil langsung dari MongoDB tanpa cache sehingga selalu sinkron
 * dengan data yang dilihat kasir dan staf gudang.
 *
 * Internal fields (sku, createdBy, isActive, updatedAt) are excluded from the response.
 *
 * Query params:
 *   ?search=<text>  — filter by product name (case-insensitive)
 */
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";

    const query = { isActive: true };

    if (search) {
      // Use regex for partial name matching (text index requires full-word match)
      query.name = { $regex: search, $options: "i" };
    }

    const products = await Product.find(query)
      .select("_id name price stock imageUrl createdAt")
      .sort({ name: 1 })
      .lean();

    // Map to public-safe shape — strip any internal fields that may leak through
    const publicProducts = products.map((p) => ({
      _id: p._id.toString(),
      name: p.name,
      price: p.price,
      stock: p.stock,
      imageUrl: p.imageUrl ?? null,
    }));

    return NextResponse.json({ data: publicProducts, total: publicProducts.length });
  } catch (err) {
    console.error("GET /api/store/products error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
