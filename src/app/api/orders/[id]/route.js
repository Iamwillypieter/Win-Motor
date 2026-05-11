import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOrderById, OrderError, OrderErrorCode } from "@/server/services/order.service";

/**
 * GET /api/orders/[id]
 * Get order detail by ID.
 * Role: CASHIER, WAREHOUSE.
 *
 * Response 200: { data: Order }
 * Response 401: { error: { code, message } }
 * Response 403: { error: { code, message } }
 * Response 404: { error: { code, message } }
 */
export async function GET(request, { params }) {
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

  const { id: orderId } = params;

  try {
    const order = await getOrderById(orderId);

    // Serialize MongoDB document fields
    const serialized = {
      ...order,
      _id: order._id?.toString(),
      cashierId: order.cashierId?.toString() ?? null,
      customerName: order.customerName ?? null,
      items: (order.items || []).map((item) => ({
        ...item,
        _id: item._id?.toString(),
        productId: item.productId?.toString(),
      })),
      createdAt: order.createdAt?.toISOString?.() ?? order.createdAt,
      updatedAt: order.updatedAt?.toISOString?.() ?? order.updatedAt,
      completedAt: order.completedAt?.toISOString?.() ?? order.completedAt ?? null,
      qrisExpiresAt: order.qrisExpiresAt?.toISOString?.() ?? order.qrisExpiresAt ?? null,
    };

    return NextResponse.json({ data: serialized });
  } catch (err) {
    if (err instanceof OrderError && err.code === OrderErrorCode.ORDER_NOT_FOUND) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 404 }
      );
    }
    console.error(`GET /api/orders/${orderId} error:`, err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
