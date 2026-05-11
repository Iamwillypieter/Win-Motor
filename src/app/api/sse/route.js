import { auth } from "@/lib/auth";
import sseManager from "@/lib/sse";

/**
 * GET /api/sse
 * Establishes a Server-Sent Events connection for the authenticated user.
 *
 * - Authenticates via NextAuth session
 * - Registers the client in SSEManager
 * - Cleans up on client disconnect (abort signal)
 *
 * Headers:
 *   Content-Type: text/event-stream
 *   Cache-Control: no-cache
 *   Connection: keep-alive
 */
export async function GET(request) {
  const session = await auth();

  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const { id: userId, role } = session.user;

  // Unique client ID: userId + timestamp
  const clientId = `${userId}-${Date.now()}`;

  let controller;

  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl;
      sseManager.register(clientId, userId, role, controller);
    },
    cancel() {
      // Called when the client disconnects
      sseManager.unregister(clientId);
    },
  });

  // Also clean up when the request is aborted (browser tab closed, navigation, etc.)
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
