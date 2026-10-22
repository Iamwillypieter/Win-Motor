import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";
import {
  completePayment,
  PaymentError,
  PaymentErrorCode,
} from "@/server/services/payment.service";

/**
 * POST /api/orders/[id]/payment
 * Confirm Cash payment for an order.
 * Role: CASHIER only.
 *
 * Body: { cashReceived: number }
 * Response 200: { data: { invoice: Object, changeAmount: number } }
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Body tidak valid" } },
      { status: 400 }
    );
  }

  const { cashReceived } = body;

  if (cashReceived === undefined || cashReceived === null) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Field wajib: cashReceived",
        },
      },
      { status: 400 }
    );
  }

  if (typeof cashReceived !== "number" || !Number.isInteger(cashReceived) || cashReceived < 0) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "cashReceived harus berupa bilangan bulat positif (rupiah)",
        },
      },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    // Fetch order to validate cashReceived >= totalAmount
    const order = await Order.findById(orderId).lean();

    if (!order) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Pesanan tidak ditemukan" } },
        { status: 404 }
      );
    }

    if (cashReceived < order.totalAmount) {
      return NextResponse.json(
        {
          error: {
            code: "INSUFFICIENT_CASH",
            message: `Uang yang diterima (${cashReceived}) kurang dari total pesanan (${order.totalAmount})`,
          },
        },
        { status: 400 }
      );
    }

    const changeAmount = cashReceived - order.totalAmount;

    const invoice = await completePayment(orderId, {
      method: "CASH",
      cashReceived,
      changeAmount,
    });

    // Serialize invoice for JSON response
    const invoiceData = {
      ...invoice,
      _id: invoice._id?.toString(),
      orderId: invoice.orderId?.toString(),
      transactionAt: invoice.transactionAt?.toISOString?.() ?? invoice.transactionAt,
      createdAt: invoice.createdAt?.toISOString?.() ?? invoice.createdAt,
    };

    return NextResponse.json({
      data: {
        invoice: invoiceData,
        changeAmount,
      },
    });
  } catch (err) {
    if (err instanceof PaymentError) {
      const statusMap = {
        [PaymentErrorCode.ORDER_NOT_FOUND]: 404,
        [PaymentErrorCode.ALREADY_PAID]: 400,
        [PaymentErrorCode.INSUFFICIENT_STOCK]: 400,
        [PaymentErrorCode.QRIS_EXPIRED]: 409,
        [PaymentErrorCode.TRANSACTION_FAILED]: 500,
      };
      const status = statusMap[err.code] || 400;
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status }
      );
    }
    console.error(`POST /api/orders/${orderId}/payment error:`, err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
