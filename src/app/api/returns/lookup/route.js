import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { lookupProductBySku, ReturnError } from "@/server/services/return.service";

/**
 * GET /api/returns/lookup?sku=<value>
 * Cari produk berdasarkan SKU atau hasil scan barcode.
 * Digunakan oleh halaman retur untuk resolve barcode ke data produk.
 * Role: CASHIER only.
 *
 * Query params:
 *   ?sku=<string>  — nilai SKU atau barcode yang di-scan
 *
 * Response 200: { data: Product }
 * Response 404: { error: { code, message } }
 */
export async function GET(request) {
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

  const { searchParams } = new URL(request.url);
  const sku = searchParams.get("sku");

  if (!sku || !sku.trim()) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Parameter ?sku wajib diisi" } },
      { status: 400 }
    );
  }

  try {
    const product = await lookupProductBySku(sku.trim());
    return NextResponse.json({ data: product });
  } catch (err) {
    if (err instanceof ReturnError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 404 }
      );
    }
    console.error("GET /api/returns/lookup error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
