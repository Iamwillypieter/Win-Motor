import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDailyMetrics, getMonthlyMetrics } from "@/server/services/analytics.service";

/**
 * GET /api/analytics/summary
 * Returns today's metrics AND current month metrics in one call.
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
    const [daily, monthly] = await Promise.all([
      getDailyMetrics(),
      getMonthlyMetrics(),
    ]);

    const now = new Date();
    const todayLabel = now.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    return NextResponse.json({ daily, monthly, todayLabel });
  } catch (err) {
    console.error("GET /api/analytics/summary error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
