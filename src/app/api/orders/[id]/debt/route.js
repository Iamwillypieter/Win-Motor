import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  completeDebtOrder,
  settleDebt,
  PaymentError,
} from "@/server/services/payment.service";

/**
 * POST /api/orders/:id/debt
 * Kasir mencatat pesanan sebagai utang.
 * - Stok dikurangi atomik
 * - orderStatus → "completed", paymentStatus tetap "pending"
 * - Invoice dibuat dengan paymentMethod: "DEBT"
 *
 * Role: CASHIER
 * Body: { dueDate?: string (ISO), note?: string }
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
      { error: { code: "FORBIDDEN", message: "Akses ditolak" } },
      { status: 403 }
    );
  }

  const safeId = params.id.replace(/[^a-fA-F0-9]/g, "");
  if (!safeId || safeId.length !== 24) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID pesanan tidak valid" } },
      { status: 400 }
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    // body opsional — lanjut dengan default kosong
  }

  const { dueDate, note, itemDiscounts } = body;

  if (dueDate) {
    const parsed = new Date(dueDate);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Format tanggal jatuh tempo tidak valid" } },
        { status: 400 }
      );
    }
  }

  if (note && typeof note !== "string") {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Catatan harus berupa teks" } },
      { status: 400 }
    );
  }

  if (itemDiscounts !== undefined) {
    if (!Array.isArray(itemDiscounts)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "itemDiscounts harus berupa array" } },
        { status: 400 }
      );
    }
    for (const d of itemDiscounts) {
      if (typeof d.discountPercent !== "number" || d.discountPercent < 0 || d.discountPercent > 100) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "discountPercent harus angka 0–100" } },
          { status: 400 }
        );
      }
    }
  }

  try {
    const invoice = await completeDebtOrder(safeId, { dueDate, note, itemDiscounts: itemDiscounts ?? [] });

    return NextResponse.json({ data: { invoice } }, { status: 200 });
  } catch (err) {
    if (err instanceof PaymentError) {
      const statusMap = {
        ORDER_NOT_FOUND: 404,
        ALREADY_PAID: 409,
        ORDER_NOT_READY: 422,
        CUSTOMER_NAME_REQUIRED: 422,
        INSUFFICIENT_STOCK: 422,
      };
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: statusMap[err.code] ?? 400 }
      );
    }
    console.error("POST /api/orders/:id/debt error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/orders/:id/debt
 * Owner melunasi utang pelanggan.
 * - paymentStatus → "paid"
 * - debtPaidAt, debtPaidBy diisi
 *
 * Role: OWNER
 */
export async function PATCH(request, { params }) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak" } },
      { status: 403 }
    );
  }

  const safeId = params.id.replace(/[^a-fA-F0-9]/g, "");
  if (!safeId || safeId.length !== 24) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID pesanan tidak valid" } },
      { status: 400 }
    );
  }

  try {
    const order = await settleDebt(safeId, session.user.id);

    return NextResponse.json({ data: { order } }, { status: 200 });
  } catch (err) {
    if (err instanceof PaymentError) {
      const statusMap = {
        ORDER_NOT_FOUND: 404,
        ALREADY_PAID: 409,
        NOT_A_DEBT: 422,
      };
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: statusMap[err.code] ?? 400 }
      );
    }
    console.error("PATCH /api/orders/:id/debt error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
