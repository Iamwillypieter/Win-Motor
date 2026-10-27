import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/db";
import Supplier from "@/models/Supplier";

/**
 * GET /api/suppliers
 * Ambil daftar supplier aktif.
 * Role: WAREHOUSE, OWNER
 *
 * Query params:
 *   ?search=<string>  — filter nama supplier (opsional)
 *   ?all=1            — sertakan supplier tidak aktif (hanya OWNER)
 *
 * Response 200: { data: Supplier[] }
 */
export async function GET(request) {
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

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || "";
  const includeInactive = searchParams.get("all") === "1" && session.user.role === "OWNER";

  await connectDB();

  const query = includeInactive ? {} : { isActive: true };

  if (search) {
    if (search.length >= 3) {
      query.$text = { $search: search };
    } else {
      query.name = new RegExp(search, "i");
    }
  }

  const suppliers = await Supplier.find(query).sort({ name: 1 }).lean();

  return NextResponse.json({ data: suppliers });
}

/**
 * POST /api/suppliers
 * Buat supplier baru.
 * Role: WAREHOUSE, OWNER
 *
 * Body: { name, contactName?, phone?, email?, address?, notes? }
 * Response 201: { data: Supplier }
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

  if (!["WAREHOUSE", "OWNER"].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak" } },
      { status: 403 }
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

  const { name, contactName, phone, email, address, notes } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Nama supplier wajib diisi" } },
      { status: 400 }
    );
  }

  // Validasi email sederhana jika diberikan
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Format email tidak valid" } },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    const supplier = await Supplier.create({
      name: name.trim(),
      contactName: contactName?.trim() || null,
      phone: phone?.trim() || null,
      email: email?.trim().toLowerCase() || null,
      address: address?.trim() || null,
      notes: notes?.trim() || null,
      createdBy: session.user.id,
    });

    return NextResponse.json({ data: supplier.toObject() }, { status: 201 });
  } catch (err) {
    // Duplicate key (nama supplier sudah ada)
    if (err.code === 11000) {
      return NextResponse.json(
        { error: { code: "DUPLICATE_NAME", message: "Nama supplier sudah terdaftar" } },
        { status: 409 }
      );
    }
    console.error("POST /api/suppliers error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
