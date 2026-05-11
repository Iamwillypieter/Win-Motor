import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import Invoice from "@/models/Invoice";

/**
 * GET /api/invoices/[orderId]
 * Fetch invoice by orderId.
 * Role: CASHIER, OWNER.
 */
export async function GET(request, { params }) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (!["CASHIER", "OWNER"].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak" } },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const invoice = await Invoice.findOne({ orderId: params.orderId }).lean();

    if (!invoice) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Invoice tidak ditemukan" } },
        { status: 404 }
      );
    }

    const serialized = {
      ...invoice,
      _id: invoice._id.toString(),
      orderId: invoice.orderId.toString(),
      transactionAt: invoice.transactionAt?.toISOString() ?? null,
      createdAt: invoice.createdAt?.toISOString() ?? null,
      items: invoice.items.map((item) => ({
        ...item,
        _id: item._id?.toString(),
      })),
    };

    return NextResponse.json({ data: serialized });
  } catch (err) {
    console.error("GET /api/invoices/[orderId] error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
