import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import sseManager from "@/lib/sse";

/**
 * POST /api/users/[id]/logout
 * Force logout a user by sending a logout SSE event to all their connections.
 * Role: OWNER only.
 */
export async function POST(request, { params }) {
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

  const { id: targetUserId } = params;

  // Kirim event force_logout ke semua koneksi SSE user tersebut
  sseManager.broadcastToUser(
    { type: "force_logout", data: { reason: "Logged out by owner" } },
    targetUserId
  );

  return NextResponse.json({ success: true });
}
