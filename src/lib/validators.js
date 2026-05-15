/**
 * Validators — shared validation utilities
 */

/**
 * Validates a WhatsApp/phone number in Indonesian format.
 * Accepts:
 *   - 08xx format  (e.g. 081234567890)
 *   - +62xx format (e.g. +6281234567890)
 * Total digits: 10–15
 *
 * @param {string|null|undefined} number
 * @returns {boolean}
 */
export function isValidWhatsapp(number) {
  if (number === null || number === undefined || number === "") {
    return false;
  }
  return /^(\+62|08)\d{8,13}$/.test(String(number).trim());
}
