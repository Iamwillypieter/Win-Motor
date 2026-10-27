import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addStock, ProductError } from "@/server/services/product.service";
import { ProductErrorCode } from "@/types/product.types";

/**
 * POST /api/products/batch-stock-in
 * Tambah stok banyak produk sekaligus (stok masuk massal via scan barcode).
 * Accessible by WAREHOUSE dan OWNER.
 *
 * Body: {
 *   supplierId?:    string   — opsional, berlaku untuk semua item dalam batch ini
 *   supplierName?:  string   — opsional, nama supplier (snapshot)
 *   purchasePrice?: number   — opsional, harga beli default per satuan untuk semua item
 *   items: Array<{
 *     productId:     string
 *     quantity:      number
 *     sku?:          string
 *     name?:         string
 *     purchasePrice?: number — opsional, override harga beli per item
 *   }>
 * }
 *
 * Response 200: {
 *   data: {
 *     success: number,
 *     failed: number,
 *     results: Array<{
 *       productId, sku, name, quantity, newStock?, status: "success"|"failed", error?
 *     }>
 *   }
 * }
 */
export async function POST(request) {
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Body tidak valid" } },
      { status: 400 }
    );
  }

  const { items, supplierId, supplierName, purchasePrice: defaultPurchasePrice } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Tidak ada item untuk diproses" } },
      { status: 400 }
    );
  }

  if (items.length > 500) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Maksimal 500 item per sesi stok masuk" } },
      { status: 400 }
    );
  }

  // Validasi supplierId level batch jika diberikan
  let safeBatchSupplierId = null;
  if (supplierId) {
    safeBatchSupplierId = String(supplierId).replace(/[^a-fA-F0-9]/g, "");
    if (safeBatchSupplierId.length !== 24) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "ID supplier tidak valid" } },
        { status: 400 }
      );
    }
  }

  // Validasi defaultPurchasePrice level batch jika diberikan
  if (defaultPurchasePrice !== undefined && defaultPurchasePrice !== null) {
    if (
      typeof defaultPurchasePrice !== "number" ||
      !Number.isInteger(defaultPurchasePrice) ||
      defaultPurchasePrice < 0
    ) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Harga beli default harus berupa bilangan bulat non-negatif (rupiah)",
          },
        },
        { status: 400 }
      );
    }
  }

  const results = [];
  let successCount = 0;
  let failedCount = 0;

  for (const item of items) {
    const { productId, sku, name, quantity, purchasePrice: itemPurchasePrice } = item;

    // Sanitasi productId — hanya karakter hex MongoDB ObjectId
    const safeId =
      typeof productId === "string" ? productId.replace(/[^a-fA-F0-9]/g, "") : "";

    if (!safeId || safeId.length !== 24) {
      results.push({
        productId: productId ?? "-",
        sku: sku ?? "-",
        name: name ?? "-",
        quantity,
        status: "failed",
        error: "ID produk tidak valid",
      });
      failedCount++;
      continue;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      results.push({
        productId,
        sku: sku ?? "-",
        name: name ?? "-",
        quantity,
        status: "failed",
        error: "Jumlah harus berupa bilangan bulat positif",
      });
      failedCount++;
      continue;
    }

    if (quantity > 100_000) {
      results.push({
        productId,
        sku: sku ?? "-",
        name: name ?? "-",
        quantity,
        status: "failed",
        error: "Jumlah maksimal 100.000 per item",
      });
      failedCount++;
      continue;
    }

    // Resolusi harga beli: item-level override > batch-level default
    const resolvedPurchasePrice =
      itemPurchasePrice !== undefined && itemPurchasePrice !== null
        ? itemPurchasePrice
        : defaultPurchasePrice ?? null;

    const supplierInfo = {
      supplierId: safeBatchSupplierId,
      supplierName: supplierName?.trim() ?? null,
      purchasePrice: resolvedPurchasePrice,
    };

    try {
      const updated = await addStock(safeId, quantity, session.user.id, supplierInfo);
      results.push({
        productId,
        sku: updated.sku,
        name: updated.name,
        quantity,
        newStock: updated.stock,
        status: "success",
      });
      successCount++;
    } catch (err) {
      let errorMsg = "Gagal menambah stok";
      if (err instanceof ProductError) {
        errorMsg =
          err.code === ProductErrorCode.PRODUCT_NOT_FOUND
            ? "Produk tidak ditemukan"
            : err.message;
      }
      results.push({
        productId,
        sku: sku ?? "-",
        name: name ?? "-",
        quantity,
        status: "failed",
        error: errorMsg,
      });
      failedCount++;
    }
  }

  return NextResponse.json({
    data: {
      success: successCount,
      failed: failedCount,
      total: items.length,
      results,
    },
  });
}
