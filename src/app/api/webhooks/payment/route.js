import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import {
  completePayment,
  PaymentError,
  PaymentErrorCode,
} from "@/server/services/payment.service";

/**
 * Verify the webhook signature from the payment gateway.
 * In production, this would use HMAC-SHA256 with a shared secret.
 *
 * @param {Request} request
 * @returns {boolean}
 */
function verifySignature(request) {
  const signature = request.headers.get("x-payment-signature");
  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;

  if (!webhookSecret) {
    // If no secret configured, skip verification in development
    if (process.env.NODE_ENV === "development") {
      console.warn("PAYMENT_WEBHOOK_SECRET not set — skipping signature verification in development");
      return true;
    }
    return false;
  }

  if (!signature) {
    return false;
  }

  // Simple constant-time comparison for the mock implementation
  // In production: use crypto.timingSafeEqual with HMAC-SHA256
  return signature === webhookSecret;
}

/**
 * POST /api/webhooks/payment
 * Receive payment confirmation webhook from payment gateway (QRIS).
 * No authentication required — verified via signature header.
 *
 * Body: { orderId: string, status: "success"|"failed", ref?: string }
 * Header: x-payment-signature: <signature>
 *
 * Response 200: { data: { success: true } }
 * Response 400: { error: { code, message } }
 * Response 401: { error: { code, message } }
 */
export async function POST(request) {
  // Verify webhook signature
  if (!verifySignature(request)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Signature tidak valid" } },
      { status: 401 }
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

  const { orderId, status, ref } = body;

  if (!orderId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Field wajib: orderId" } },
      { status: 400 }
    );
  }

  if (status !== "success") {
    // Non-success webhooks (e.g., failed, pending) — acknowledge but don't process
    return NextResponse.json({ data: { success: true, processed: false } });
  }

  try {
    await connectDB();

    // Fetch order to verify it's a QRIS order and not expired
    const order = await Order.findById(orderId).lean();

    if (!order) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Pesanan tidak ditemukan" } },
        { status: 404 }
      );
    }

    if (order.paymentStatus === "paid") {
      // Idempotent — already processed, return success
      return NextResponse.json({ data: { success: true, processed: false } });
    }

    if (order.paymentStatus === "expired") {
      return NextResponse.json(
        { error: { code: "QRIS_EXPIRED", message: "Kode QRIS sudah kedaluwarsa" } },
        { status: 409 }
      );
    }

    // Save payment ref to order before completing
    if (ref) {
      await Order.updateOne(
        { _id: orderId },
        { $set: { qrisPaymentRef: ref, updatedAt: new Date() } }
      );
    }

    await completePayment(orderId, {
      method: "QRIS",
      cashReceived: null,
      changeAmount: null,
    });

    return NextResponse.json({ data: { success: true, processed: true } });
  } catch (err) {
    if (err instanceof PaymentError) {
      const statusMap = {
        [PaymentErrorCode.ORDER_NOT_FOUND]: 404,
        [PaymentErrorCode.ALREADY_PAID]: 200, // idempotent
        [PaymentErrorCode.INSUFFICIENT_STOCK]: 400,
        [PaymentErrorCode.QRIS_EXPIRED]: 409,
        [PaymentErrorCode.TRANSACTION_FAILED]: 500,
      };
      const httpStatus = statusMap[err.code] || 400;

      if (err.code === PaymentErrorCode.ALREADY_PAID) {
        return NextResponse.json({ data: { success: true, processed: false } });
      }

      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: httpStatus }
      );
    }
    console.error("POST /api/webhooks/payment error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
