import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createReturn, getReturns, ReturnError } from "@/server/services/return.service";

/**
 * POST /api/returns
 * Buat transaksi retur baru. Stok otomatis dikembalikan untuk setiap item.
 * Role: CASHIER only.
 *
 * Body:
 * {
 *   items: [{ productId: string, quantity: number, reason?: string }],
 *   refundMethod: "CASH" | "CREDIT" | "EXCHANGE",
 *   orderId?: string,   // referensi pesanan asli (opsional)
 *   note?: string       // catatan umum (opsional)
 * }
 *
 * Response 201: { data: Return }
 * Response 400: { error: { code, message } }
 */
export async function POST(request) {
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

  try {
    const body = await request.json();
    const { items, refundMethod, orderId, note } = body;

    // Validasi items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Field wajib: items (array tidak kosong)" } },
        { status: 400 }
      );
    }

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
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Setiap item harus memiliki productId (string) dan quantity (bilangan bulat positif)",
          },
        },
        { status: 400 }
      );
    }

    // Validasi refundMethod
    const validMethods = ["CASH", "CREDIT", "EXCHANGE"];
    if (!refundMethod || !validMethods.includes(refundMethod)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `refundMethod harus salah satu dari: ${validMethods.join(", ")}`,
          },
        },
        { status: 400 }
      );
    }

    const returnDoc = await createReturn({
      cashierId: session.user.id,
      items,
      refundMethod,
      orderId: orderId || null,
      note: note || null,
    });

    return NextResponse.json({ data: returnDoc }, { status: 201 });
  } catch (err) {
    if (err instanceof ReturnError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 400 }
      );
    }
    console.error("POST /api/returns error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/returns
 * Ambil daftar retur milik kasir yang sedang login.
 * Role: CASHIER only.
 *
 * Query params:
 *   ?limit=<number>  — jumlah hasil maksimal (default 50)
 *   ?skip=<number>   — offset untuk paginasi (default 0)
 *
 * Response 200: { data: Return[], total: number }
 */
export async function GET(request) {
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

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const skip = parseInt(searchParams.get("skip") || "0", 10);

    const returns = await getReturns({
      cashierId: session.user.id,
      limit,
      skip,
    });

    return NextResponse.json({ data: returns, total: returns.length });
  } catch (err) {
    console.error("GET /api/returns error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
