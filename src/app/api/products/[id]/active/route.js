import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setProductActive, ProductError } from "@/server/services/product.service";
import { ProductErrorCode } from "@/types/product.types";

/**
 * PATCH /api/products/:id/active
 * Aktifkan atau nonaktifkan produk (toggle isActive).
 *
 * Nonaktif → produk tidak muncul di katalog kasir (mencegah penjualan rugi
 * saat harga beli naik). Dapat diaktifkan kembali. Accessible by WAREHOUSE
 * dan OWNER.
 *
 * Body: { active: boolean }
 * Response 200: { data: product }
 */
export async function PATCH(request, { params }) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (!["WAREHOUSE", "OWNER"].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak" } },
      { status: 403 }
    );
  }

  // Sanitasi params.id — hanya karakter hex (MongoDB ObjectId)
  const safeId = params.id.replace(/[^a-fA-F0-9]/g, "");
  if (!safeId || safeId.length !== 24) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID produk tidak valid" } },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { active } = body;

    if (typeof active !== "boolean") {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Field 'active' wajib berupa boolean (true/false)",
          },
        },
        { status: 400 }
      );
    }

    const product = await setProductActive(safeId, active);
    return NextResponse.json({ data: product });
  } catch (err) {
    if (err instanceof ProductError) {
      const status = err.code === ProductErrorCode.PRODUCT_NOT_FOUND ? 404 : 400;
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status }
      );
    }
    console.error("PATCH /api/products/:id/active error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
