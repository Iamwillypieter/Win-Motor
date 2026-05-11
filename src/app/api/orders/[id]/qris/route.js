import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  generateQRIS,
  PaymentError,
  PaymentErrorCode,
} from "@/server/services/payment.service";

/**
 * POST /api/orders/[id]/qris
 * Generate a QRIS code for an order.
 * Role: CASHIER only.
 *
 * Uses a mock payment gateway (UUID as qrisCode) since Midtrans/Xendit
 * requires real API keys. The QR image is rendered via:
 *   https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={qrisCode}
 *
 * Response 200: { data: { qrisCode: string, qrisExpiresAt: string, qrImageUrl: string } }
 * Response 400: { error: { code, message } }
 * Response 403: { error: { code, message } }
 * Response 404: { error: { code, message } }
 */
export async function POST(request, { params }) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (session.user.role !== "CASHIER") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak. Hanya kasir." } },
      { status: 403 }
    );
  }

  const { id: orderId } = params;

  try {
    const { qrisCode, qrisExpiresAt } = await generateQRIS(orderId);

    // Build QR image URL using free QR code API
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrisCode)}`;

    return NextResponse.json({
      data: {
        qrisCode,
        qrisExpiresAt: qrisExpiresAt.toISOString(),
        qrImageUrl,
      },
    });
  } catch (err) {
    if (err instanceof PaymentError) {
      const statusMap = {
        [PaymentErrorCode.ORDER_NOT_FOUND]: 404,
        [PaymentErrorCode.ALREADY_PAID]: 400,
      };
      const status = statusMap[err.code] || 400;
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status }
      );
    }
    console.error(`POST /api/orders/${orderId}/qris error:`, err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
