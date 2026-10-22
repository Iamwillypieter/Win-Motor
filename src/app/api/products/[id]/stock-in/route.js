import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addStock, ProductError } from "@/server/services/product.service";
import { ProductErrorCode } from "@/types/product.types";

/**
 * POST /api/products/:id/stock-in
 * Add stock to a product (barang masuk). Accessible by WAREHOUSE only.
 *
 * Body: { quantity: number } — positive integer, amount to add
 *
 * Response 200: { data: { product: updatedProduct, addedQuantity: number } }
 * Response 400: { error: { code, message } }
 * Response 404: { error: { code: "PRODUCT_NOT_FOUND" } }
 */
export async function POST(request, { params }) {
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

  // Sanitasi params.id — hanya izinkan karakter hex (MongoDB ObjectId)
  const safeId = params.id.replace(/[^a-fA-F0-9]/g, "");
  if (!safeId || safeId.length !== 24) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID produk tidak valid" } },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { quantity } = body;

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Jumlah harus berupa bilangan bulat positif",
          },
        },
        { status: 400 }
      );
    }

    // Batas maksimal per input untuk mencegah kesalahan input ekstrem
    if (quantity > 100000) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Jumlah maksimal 100.000 per input",
          },
        },
        { status: 400 }
      );
    }

    const product = await addStock(safeId, quantity);

    return NextResponse.json({
      data: {
        product,
        addedQuantity: quantity,
      },
    });
  } catch (err) {
    if (err instanceof ProductError) {
      const status = err.code === ProductErrorCode.PRODUCT_NOT_FOUND ? 404 : 400;
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status }
      );
    }
    console.error("POST /api/products/:id/stock-in error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
