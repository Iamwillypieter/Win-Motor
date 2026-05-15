import { NextResponse } from "next/server";
import { createOnlineOrder, OrderError } from "@/server/services/order.service";
import { checkRateLimit } from "@/lib/rateLimit";

/**
 * POST /api/store/orders
 * Public endpoint — no authentication required.
 * Creates a new online order from a customer's cart.
 *
 * Rate limit: 10 requests per minute per IP.
 *
 * Body:
 * {
 *   items: [{ productId: string, quantity: number }],
 *   customerName: string,
 *   customerWhatsapp: string,   // 08xx or +62xx, 10–15 digits
 *   shippingAddress: string,
 *   paymentMethod: "CASH" | "QRIS" | "EWALLET_DANA" | "EWALLET_OVO" | "EWALLET_GOPAY" | "BANK_TRANSFER"
 * }
 *
 * Response 201:
 * {
 *   data: {
 *     _id, invoiceNumber, orderType, orderStatus, paymentStatus,
 *     paymentMethod, totalAmount, customerName, shippingAddress,
 *     sseToken, items, createdAt, ...
 *   }
 * }
 *
 * Response 400: { error: { code, message } }
 * Response 429: { error: { code: "RATE_LIMIT_EXCEEDED", message, retryAfter } }
 */
export async function POST(request) {
  // --- Rate limiting ---
  // Prefer x-forwarded-for (set by proxies/load balancers) then fall back to a
  // generic identifier so the server never crashes on missing headers.
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

  const rateCheck = checkRateLimit(ip, 10, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Terlalu banyak permintaan. Coba lagi dalam ${rateCheck.retryAfter} detik.`,
          retryAfter: rateCheck.retryAfter,
        },
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateCheck.retryAfter) },
      }
    );
  }

  // --- Parse body ---
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Request body tidak valid (bukan JSON)" } },
      { status: 400 }
    );
  }

  const { items, customerName, customerWhatsapp, shippingAddress, paymentMethod } = body;

  // --- Basic presence validation (detailed validation is in the service) ---
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Field wajib: items (array tidak kosong)" } },
      { status: 400 }
    );
  }

  // --- Delegate to service ---
  try {
    const order = await createOnlineOrder({
      items,
      customerName,
      customerWhatsapp,
      shippingAddress,
      paymentMethod,
    });

    return NextResponse.json({ data: order }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 400 }
      );
    }

    console.error("POST /api/store/orders error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
