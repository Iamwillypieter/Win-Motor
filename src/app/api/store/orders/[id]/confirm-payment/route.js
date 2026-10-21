import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import sseManager from "@/lib/sse";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * POST /api/store/orders/[id]/confirm-payment
 * Public endpoint — no staff authentication required.
 * Pelanggan online mengonfirmasi bahwa mereka sudah melakukan pembayaran
 * (e-wallet atau transfer bank). Endpoint ini TIDAK langsung menandai pesanan
 * sebagai "paid" — hanya mengirim sinyal ke gudang untuk memverifikasi.
 *
 * Auth: sseToken dari body digunakan sebagai bukti kepemilikan pesanan.
 * Rate limit: 5 request per menit per IP.
 *
 * Body: { sseToken: string, paymentMethod: string }
 *
 * Response 200: { data: { message: string } }
 * Response 400: { error: { code, message } }
 * Response 401: { error: { code: "UNAUTHORIZED" } }
 * Response 429: rate limited
 */
export async function POST(request, { params }) {
  // Rate limiting
  const ip = getClientIp(request);
  const rateCheck = checkRateLimit(`confirm-payment:${ip}`, 5, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Terlalu banyak permintaan. Coba lagi dalam ${rateCheck.retryAfter} detik.`,
          retryAfter: rateCheck.retryAfter,
        },
      },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } }
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

  const { sseToken } = body;
  const { id: orderId } = params;

  if (!sseToken) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Token tidak valid" } },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    // Validasi: order harus ada, sseToken harus cocok, dan belum dibayar
    const order = await Order.findById(orderId)
      .select("_id invoiceNumber orderType paymentMethod paymentStatus orderStatus sseToken customerName customerWhatsapp totalAmount")
      .lean();

    if (!order) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Pesanan tidak ditemukan" } },
        { status: 404 }
      );
    }

    if (order.sseToken !== sseToken) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Token tidak valid" } },
        { status: 401 }
      );
    }

    if (order.orderType !== "ONLINE") {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Hanya berlaku untuk pesanan online" } },
        { status: 400 }
      );
    }

    if (order.paymentStatus === "paid") {
      return NextResponse.json(
        { error: { code: "ALREADY_PAID", message: "Pesanan sudah dikonfirmasi pembayarannya" } },
        { status: 400 }
      );
    }

    // Broadcast notifikasi ke WAREHOUSE agar staf tahu ada konfirmasi pembayaran
    try {
      sseManager.broadcastToRole(
        {
          type: "payment_submitted",
          data: {
            orderId: order._id.toString(),
            invoiceNumber: order.invoiceNumber,
            paymentMethod: order.paymentMethod,
            totalAmount: order.totalAmount,
            customerName: order.customerName,
          },
        },
        ["WAREHOUSE"]
      );
    } catch (err) {
      console.error("SSE broadcast error (payment_submitted):", err);
    }

    return NextResponse.json({
      data: {
        message: "Konfirmasi pembayaran berhasil dikirim. Tim kami akan memverifikasi dalam beberapa saat.",
      },
    });
  } catch (err) {
    console.error(`POST /api/store/orders/${orderId}/confirm-payment error:`, err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
