import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Invoice from "@/models/Invoice";
import Product from "@/models/Product";
import User from "@/models/User";
import StockMovement from "@/models/StockMovement";

/**
 * GET /api/cron/backup-db
 * Ekspor semua koleksi database ke format JSON.
 *
 * Bisa dipanggil dua cara:
 *  1. Terjadwal via Vercel Cron / cron eksternal — simpan file ke storage
 *  2. Manual via halaman owner /owner/backup — download langsung di browser
 *
 * Security: Bearer token dari CRON_SECRET (sama dengan endpoint expire-qris).
 *
 * Response 200: application/json attachment (file backup-YYYY-MM-DD.json)
 * Response 401: tidak terautentikasi
 * Response 500: error server
 *
 * Vercel Cron (opsional, jadwal harian jam 01:00 WIB = 18:00 UTC):
 * {
 *   "crons": [{ "path": "/api/cron/backup-db", "schedule": "0 18 * * *" }]
 * }
 */
export async function GET(request) {
  // ── Auth: verifikasi CRON_SECRET ─────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Akses tidak diizinkan" } },
        { status: 401 }
      );
    }
  } else if (process.env.NODE_ENV !== "development") {
    console.error("[backup-db] CRON_SECRET tidak di-set di production");
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Konfigurasi backup tidak valid" } },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    // ── Fetch semua koleksi secara paralel ───────────────────────────────────
    const [orders, invoices, products, users, stockMovements] =
      await Promise.all([
        Order.find({}).lean(),
        Invoice.find({}).lean(),
        Product.find({}).lean(),
        // Hapus field password dari user sebelum di-ekspor
        User.find({}).select("-password").lean(),
        StockMovement.find({}).lean(),
      ]);

    const backupDate = new Date();
    const dateLabel = backupDate.toISOString().slice(0, 10); // "YYYY-MM-DD"

    const payload = {
      meta: {
        version: "1.0",
        exportedAt: backupDate.toISOString(),
        collections: {
          orders: orders.length,
          invoices: invoices.length,
          products: products.length,
          users: users.length,
          stockMovements: stockMovements.length,
        },
      },
      data: {
        orders,
        invoices,
        products,
        users,
        stockMovements,
      },
    };

    const json = JSON.stringify(payload, null, 2);
    const filename = `backup-${dateLabel}.json`;

    console.log(
      `[cron/backup-db] Backup selesai: ${filename} — ` +
        `orders=${orders.length} invoices=${invoices.length} ` +
        `products=${products.length} users=${users.length} ` +
        `stockMovements=${stockMovements.length}`
    );

    // Kembalikan sebagai file download
    return new Response(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // Jangan cache — setiap request harus fresh
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[cron/backup-db] Error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Gagal membuat backup" } },
      { status: 500 }
    );
  }
}
