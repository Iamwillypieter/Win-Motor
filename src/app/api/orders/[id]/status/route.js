import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import sseManager from "@/lib/sse";
import { completePayment, PaymentError } from "@/server/services/payment.service";
import { notifyOrderShipping, notifyOrderReady } from "@/lib/whatsapp";

/** Valid status transitions allowed by WAREHOUSE staff */
const ALLOWED_STATUSES = ["preparing", "ready", "shipping"];

/**
 * PATCH /api/orders/[id]/status
 * Update the orderStatus of an order.
 * Role: WAREHOUSE only.
 *
 * Body: { orderStatus: "preparing" | "ready" | "shipping" | "completed" }
 *
 * Status transitions:
 *   - "preparing" | "ready" — update orderStatus directly
 *   - "shipping" — hanya untuk pesanan ONLINE yang sudah paymentStatus "paid".
 *       Mengirim notifikasi WhatsApp ke pelanggan bahwa pesanan sedang dikirim.
 *   - "completed" — hanya untuk ONLINE + CASH atau ONLINE + BANK_TRANSFER.
 *       Memanggil completePayment() yang atomically:
 *         1. Sets paymentStatus → "paid", orderStatus → "completed"
 *         2. Decrements stock
 *         3. Creates Invoice
 *
 * Response 200: { data: { orderId, orderStatus } }
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

  const allAllowedStatuses = [...ALLOWED_STATUSES, "completed"];

  if (!orderStatus || !allAllowedStatuses.includes(orderStatus)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `orderStatus harus salah satu dari: ${allAllowedStatuses.join(", ")}`,
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

    // ── Shipping Path (ONLINE + sudah bayar → shipping) ──────────────────────
    if (orderStatus === "shipping") {
      if (order.orderType !== "ONLINE") {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Status 'shipping' hanya untuk pesanan online.",
            },
          },
          { status: 400 }
        );
      }

      if (order.paymentStatus !== "paid") {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_STATUS",
              message: "Pesanan belum dibayar. Tidak dapat ditandai sebagai dikirim.",
            },
          },
          { status: 400 }
        );
      }

      if (!["preparing", "ready"].includes(order.orderStatus)) {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_STATUS",
              message: `Tidak dapat mengubah status dari "${order.orderStatus}" ke "shipping".`,
            },
          },
          { status: 400 }
        );
      }

      order.orderStatus = "shipping";
      order.updatedAt = new Date();
      await order.save();

      // Broadcast ke WAREHOUSE dan CASHIER
      try {
        sseManager.broadcastToRole(
          { type: "order_status_updated", data: { orderId, orderStatus: "shipping" } },
          ["WAREHOUSE", "CASHIER"]
        );
      } catch (err) {
        console.error("SSE broadcast error (shipping):", err);
      }

      // Notifikasi SSE ke pelanggan
      try {
        if (order.sseToken) {
          sseManager.broadcastToToken(
            {
              type: "order_shipping",
              data: { orderId, invoiceNumber: order.invoiceNumber, orderStatus: "shipping" },
            },
            order.sseToken
          );
        }
      } catch (err) {
        console.error("SSE broadcast error (order_shipping → customer token):", err);
      }

      // Notifikasi WhatsApp ke pelanggan
      if (order.customerWhatsapp) {
        try {
          await notifyOrderShipping({
            customerName: order.customerName,
            customerWhatsapp: order.customerWhatsapp,
            invoiceNumber: order.invoiceNumber,
            shippingAddress: order.shippingAddress,
          });
        } catch (err) {
          console.error("WhatsApp notification error (shipping):", err);
        }
      }

      return NextResponse.json({ data: { orderId, orderStatus: "shipping" } });
    }

    // ── Manual Completion Path (ONLINE + CASH / BANK_TRANSFER / EWALLET → completed) ──
    if (orderStatus === "completed") {
      const isManualCompletion =
        order.orderType === "ONLINE" &&
        (order.paymentMethod === "CASH" ||
          order.paymentMethod === "BANK_TRANSFER" ||
          order.paymentMethod?.startsWith("EWALLET_"));

      if (!isManualCompletion) {
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

      if (order.orderStatus !== "ready") {
        const methodLabel =
          order.paymentMethod === "CASH"
            ? "COD"
            : order.paymentMethod === "BANK_TRANSFER"
            ? "Transfer Bank"
            : order.paymentMethod?.replace("EWALLET_", "") ?? "E-Wallet";
        return NextResponse.json(
          {
            error: {
              code: "INVALID_STATUS",
              message: `Tidak dapat mengkonfirmasi ${methodLabel}. Pesanan harus berstatus "ready" terlebih dahulu (saat ini: ${order.orderStatus})`,
            },
          },
          { status: 400 }
        );
      }

      try {
        await completePayment(orderId, {
          method: order.paymentMethod,
          cashReceived: null,
          changeAmount: null,
        });
      } catch (err) {
        if (err instanceof PaymentError) {
          return NextResponse.json(
            { error: { code: err.code, message: err.message } },
            { status: 400 }
          );
        }
        throw err;
      }

      // Notify customer's SSE connection
      try {
        if (order.sseToken) {
          sseManager.broadcastToToken(
            {
              type: "order_completed",
              data: {
                orderId,
                invoiceNumber: order.invoiceNumber,
                orderStatus: "completed",
              },
            },
            order.sseToken
          );
        }
      } catch (err) {
        console.error("SSE broadcast error (order_completed → customer token):", err);
      }

      // Broadcast ke WAREHOUSE dan CASHIER
      try {
        sseManager.broadcastToRole(
          { type: "order_status_updated", data: { orderId, orderStatus: "completed" } },
          ["WAREHOUSE", "CASHIER"]
        );
      } catch (err) {
        console.error("SSE broadcast error (completed → warehouse/cashier):", err);
      }

      return NextResponse.json({ data: { orderId, orderStatus: "completed" } });
    }

    // ── Standard Status Update Path (preparing | ready) ──────────────────────

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

    // Broadcast status update to WAREHOUSE
    try {
      sseManager.broadcastToRole(
        { type: "order_status_updated", data: { orderId, orderStatus } },
        ["WAREHOUSE"]
      );
    } catch (err) {
      console.error("SSE broadcast error (order_status_updated):", err);
    }

    // When order is ready, notify cashier (OFFLINE) or customer SSE token (ONLINE)
    if (orderStatus === "ready") {
      try {
        const cashierId = order.cashierId?.toString();
        if (cashierId) {
          sseManager.broadcastToUser(
            {
              type: "order_ready",
              data: { orderId, invoiceNumber: order.invoiceNumber, orderStatus: "ready" },
            },
            cashierId
          );
        }
      } catch (err) {
        console.error("SSE broadcast error (order_ready → cashier):", err);
      }

      try {
        if (order.orderType === "ONLINE" && order.sseToken) {
          sseManager.broadcastToToken(
            {
              type: "order_ready",
              data: { orderId, invoiceNumber: order.invoiceNumber, orderStatus: "ready" },
            },
            order.sseToken
          );
        }
      } catch (err) {
        console.error("SSE broadcast error (order_ready → customer token):", err);
      }

      // Notifikasi WhatsApp ke pelanggan ONLINE saat pesanan siap
      if (order.orderType === "ONLINE" && order.customerWhatsapp) {
        try {
          await notifyOrderReady({
            customerName: order.customerName,
            customerWhatsapp: order.customerWhatsapp,
            invoiceNumber: order.invoiceNumber,
            totalAmount: order.totalAmount,
            paymentMethod: order.paymentMethod,
          });
        } catch (err) {
          // Kegagalan WA tidak boleh membatalkan update status
          console.error("WhatsApp notification error (order_ready):", err);
        }
      }
    }

    return NextResponse.json({ data: { orderId, orderStatus } });
  } catch (err) {
    console.error(`PATCH /api/orders/${orderId}/status error:`, err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
