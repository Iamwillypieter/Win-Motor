import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCashierRanking } from "@/server/services/analytics.service";

/**
 * GET /api/analytics/ranking
 * Returns cashier ranking by total revenue for the current month.
 * Role: OWNER only.
 *
 * Response 200:
 * {
 *   "data": [{ cashierName, totalOrders, totalRevenue }, ...],
 *   "month": "Mei 2026"
 * }
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
    const ranking = await getCashierRanking(10);

    const now = new Date();
    const month = now.toLocaleString("id-ID", { month: "long", year: "numeric" });

    return NextResponse.json({ data: ranking, month });
  } catch (err) {
    console.error("GET /api/analytics/ranking error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
