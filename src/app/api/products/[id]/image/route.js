import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { auth } from "@/lib/auth";
import {
  updateProduct,
  validateImageFile,
  ProductError,
} from "@/server/services/product.service";
import { ProductErrorCode } from "@/types/product.types";

/**
 * POST /api/products/:id/image
 * Upload a product image. Accessible by WAREHOUSE only.
 * Accepts multipart/form-data with a "image" field.
 * Validates format (JPG/PNG/WEBP) and size (max 2MB).
 * Saves to public/uploads/ directory.
 */
export async function POST(request, { params }) {
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
    const formData = await request.formData();
    const file = formData.get("image");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "File gambar wajib diunggah dengan field 'image'",
          },
        },
        { status: 400 }
      );
    }

    // Validate MIME type and size
    validateImageFile(file.type, file.size);

    // Determine file extension from MIME type
    const extensionMap = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
    };
    const ext = extensionMap[file.type];
    const filename = `product-${params.id}-${Date.now()}${ext}`;

    // Save to public/uploads/
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(uploadsDir, filename);
    await writeFile(filePath, buffer);

    const imageUrl = `/uploads/${filename}`;

    // Update product with new imageUrl
    const product = await updateProduct(params.id, { imageUrl });

    return NextResponse.json({ data: { imageUrl, product } }, { status: 200 });
  } catch (err) {
    if (err instanceof ProductError) {
      const status =
        err.code === ProductErrorCode.PRODUCT_NOT_FOUND
          ? 404
          : err.code === ProductErrorCode.INVALID_IMAGE_FORMAT ||
            err.code === ProductErrorCode.IMAGE_TOO_LARGE
          ? 400
          : 400;
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status }
      );
    }
    console.error("POST /api/products/:id/image error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
