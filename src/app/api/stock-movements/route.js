import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import StockMovement from "@/models/StockMovement";

/**
 * GET /api/stock-movements
 * Ambil histori mutasi stok dengan filter opsional.
 * Role: OWNER, WAREHOUSE
 *
 * Query params:
 *   ?productId=<id>              — filter per produk
 *   ?type=in|out|adjustment|create — filter tipe mutasi
 *   ?from=<YYYY-MM-DD>           — dari tanggal
 *   ?to=<YYYY-MM-DD>             — sampai tanggal
 *   ?limit=<n>                   — jumlah per halaman (default 50, max 200)
 *   ?page=<n>                    — halaman (default 1)
 *   ?search=<text>               — cari nama/SKU produk
 *
 * Response 200: { data: StockMovement[], total: number, page, totalPages }
 */
export async function GET(request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (!["OWNER", "WAREHOUSE"].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak" } },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId") || undefined;
  const type = searchParams.get("type") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const search = searchParams.get("search") || undefined;
  const rawLimit = parseInt(searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(1, rawLimit), 200);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  const VALID_TYPES = ["in", "out", "adjustment", "create"];
  if (type && !VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "type harus: in | out | adjustment | create" } },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    const query = {};

    if (productId) {
      query.productId = productId;
    }

    if (type) {
      query.type = type;
    }

    if (from || to) {
      query.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        fromDate.setHours(0, 0, 0, 0);
        query.createdAt.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = toDate;
      }
    }

    if (search) {
      const re = new RegExp(search.trim(), "i");
      query.$or = [
        { productName: re },
        { sku: re },
        { invoiceNumber: re },
        { userName: re },
      ];
    }

    const skip = (page - 1) * limit;

    const [movements, total] = await Promise.all([
      StockMovement.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StockMovement.countDocuments(query),
    ]);

    const serialized = movements.map((m) => ({
      ...m,
      _id: m._id.toString(),
      productId: m.productId?.toString() ?? null,
      orderId: m.orderId?.toString() ?? null,
      userId: m.userId?.toString() ?? null,
      createdAt: m.createdAt?.toISOString() ?? null,
    }));

    return NextResponse.json({
      data: serialized,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("GET /api/stock-movements error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
