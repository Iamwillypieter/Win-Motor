import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDebtOrders } from "@/server/services/payment.service";

/**
 * GET /api/debts
 * Ambil daftar semua pesanan utang.
 * Role: OWNER
 *
 * Query params:
 *   ?status=unpaid|paid|all   (default: unpaid)
 *
 * Response 200: { data: Order[], summary: { totalUnpaid, totalAmount } }
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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "unpaid";

  if (!["unpaid", "paid", "all"].includes(status)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "status harus: unpaid | paid | all" } },
      { status: 400 }
    );
  }

  try {
    const debts = await getDebtOrders({ status });

    // Hitung summary untuk tampilan di halaman
    const unpaidDebts = debts.filter((d) => d.paymentStatus === "pending");
    const summary = {
      totalUnpaid: unpaidDebts.length,
      totalUnpaidAmount: unpaidDebts.reduce((sum, d) => sum + d.totalAmount, 0),
      totalAll: debts.length,
    };

    return NextResponse.json({ data: debts, summary });
  } catch (err) {
    console.error("GET /api/debts error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
