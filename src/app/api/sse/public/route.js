import connectDB from "@/lib/db";
import Order from "@/models/Order";
import sseManager from "@/lib/sse";

// Token validity window: 24 hours
const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/sse/public?token=<sseToken>
 * Public SSE endpoint — no authentication required.
 *
 * Allows a customer to subscribe to real-time status updates for their order.
 * The token is the one-time UUID stored in Order.sseToken, returned when the
 * order was created via POST /api/store/orders.
 *
 * Validation:
 *  - token query param must be present
 *  - An Order with matching sseToken must exist
 *  - The order must have been created within the last 24 hours
 *
 * Events sent to the customer:
 *  - payment_confirmed  — paymentStatus changed to "paid"
 *  - order_ready        — orderStatus changed to "ready"
 *  - qris_expired       — QRIS code expired without payment
 *
 * The SSE connection is registered in SSEManager with the sseToken as the
 * lookup key so that broadcastToToken() can target it.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token || !token.trim()) {
    return new Response(
      JSON.stringify({ error: { code: "MISSING_TOKEN", message: "Token wajib disertakan" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // --- Validate token against the database ---
  try {
    await connectDB();
  } catch {
    return new Response(
      JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const order = await Order.findOne({ sseToken: token })
    .select("_id sseToken createdAt")
    .lean();

  if (!order) {
    return new Response(
      JSON.stringify({ error: { code: "INVALID_TOKEN", message: "Token tidak valid" } }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check token age (24-hour window)
  const tokenAge = Date.now() - new Date(order.createdAt).getTime();
  if (tokenAge > TOKEN_MAX_AGE_MS) {
    return new Response(
      JSON.stringify({ error: { code: "TOKEN_EXPIRED", message: "Token sudah kedaluwarsa" } }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // --- Establish SSE stream ---
  // Use sseToken as part of the clientId so broadcastToToken() can find it
  const clientId = `public-${token}-${Date.now()}`;

  let controller;

  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl;
      // Register with sseToken so broadcastToToken() can target this connection
      sseManager.register(clientId, null, null, controller, token);
    },
    cancel() {
      sseManager.unregister(clientId);
    },
  });

  // Clean up when the request is aborted (browser tab closed, navigation, etc.)
  request.signal.addEventListener("abort", () => {
    sseManager.unregister(clientId);
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering for SSE
    },
  });
}
