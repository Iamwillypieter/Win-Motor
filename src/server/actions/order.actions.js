"use server";

import { auth } from "@/lib/auth";
import {
  createOrder as createOrderService,
  OrderError,
} from "@/server/services/order.service";

/**
 * Server Action: Create a new order from the cashier's cart.
 * Only accessible by CASHIER role.
 *
 * @param {Array<{productId: string, quantity: number}>} items - Cart items
 * @param {string} [customerName] - Nama pelanggan (opsional)
 * @returns {{ success: boolean, data?: Object, error?: { code: string, message: string } }}
 */
export async function createOrderAction(items, customerName = null) {
  const session = await auth();

  if (!session?.user || session.user.role !== "CASHIER") {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "Akses ditolak" },
    };
  }

  // Debug: log customerName yang diterima
  console.log("[createOrderAction] customerName received:", customerName);

  try {
    const order = await createOrderService(session.user.id, items, customerName);
    console.log("[createOrderAction] order.customerName saved:", order.customerName);
    return { success: true, data: order };
  } catch (err) {
    if (err instanceof OrderError) {
      return {
        success: false,
        error: { code: err.code, message: err.message },
      };
    }
    console.error("createOrderAction error:", err);
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" },
    };
  }
}
