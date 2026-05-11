import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import sseManager from "@/lib/sse";

/**
 * GET /api/users/online
 * Returns list of currently online user IDs.
 * Role: OWNER only.
 */
export async function GET() {
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

  const onlineUsers = sseManager.getOnlineUsers();

  // Debug: log untuk membantu diagnosa
  console.log("[/api/users/online] SSE client count:", sseManager.clientCount);
  console.log("[/api/users/online] Online users:", JSON.stringify(onlineUsers));

  return NextResponse.json({
    data: onlineUsers,
    count: onlineUsers.length,
  });
}
