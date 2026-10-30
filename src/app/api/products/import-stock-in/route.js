import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { importStockInBatch } from "@/server/services/product.service";

/**
 * POST /api/products/import-stock-in
 * Import barang masuk massal dari Excel (smart import).
 *
 * Untuk tiap baris: cocokkan produk berdasarkan SKU/barcode.
 *   - Ditemukan & aktif → tambah stok (stock_added)
 *   - Belum terdaftar  → buat produk baru dengan stok awal = qty (created)
 * Mencegah duplikat (pencarian SKU tanpa filter isActive + unique index).
 * Accessible by WAREHOUSE dan OWNER.
 *
 * Body: {
 *   items: Array<{
 *     sku:           string,   // wajib (barcode/SKU)
 *     name?:         string,   // wajib untuk produk baru
 *     price?:        number,   // wajib untuk produk baru (harga jual)
 *     qty:           number,   // wajib, jumlah barang masuk
 *     brand?:        string,
 *     category?:     string,
 *     aliases?:      string | string[],
 *     supplier?:     string,   // Asal Barang (nama supplier)
 *     purchasePrice?: number,  // Harga beli satuan (rupiah)
 *   }>
 * }
 *
 * Response 200: {
 *   data: {
 *     success: number,
 *     failed: number,
 *     total: number,
 *     results: Array<{
 *       row, sku, name, status: "success"|"failed",
 *       action?: "stock_added"|"created", quantity?, newStock?, error?
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

  const { items } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Tidak ada data untuk diimport" } },
      { status: 400 }
    );
  }

  if (items.length > 2000) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Maksimal 2.000 baris per import" } },
      { status: 400 }
    );
  }

  // Tandai nomor baris Excel (baris 1 = header) untuk tiap item
  const rows = items.map((item, i) => ({ ...item, _rowNum: item._rowNum ?? i + 2 }));

  try {
    const result = await importStockInBatch(rows, session.user.id);
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("POST /api/products/import-stock-in error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
