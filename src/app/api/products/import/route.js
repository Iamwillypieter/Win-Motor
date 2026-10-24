import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createProduct, ProductError } from "@/server/services/product.service";

/**
 * POST /api/products/import
 * Import produk massal dari data JSON (hasil parse Excel di client-side).
 * Accessible by WAREHOUSE dan OWNER.
 *
 * Body: {
 *   products: Array<{
 *     name: string,
 *     sku: string,
 *     price: number,
 *     stock: number,
 *     brand?: string,
 *     category?: string,
 *     aliases?: string   // semicolon-separated string atau array
 *   }>
 * }
 *
 * Response 200: {
 *   data: {
 *     success: number,
 *     failed: number,
 *     results: Array<{ row, sku, name, status: "success"|"failed", error?: string }>
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

  const { products } = body;

  if (!Array.isArray(products) || products.length === 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Tidak ada data produk untuk diimport" } },
      { status: 400 }
    );
  }

  if (products.length > 2000) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Maksimal 2.000 produk per import" } },
      { status: 400 }
    );
  }

  const results = [];
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < products.length; i++) {
    const row = i + 2; // Baris di Excel (baris 1 = header)
    const item = products[i];

    // Validasi field wajib per baris
    if (!item.name || !item.sku) {
      results.push({
        row,
        sku: item.sku || "-",
        name: item.name || "-",
        status: "failed",
        error: "Kolom 'name' dan 'sku' wajib diisi",
      });
      failedCount++;
      continue;
    }

    const price = Number(item.price);
    const stock = Number(item.stock ?? 0);

    if (isNaN(price) || price < 0) {
      results.push({
        row,
        sku: item.sku,
        name: item.name,
        status: "failed",
        error: "Harga harus berupa angka non-negatif",
      });
      failedCount++;
      continue;
    }

    if (isNaN(stock) || stock < 0) {
      results.push({
        row,
        sku: item.sku,
        name: item.name,
        status: "failed",
        error: "Stok harus berupa angka non-negatif",
      });
      failedCount++;
      continue;
    }

    // Normalisasi aliases: bisa string "a;b;c" atau array
    let aliases = [];
    if (Array.isArray(item.aliases)) {
      aliases = item.aliases;
    } else if (typeof item.aliases === "string" && item.aliases.trim()) {
      aliases = item.aliases.split(";").map((a) => a.trim()).filter(Boolean);
    }

    try {
      await createProduct({
        name: String(item.name).trim(),
        sku: String(item.sku).trim(),
        price: Math.round(price),
        stock: Math.round(stock),
        brand: item.brand ? String(item.brand).trim() : null,
        category: item.category ? String(item.category).trim() : null,
        aliases,
        imageUrl: null,
        createdBy: session.user.id,
      });

      results.push({
        row,
        sku: item.sku,
        name: item.name,
        status: "success",
      });
      successCount++;
    } catch (err) {
      let errorMsg = "Gagal menyimpan produk";
      if (err instanceof ProductError) {
        errorMsg = err.message;
      }
      results.push({
        row,
        sku: item.sku,
        name: item.name,
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
      total: products.length,
      results,
    },
  });
}
