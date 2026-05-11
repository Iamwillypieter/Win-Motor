import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";

/**
 * GET /api/products/low-stock
 * Returns active products with stock = 0 (habis) or stock <= threshold (hampir habis).
 * Role: OWNER only.
 *
 * Query params:
 *   ?threshold=5  (default: 5) — produk dengan stok <= threshold dianggap hampir habis
 */
export async function GET(request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak" } },
      { status: 403 }
    );
  }

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const threshold = parseInt(searchParams.get("threshold") || "5", 10);

    const products = await Product.find({
      isActive: true,
      stock: { $lte: threshold },
    })
      .select("name sku stock")
      .sort({ stock: 1 }) // stok paling sedikit di atas
      .lean();

    const serialized = products.map((p) => ({
      _id: p._id.toString(),
      name: p.name,
      sku: p.sku,
      stock: p.stock,
    }));

    return NextResponse.json({
      data: serialized,
      threshold,
      outOfStock: serialized.filter((p) => p.stock === 0).length,
      lowStock: serialized.filter((p) => p.stock > 0).length,
    });
  } catch (err) {
    console.error("GET /api/products/low-stock error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
