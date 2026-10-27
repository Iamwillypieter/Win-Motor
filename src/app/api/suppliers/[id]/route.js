import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import Supplier from "@/models/Supplier";

/**
 * GET /api/suppliers/[id]
 * Ambil detail satu supplier.
 * Role: WAREHOUSE, OWNER
 */
export async function GET(request, { params }) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (!["WAREHOUSE", "OWNER"].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak" } },
      { status: 403 }
    );
  }

  const safeId = params.id.replace(/[^a-fA-F0-9]/g, "");
  if (!safeId || safeId.length !== 24) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID supplier tidak valid" } },
      { status: 400 }
    );
  }

  await connectDB();

  const supplier = await Supplier.findById(safeId).lean();
  if (!supplier) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Supplier tidak ditemukan" } },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: supplier });
}

/**
 * PATCH /api/suppliers/[id]
 * Update data supplier.
 * Role: WAREHOUSE, OWNER
 *
 * Body (semua opsional): { name?, contactName?, phone?, email?, address?, notes?, isActive? }
 */
export async function PATCH(request, { params }) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (!["WAREHOUSE", "OWNER"].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak" } },
      { status: 403 }
    );
  }

  const safeId = params.id.replace(/[^a-fA-F0-9]/g, "");
  if (!safeId || safeId.length !== 24) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID supplier tidak valid" } },
      { status: 400 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Body tidak valid" } },
      { status: 400 }
    );
  }

  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Format email tidak valid" } },
      { status: 400 }
    );
  }

  const allowed = ["name", "contactName", "phone", "email", "address", "notes", "isActive"];
  const updates = { updatedAt: new Date() };
  for (const field of allowed) {
    if (body[field] !== undefined) {
      if (field === "isActive") {
        updates.isActive = Boolean(body.isActive);
      } else if (field === "email") {
        updates.email = body.email?.trim().toLowerCase() || null;
      } else {
        updates[field] = typeof body[field] === "string" ? body[field].trim() || null : body[field];
      }
    }
  }

  try {
    await connectDB();

    const supplier = await Supplier.findByIdAndUpdate(
      safeId,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!supplier) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Supplier tidak ditemukan" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: supplier });
  } catch (err) {
    if (err.code === 11000) {
      return NextResponse.json(
        { error: { code: "DUPLICATE_NAME", message: "Nama supplier sudah terdaftar" } },
        { status: 409 }
      );
    }
    console.error("PATCH /api/suppliers/:id error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/suppliers/[id]
 * Soft-delete supplier (set isActive = false).
 * Role: OWNER only
 */
export async function DELETE(request, { params }) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Hanya owner yang dapat menghapus supplier" } },
      { status: 403 }
    );
  }

  const safeId = params.id.replace(/[^a-fA-F0-9]/g, "");
  if (!safeId || safeId.length !== 24) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID supplier tidak valid" } },
      { status: 400 }
    );
  }

  await connectDB();

  const supplier = await Supplier.findByIdAndUpdate(
    safeId,
    { $set: { isActive: false, updatedAt: new Date() } },
    { new: true }
  ).lean();

  if (!supplier) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Supplier tidak ditemukan" } },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: { message: "Supplier berhasil dinonaktifkan" } });
}
