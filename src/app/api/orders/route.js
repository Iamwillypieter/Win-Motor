import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createOrder,
  getOrders,
  OrderError,
} from "@/server/services/order.service";

/**
 * POST /api/orders
 * Create a new order from the cashier's cart.
 * Role: CASHIER only.
 *
 * Body: { items: [{ productId: string, quantity: number }] }
 * Response 201: { data: Order }
 * Response 400: { error: { code, message } }
 */
export async function POST(request) {
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

  try {
    const body = await request.json();
    const { items } = body;

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Field wajib: items (array)",
          },
        },
        { status: 400 }
      );
    }

    const order = await createOrder(session.user.id, items);

    return NextResponse.json({ data: order }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 400 }
      );
    }
    console.error("POST /api/orders error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/orders
 * List orders with optional filters.
 * Role: CASHIER, WAREHOUSE.
 *
 * Query params: ?status=<orderStatus>, ?cashierId=<id>
 * Response 200: { data: Order[] }
 */
export async function GET(request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (!["CASHIER", "WAREHOUSE"].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak" } },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const cashierId = searchParams.get("cashierId") || undefined;

    const orders = await getOrders({ status, cashierId });

    return NextResponse.json({ data: orders, total: orders.length });
  } catch (err) {
    console.error("GET /api/orders error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
