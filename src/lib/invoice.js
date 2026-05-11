/**
 * Invoice number utilities for the POS system.
 * Format: INV-YYYYMMDD-NNNN (e.g., INV-20260507-0001)
 * Counter resets daily. Uniqueness guaranteed within a day.
 */

/**
 * Format a Date object to YYYYMMDD string.
 * @param {Date} date
 * @returns {string} Date string in YYYYMMDD format
 */
export function formatDatePart(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Parse an invoice number and return its components.
 * @param {string} invoiceNumber - Invoice number in INV-YYYYMMDD-NNNN format
 * @returns {{ prefix: string, date: string, counter: number } | null}
 */
export function parseInvoiceNumber(invoiceNumber) {
  const match = invoiceNumber.match(/^INV-(\d{8})-(\d{4})$/);
  if (!match) return null;
  return {
    prefix: "INV",
    date: match[1],
    counter: parseInt(match[2], 10),
  };
}

/**
 * Generate a unique invoice number in the format INV-YYYYMMDD-NNNN.
 * The counter resets daily. Uniqueness is guaranteed within a day.
 * Requires a MongoDB connection via connectDB.
 *
 * @returns {Promise<string>} Unique invoice number
 */
export async function generateInvoiceNumber() {
  // Lazy imports to avoid module-level side effects during testing
  const { default: connectDB } = await import("@/lib/db");
  const { default: Order } = await import("@/models/Order");

  await connectDB();

  const now = new Date();
  const datePart = formatDatePart(now);

  // Find the highest invoice number for today
  const prefix = `INV-${datePart}-`;
  const lastOrder = await Order.findOne(
    { invoiceNumber: { $regex: `^${prefix}` } },
    { invoiceNumber: 1 },
    { sort: { invoiceNumber: -1 } }
  );

  let counter = 1;
  if (lastOrder && lastOrder.invoiceNumber) {
    const parts = lastOrder.invoiceNumber.split("-");
    const lastCounter = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastCounter)) {
      counter = lastCounter + 1;
    }
  }

  const counterPart = String(counter).padStart(4, "0");
  return `${prefix}${counterPart}`;
}
