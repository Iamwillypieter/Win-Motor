import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";

/**
 * GET /api/users
 * List semua user. Role: OWNER only.
 */
export async function GET(req) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
  }
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak" } }, { status: 403 });
  }

  try {
    await connectDB();
    const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 }).lean();
    const serialized = users.map((u) => ({
      ...u,
      _id: u._id.toString(),
      createdAt: u.createdAt?.toISOString() ?? null,
      updatedAt: u.updatedAt?.toISOString() ?? null,
    }));
    return NextResponse.json({ data: serialized });
  } catch (err) {
    console.error("GET /api/users error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } }, { status: 500 });
  }
}

/**
 * POST /api/users
 * Buat user baru. Role: OWNER only.
 */
export async function POST(req) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
  }
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak" } }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, email, password, role } = body;

    if (!name || !email || !password || !role) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Semua field wajib diisi" } },
        { status: 400 }
      );
    }

    if (!["CASHIER", "WAREHOUSE", "OWNER"].includes(role)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Role tidak valid" } },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Password minimal 6 karakter" } },
        { status: 400 }
      );
    }

    await connectDB();

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return NextResponse.json(
        { error: { code: "DUPLICATE_EMAIL", message: "Email sudah digunakan" } },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role,
      isActive: true,
    });

    return NextResponse.json(
      {
        data: {
          _id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/users error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } }, { status: 500 });
  }
}
