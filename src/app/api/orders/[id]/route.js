import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getOrderById,
  updateOrderItems,
  cancelOrder,
  OrderError,
  OrderErrorCode,
} from "@/server/services/order.service";

/**
 * GET /api/orders/[id]
 * Get order detail by ID.
 * Role: CASHIER, WAREHOUSE.
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

/**
 * PATCH /api/orders/[id]
 * Update items in an order (before payment).
 * Role: CASHIER only.
 *
 * Body: { items: [{productId, quantity}], customerName?: string }
 */
export async function PATCH(request, { params }) {
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

  const { id: orderId } = params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Body tidak valid" } },
      { status: 400 }
    );
  }

  const { items, customerName } = body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "items wajib diisi (array tidak kosong)" } },
      { status: 400 }
    );
  }

  // Validasi per-item
  const isValidItems = items.every(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      typeof item.productId === "string" &&
      item.productId.trim().length > 0 &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0
  );

  if (!isValidItems) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Setiap item harus memiliki productId (string) dan quantity (bilangan bulat positif)" } },
      { status: 400 }
    );
  }

  try {
    const updated = await updateOrderItems(orderId, items, customerName);
    return NextResponse.json({ data: updated });
  } catch (err) {
    if (err instanceof OrderError) {
      const statusMap = {
        [OrderErrorCode.ORDER_NOT_FOUND]: 404,
        [OrderErrorCode.INVALID_STATUS]: 422,
        [OrderErrorCode.EMPTY_CART]: 400,
        [OrderErrorCode.INSUFFICIENT_STOCK]: 422,
      };
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: statusMap[err.code] ?? 400 }
      );
    }
    console.error(`PATCH /api/orders/${orderId} error:`, err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/orders/[id]
 * Cancel an unpaid order.
 * Role: CASHIER only.
 */
export async function DELETE(request, { params }) {
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

  const { id: orderId } = params;

  try {
    const result = await cancelOrder(orderId);
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof OrderError) {
      const statusMap = {
        [OrderErrorCode.ORDER_NOT_FOUND]: 404,
        [OrderErrorCode.INVALID_STATUS]: 422,
      };
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: statusMap[err.code] ?? 400 }
      );
    }
    console.error(`DELETE /api/orders/${orderId} error:`, err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
