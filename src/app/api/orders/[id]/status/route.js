import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import sseManager from "@/lib/sse";

/** Valid status transitions allowed by WAREHOUSE staff */
const ALLOWED_STATUSES = ["preparing", "ready"];

/**
 * PATCH /api/orders/[id]/status
 * Update the orderStatus of an order.
 * Role: WAREHOUSE only.
 *
 * Body: { orderStatus: "preparing" | "ready" }
 *
 * When status becomes "ready":
 *   - Broadcasts `order_ready` event to the specific cashier who created the order
 *
 * Always broadcasts `order_status_updated` to WAREHOUSE clients.
 *
 * Response 200: { data: { orderId, orderStatus } }
 * Response 400: { error: { code, message } }
 * Response 403: { error: { code, message } }
 * Response 404: { error: { code, message } }
 */
export async function PATCH(request, { params }) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (session.user.role !== "WAREHOUSE") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak. Hanya staf gudang." } },
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

  const { orderStatus } = body;

  if (!orderStatus || !ALLOWED_STATUSES.includes(orderStatus)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `orderStatus harus salah satu dari: ${ALLOWED_STATUSES.join(", ")}`,
        },
      },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    const order = await Order.findById(orderId);

    if (!order) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Pesanan tidak ditemukan" } },
        { status: 404 }
      );
    }

    // Only allow updating orders that are still in the active queue
    if (!["waiting_preparation", "preparing"].includes(order.orderStatus)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: `Tidak dapat mengubah status pesanan yang sudah ${order.orderStatus}`,
          },
        },
        { status: 400 }
      );
    }

    order.orderStatus = orderStatus;
    order.updatedAt = new Date();
    await order.save();

    const orderObj = order.toObject();

    // Broadcast status update to all WAREHOUSE clients
    try {
      sseManager.broadcastToRole(
        {
          type: "order_status_updated",
          data: { orderId: orderId, orderStatus },
        },
        ["WAREHOUSE"]
      );
    } catch (err) {
      console.error("SSE broadcast error (order_status_updated):", err);
    }

    // When order is ready, notify the specific cashier who created it
    if (orderStatus === "ready") {
      try {
        const cashierId = order.cashierId?.toString();
        if (cashierId) {
          sseManager.broadcastToUser(
            {
              type: "order_ready",
              data: {
                orderId: orderId,
                invoiceNumber: order.invoiceNumber,
                orderStatus: "ready",
              },
            },
            cashierId
          );
        }
      } catch (err) {
        console.error("SSE broadcast error (order_ready):", err);
      }
    }

    return NextResponse.json({
      data: { orderId, orderStatus },
    });
  } catch (err) {
    console.error(`PATCH /api/orders/${orderId}/status error:`, err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
