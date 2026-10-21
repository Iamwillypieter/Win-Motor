/**
 * Payment Methods — constants and helpers for payment method categorisation.
 */

/** Payment methods processed automatically via payment gateway */
export const DIGITAL_PAYMENT_METHODS = [
  "QRIS",
  "EWALLET_DANA",
  "EWALLET_OVO",
  "EWALLET_GOPAY",
];

/** Payment methods that require manual confirmation by staff */
export const MANUAL_PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "DEBT"];

/** All supported payment methods */
export const ALL_PAYMENT_METHODS = [
  ...DIGITAL_PAYMENT_METHODS,
  ...MANUAL_PAYMENT_METHODS,
];

/**
 * Returns true if the payment method is processed digitally via a payment gateway.
 *
 * @param {string} method
 * @returns {boolean}
 */
export function isDigitalPayment(method) {
  return DIGITAL_PAYMENT_METHODS.includes(method);
}

/**
 * Returns true if the payment method requires manual confirmation by warehouse staff.
 *
 * @param {string} method
 * @returns {boolean}
 */
export function requiresManualConfirmation(method) {
  return MANUAL_PAYMENT_METHODS.includes(method);
}

/**
 * Returns true if the payment method is a debt (utang).
 *
 * @param {string} method
 * @returns {boolean}
 */
export function isDebtPayment(method) {
  return method === "DEBT";
}
