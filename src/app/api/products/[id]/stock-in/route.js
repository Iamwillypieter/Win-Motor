import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addStock, ProductError } from "@/server/services/product.service";
import { ProductErrorCode } from "@/types/product.types";

/**
 * POST /api/products/:id/stock-in
 * Add stock to a product (barang masuk). Accessible by WAREHOUSE and OWNER.
 *
 * Body:
 *   quantity      {number}  — wajib, bilangan bulat positif, jumlah yang ditambah
 *   supplierId    {string}  — opsional, ObjectId supplier
 *   supplierName  {string}  — opsional, nama supplier (digunakan jika supplierId tidak ada)
 *   purchasePrice {number}  — opsional, harga beli per satuan (rupiah)
 *
 * Response 200: { data: { product, addedQuantity } }
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
    const { quantity, supplierId, supplierName, purchasePrice } = body;

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

    if (quantity > 100_000) {
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

    // Validasi supplierId jika diberikan
    if (supplierId !== undefined && supplierId !== null) {
      const safeSupplierId = String(supplierId).replace(/[^a-fA-F0-9]/g, "");
      if (safeSupplierId.length !== 24) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "ID supplier tidak valid" } },
          { status: 400 }
        );
      }
    }

    // Validasi purchasePrice jika diberikan
    if (purchasePrice !== undefined && purchasePrice !== null) {
      if (typeof purchasePrice !== "number" || !Number.isInteger(purchasePrice) || purchasePrice < 0) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Harga beli harus berupa bilangan bulat non-negatif (rupiah)",
            },
          },
          { status: 400 }
        );
      }
    }

    const supplierInfo = {
      supplierId: supplierId ?? null,
      supplierName: supplierName?.trim() ?? null,
      purchasePrice: purchasePrice ?? null,
    };

    const product = await addStock(safeId, quantity, session.user.id, supplierInfo);

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
