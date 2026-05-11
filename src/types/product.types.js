/**
 * Allowed image formats for product images.
 * @type {string[]}
 */
export const ALLOWED_IMAGE_FORMATS = ["image/jpeg", "image/png", "image/webp"];

/**
 * Allowed image file extensions for product images.
 * @type {string[]}
 */
export const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/**
 * Maximum image file size in bytes (2MB).
 * @type {number}
 */
export const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

/**
 * Maximum image file size in MB (for display).
 * @type {number}
 */
export const MAX_IMAGE_SIZE_MB = 2;

/**
 * Error codes for product operations.
 * @enum {string}
 */
export const ProductErrorCode = {
  DUPLICATE_SKU: "DUPLICATE_SKU",
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  INVALID_IMAGE_FORMAT: "INVALID_IMAGE_FORMAT",
  IMAGE_TOO_LARGE: "IMAGE_TOO_LARGE",
  VALIDATION_ERROR: "VALIDATION_ERROR",
};

/**
 * Error messages for product operations.
 * @type {Object.<string, string>}
 */
export const PRODUCT_ERROR_MESSAGES = {
  [ProductErrorCode.DUPLICATE_SKU]: "SKU sudah digunakan",
  [ProductErrorCode.PRODUCT_NOT_FOUND]: "Produk tidak ditemukan",
  [ProductErrorCode.INVALID_IMAGE_FORMAT]:
    "Format gambar tidak didukung. Gunakan JPG, PNG, atau WEBP",
  [ProductErrorCode.IMAGE_TOO_LARGE]: "Ukuran gambar melebihi batas 2MB",
  [ProductErrorCode.VALIDATION_ERROR]: "Data produk tidak valid",
};
