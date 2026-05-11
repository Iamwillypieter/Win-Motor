"use server";

import { auth } from "@/lib/auth";

/**
 * Server Action: Confirm Cash payment for an order.
 * Only accessible by CASHIER role.
 *
 * @param {string} orderId - Order ObjectId string
 * @param {number} cashReceived - Amount of cash received (integer rupiah)
 * @returns {{ success: boolean, data?: { invoice: Object, changeAmount: number }, error?: { code: string, message: string } }}
 */
export async function confirmCashPayment(orderId, cashReceived) {
  const session = await auth();

  if (!session?.user || session.user.role !== "CASHIER") {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "Akses ditolak" },
    };
  }

  if (!orderId) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "orderId wajib diisi" },
    };
  }

  if (
    typeof cashReceived !== "number" ||
    !Number.isInteger(cashReceived) ||
    cashReceived < 0
  ) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "cashReceived harus berupa bilangan bulat positif (rupiah)",
      },
    };
  }

  try {
    const response = await fetch(
      `${process.env.NEXTAUTH_URL || ""}/api/orders/${orderId}/payment`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Pass session cookie for authentication
          Cookie: `next-auth.session-token=${session?.sessionToken ?? ""}`,
        },
        body: JSON.stringify({ cashReceived }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error || {
          code: "INTERNAL_ERROR",
          message: "Terjadi kesalahan server",
        },
      };
    }

    return { success: true, data: result.data };
  } catch (err) {
    console.error("confirmCashPayment action error:", err);
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" },
    };
  }
}

/**
 * Server Action: Generate a QRIS code for an order.
 * Only accessible by CASHIER role.
 *
 * @param {string} orderId - Order ObjectId string
 * @returns {{ success: boolean, data?: { qrisCode: string, qrisExpiresAt: string, qrImageUrl: string }, error?: { code: string, message: string } }}
 */
export async function generateQRISCode(orderId) {
  const session = await auth();

  if (!session?.user || session.user.role !== "CASHIER") {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "Akses ditolak" },
    };
  }

  if (!orderId) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "orderId wajib diisi" },
    };
  }

  try {
    const response = await fetch(
      `${process.env.NEXTAUTH_URL || ""}/api/orders/${orderId}/qris`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `next-auth.session-token=${session?.sessionToken ?? ""}`,
        },
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error || {
          code: "INTERNAL_ERROR",
          message: "Terjadi kesalahan server",
        },
      };
    }

    return { success: true, data: result.data };
  } catch (err) {
    console.error("generateQRISCode action error:", err);
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan server" },
    };
  }
}
