import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMetrics, getChartData } from "@/server/services/analytics.service";

/**
 * GET /api/analytics
 * Returns summary metrics and daily chart data for completed orders.
 * Role: OWNER only.
 *
 * Query params:
 *   ?range=daily|weekly|monthly  (default: monthly)
 *   ?from=<ISO date>             (optional, used with ?to= for custom range)
 *   ?to=<ISO date>               (optional)
 *
 * Response 200:
 * {
 *   "summary": { totalRevenue, totalOrders, averageOrderValue },
 *   "chart": [{ date, revenue }, ...]
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
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "monthly";
    const from = searchParams.get("from") || null;
    const to = searchParams.get("to") || null;
    const month = searchParams.get("month") || null; // format: YYYY-MM

    const validRanges = ["daily", "weekly", "monthly"];
    if (!validRanges.includes(range) && !(from && to) && !month) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Parameter range harus: daily, weekly, atau monthly",
          },
        },
        { status: 400 }
      );
    }

    const [summary, chart] = await Promise.all([
      getMetrics(range, from, to, month),
      getChartData(range, from, to, month),
    ]);

    return NextResponse.json({ summary, chart });
  } catch (err) {
    console.error("GET /api/analytics error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
