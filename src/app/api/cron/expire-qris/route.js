import { NextResponse } from "next/server";
import { expireQRISOrders } from "@/server/services/payment.service";

/**
 * GET /api/cron/expire-qris
 * Vercel Cron-compatible endpoint to expire QRIS orders that have timed out.
 *
 * Vercel Cron configuration (vercel.json):
 * {
 *   "crons": [{ "path": "/api/cron/expire-qris", "schedule": "* * * * *" }]
 * }
 *
 * Security: Vercel automatically sends the CRON_SECRET as Authorization header.
 * For manual invocations, pass: Authorization: Bearer <CRON_SECRET>
 *
 * Response 200: { data: { expired: number } }
 * Response 401: { error: { code, message } }
 */
export async function GET(request) {
  // Verify CRON_SECRET to prevent unauthorized invocations
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const expectedHeader = `Bearer ${cronSecret}`;

    if (authHeader !== expectedHeader) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Akses tidak diizinkan" } },
        { status: 401 }
      );
    }
  } else if (process.env.NODE_ENV !== "development") {
    // In production, CRON_SECRET must be set
    console.error("CRON_SECRET environment variable is not set");
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Konfigurasi cron tidak valid" } },
      { status: 401 }
    );
  }

  try {
    const expiredCount = await expireQRISOrders();

    console.log(`[cron/expire-qris] Expired ${expiredCount} QRIS orders`);

    return NextResponse.json({
      data: {
        expired: expiredCount,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[cron/expire-qris] Error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
