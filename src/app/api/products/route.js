import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getProducts,
  createProduct,
  ProductError,
} from "@/server/services/product.service";

/**
 * GET /api/products
 * List active products. Accessible by CASHIER and WAREHOUSE.
 * Query params: ?search=<text>, ?sku=<sku>
 */
export async function GET(request) {
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
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;
    const sku = searchParams.get("sku") || undefined;

    const products = await getProducts({ search, sku });

    return NextResponse.json({ data: products, total: products.length });
  } catch (err) {
    console.error("GET /api/products error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/products
 * Create a new product. Accessible by WAREHOUSE only.
 * Body: { name, sku, price, stock, imageUrl? }
 */
export async function POST(request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Tidak terautentikasi" } },
      { status: 401 }
    );
  }

  if (session.user.role !== "WAREHOUSE" && session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Akses ditolak" } },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { name, sku, price, stock, imageUrl, brand, aliases, category } = body;

    if (!name || !sku || price === undefined || stock === undefined) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Field wajib: name, sku, price, stock",
          },
        },
        { status: 400 }
      );
    }

    if (typeof price !== "number" || price < 0) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Harga harus berupa angka non-negatif",
          },
        },
        { status: 400 }
      );
    }

    if (typeof stock !== "number" || stock < 0) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Stok harus berupa angka non-negatif",
          },
        },
        { status: 400 }
      );
    }

    // Validasi aliases jika ada
    if (aliases !== undefined && !Array.isArray(aliases)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "aliases harus berupa array" } },
        { status: 400 }
      );
    }

    const product = await createProduct({
      name,
      sku,
      price,
      stock,
      imageUrl,
      brand: brand || null,
      category: category || null,
      aliases: aliases || [],
      createdBy: session.user.id,
    });

    return NextResponse.json({ data: product }, { status: 201 });
  } catch (err) {
    if (err instanceof ProductError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 409 }
      );
    }
    console.error("POST /api/products error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
