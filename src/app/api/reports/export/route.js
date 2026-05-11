import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { exportCSV } from "@/server/services/analytics.service";

/**
 * GET /api/reports/export
 * Download a CSV file of completed orders for the given time range.
 * Role: OWNER only.
 *
 * Query params:
 *   ?range=daily|weekly|monthly  (default: monthly)
 *   ?from=<ISO date>             (optional, used with ?to= for custom range)
 *   ?to=<ISO date>               (optional)
 *
 * Response: CSV file download with Content-Disposition header.
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

    const csv = await exportCSV(range, from, to);

    // Generate a filename with current date
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `report-${range}-${dateStr}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${filename}`,
      },
    });
  } catch (err) {
    console.error("GET /api/reports/export error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
