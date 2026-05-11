import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";

/**
 * PATCH /api/users/[id]
 * Update user (nama, role, isActive, password). Role: OWNER only.
 */
export async function PATCH(req, { params }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
  }
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak" } }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, role, isActive, password } = body;

    await connectDB();

    const user = await User.findById(params.id);
    if (!user) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "User tidak ditemukan" } }, { status: 404 });
    }

    if (name !== undefined) user.name = name.trim();
    if (role !== undefined) {
      if (!["CASHIER", "WAREHOUSE", "OWNER"].includes(role)) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Role tidak valid" } },
          { status: 400 }
        );
      }
      user.role = role;
    }
    if (isActive !== undefined) user.isActive = isActive;
    if (password !== undefined) {
      if (password.length < 6) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Password minimal 6 karakter" } },
          { status: 400 }
        );
      }
      user.password = await bcrypt.hash(password, 10);
    }

    user.updatedAt = new Date();
    await user.save();

    return NextResponse.json({
      data: {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        updatedAt: user.updatedAt?.toISOString(),
      },
    });
  } catch (err) {
    console.error("PATCH /api/users/[id] error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } }, { status: 500 });
  }
}

/**
 * DELETE /api/users/[id]
 * Nonaktifkan user (soft delete via isActive: false). Role: OWNER only.
 * Owner tidak bisa menonaktifkan dirinya sendiri.
 */
export async function DELETE(req, { params }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
  }
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak" } }, { status: 403 });
  }

  if (session.user.id === params.id) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Tidak dapat menonaktifkan akun sendiri" } },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const user = await User.findByIdAndUpdate(
      params.id,
      { isActive: false, updatedAt: new Date() },
      { new: true }
    );

    if (!user) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "User tidak ditemukan" } }, { status: 404 });
    }

    return NextResponse.json({ data: { _id: user._id.toString(), isActive: false } });
  } catch (err) {
    console.error("DELETE /api/users/[id] error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } }, { status: 500 });
  }
}
