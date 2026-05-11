import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTopProducts } from "@/server/services/analytics.service";

/**
 * GET /api/analytics/top-products
 * Returns top selling products by quantity for the current month.
 * Role: OWNER only.
 */
export async function GET() {
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
    const products = await getTopProducts(10);

    const now = new Date();
    const month = now.toLocaleString("id-ID", { month: "long", year: "numeric" });

    return NextResponse.json({ data: products, month });
  } catch (err) {
    console.error("GET /api/analytics/top-products error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
