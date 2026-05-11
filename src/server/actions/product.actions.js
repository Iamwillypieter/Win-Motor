"use server";

import { auth } from "@/lib/auth";
import {
  createProduct,
  updateProduct,
  softDeleteProduct,
  ProductError,
} from "@/server/services/product.service";

/**
 * Server Action: Create a new product.
 * Only accessible by WAREHOUSE role.
 * @param {Object} formData
 * @returns {{ success: boolean, data?: Object, error?: { code: string, message: string } }}
 */
export async function createProductAction(formData) {
  const session = await auth();

  if (!session?.user || session.user.role !== "WAREHOUSE") {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "Akses ditolak" },
    };
  }

  try {
    const product = await createProduct({
      name: formData.name,
      sku: formData.sku,
      price: Number(formData.price),
      stock: Number(formData.stock),
      imageUrl: formData.imageUrl || null,
      createdBy: session.user.id,
    });

    return { success: true, data: product };
  } catch (err) {
    if (err instanceof ProductError) {
      return {
        success: false,
        error: { code: err.code, message: err.message },
      };
    }
    console.error("createProductAction error:", err);
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" },
    };
  }
}

/**
 * Server Action: Update an existing product.
 * Only accessible by WAREHOUSE role.
 * @param {string} id - Product ObjectId string
 * @param {Object} updates - Fields to update
 * @returns {{ success: boolean, data?: Object, error?: { code: string, message: string } }}
 */
export async function updateProductAction(id, updates) {
  const session = await auth();

  if (!session?.user || session.user.role !== "WAREHOUSE") {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "Akses ditolak" },
    };
  }

  try {
    const product = await updateProduct(id, updates);
    return { success: true, data: product };
  } catch (err) {
    if (err instanceof ProductError) {
      return {
        success: false,
        error: { code: err.code, message: err.message },
      };
    }
    console.error("updateProductAction error:", err);
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" },
    };
  }
}

/**
 * Server Action: Soft-delete a product.
 * Only accessible by WAREHOUSE role.
 * @param {string} id - Product ObjectId string
 * @returns {{ success: boolean, data?: Object, error?: { code: string, message: string } }}
 */
export async function deleteProductAction(id) {
  const session = await auth();

  if (!session?.user || session.user.role !== "WAREHOUSE") {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "Akses ditolak" },
    };
  }

  try {
    const product = await softDeleteProduct(id);
    return { success: true, data: product };
  } catch (err) {
    if (err instanceof ProductError) {
      return {
        success: false,
        error: { code: err.code, message: err.message },
      };
    }
    console.error("deleteProductAction error:", err);
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" },
    };
  }
}
