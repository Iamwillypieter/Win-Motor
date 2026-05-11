import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getProductById,
  updateProduct,
  softDeleteProduct,
  ProductError,
} from "@/server/services/product.service";
import { ProductErrorCode } from "@/types/product.types";

/**
 * GET /api/products/:id
 * Get product detail. Accessible by WAREHOUSE.
 */
export async function GET(request, { params }) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (!["CASHIER", "WAREHOUSE"].includes(session.user.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak" } },
      { status: 403 }
    );
  }

  try {
    const product = await getProductById(params.id);
    return NextResponse.json({ data: product });
  } catch (err) {
    if (err instanceof ProductError && err.code === ProductErrorCode.PRODUCT_NOT_FOUND) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 404 }
      );
    }
    console.error("GET /api/products/:id error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/products/:id
 * Update product (name, price, stock, imageUrl). Accessible by WAREHOUSE only.
 */
export async function PATCH(request, { params }) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (session.user.role !== "WAREHOUSE") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak" } },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const product = await updateProduct(params.id, body);
    return NextResponse.json({ data: product });
  } catch (err) {
    if (err instanceof ProductError) {
      const status = err.code === ProductErrorCode.PRODUCT_NOT_FOUND ? 404 : 400;
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status }
      );
    }
    console.error("PATCH /api/products/:id error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/products/:id
 * Soft-delete a product (sets isActive: false). Accessible by WAREHOUSE only.
 */
export async function DELETE(request, { params }) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (session.user.role !== "WAREHOUSE") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak" } },
      { status: 403 }
    );
  }

  try {
    const product = await softDeleteProduct(params.id);
    return NextResponse.json({ data: product });
  } catch (err) {
    if (err instanceof ProductError && err.code === ProductErrorCode.PRODUCT_NOT_FOUND) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 404 }
      );
    }
    console.error("DELETE /api/products/:id error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
