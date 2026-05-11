import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names using clsx and tailwind-merge.
 * @param {...any} inputs - Class name inputs
 * @returns {string} Merged class string
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Format an integer rupiah amount to Indonesian currency string.
 * Example: 25000 → "Rp 25.000"
 * @param {number} amount - Integer amount in rupiah
 * @returns {string} Formatted rupiah string
 */
export function formatRupiah(amount) {
  if (typeof amount !== "number" || isNaN(amount)) {
    return "Rp 0";
  }

  const formatted = Math.abs(Math.floor(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return amount < 0 ? `Rp -${formatted}` : `Rp ${formatted}`;
}

/**
 * Calculate change amount for cash payment.
 * @param {number} cashReceived - Amount of cash received from customer (integer rupiah)
 * @param {number} totalAmount - Total order amount (integer rupiah)
 * @returns {number} Change amount (cashReceived - totalAmount)
 */
export function calculateChange(cashReceived, totalAmount) {
  return cashReceived - totalAmount;
}
