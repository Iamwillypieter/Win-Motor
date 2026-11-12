import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getReturnById, ReturnError } from "@/server/services/return.service";

/**
 * GET /api/returns/[id]
 * Ambil detail satu transaksi retur.
 * Role: CASHIER only.
 *
 * Response 200: { data: Return }
 * Response 404: { error: { code, message } }
 */
export async function GET(_request, { params }) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (session.user.role !== "CASHIER") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak" } },
      { status: 403 }
    );
  }

  try {
    const returnDoc = await getReturnById(params.id);
    return NextResponse.json({ data: returnDoc });
  } catch (err) {
    if (err instanceof ReturnError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 404 }
      );
    }
    console.error("GET /api/returns/[id] error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
