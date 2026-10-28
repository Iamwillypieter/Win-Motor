import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOrderHistory, OrderError } from "@/server/services/order.service";

/**
 * GET /api/orders/history
 * Ambil riwayat pesanan (default: status completed & cancelled) dengan filter
 * dan pagination server-side. Dirancang untuk halaman "Riwayat Pesanan"
 * di Gudang dan Owner.
 *
 * Role: WAREHOUSE, OWNER
 *
 * Query params:
 *   ?status=<orderStatus>       — daftar dipisah koma (default: completed,cancelled)
 *   ?orderType=ONLINE|OFFLINE  — filter tipe pesanan
 *   ?from=<YYYY-MM-DD>          — dari tanggal (berdasarkan createdAt)
 *   ?to=<YYYY-MM-DD>            — sampai tanggal
 *   ?search=<text>              — cari invoice / nama pelanggan / nama kasir
 *   ?limit=<n>                  — jumlah per halaman (default 20, max 200)
 *   ?page=<n>                   — halaman (default 1)
 *
 * Response 200: {
 *   data: Order[],
 *   total: number,
 *   page: number,
 *   totalPages: number,
 *   summary: { completed, cancelled, totalRevenue }
 * }
 */
export async function GET(request) {
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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const orderType = searchParams.get("orderType") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const search = searchParams.get("search") || undefined;
  const rawLimit = parseInt(searchParams.get("limit") || "20", 10);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 20;
  const rawPage = parseInt(searchParams.get("page") || "1", 10);
  const page = Number.isFinite(rawPage) ? rawPage : 1;

  // Validasi orderType
  if (orderType !== undefined && !["ONLINE", "OFFLINE"].includes(orderType)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "orderType harus berupa ONLINE atau OFFLINE",
        },
      },
      { status: 400 }
    );
  }

  try {
    const result = await getOrderHistory({
      status,
      orderType,
      from,
      to,
      search,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OrderError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 400 }
      );
    }
    console.error("GET /api/orders/history error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
