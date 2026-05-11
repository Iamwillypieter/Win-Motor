import connectDB from "@/lib/db";
import Product from "@/models/Product";
import sseManager from "@/lib/sse";
import {
  ProductErrorCode,
  PRODUCT_ERROR_MESSAGES,
  ALLOWED_IMAGE_FORMATS,
  MAX_IMAGE_SIZE_BYTES,
} from "@/types/product.types";

/**
 * Custom error class for product operations.
 */
export class ProductError extends Error {
  /**
   * @param {string} code - ProductErrorCode value
   * @param {string} [message] - Optional override message
   */
  constructor(code, message) {
    super(message || PRODUCT_ERROR_MESSAGES[code] || code);
    this.name = "ProductError";
    this.code = code;
  }
}

/**
 * Create a new product.
 * @param {Object} data
 * @param {string} data.name
 * @param {string} data.sku
 * @param {number} data.price - Integer rupiah
 * @param {number} data.stock
 * @param {string} [data.imageUrl]
 * @param {string} data.createdBy - User ObjectId string
 * @returns {Promise<Object>} Created product document (lean)
 * @throws {ProductError} DUPLICATE_SKU if SKU already exists
 */
export async function createProduct({ name, sku, price, stock, imageUrl, createdBy }) {
  await connectDB();

  const normalizedSku = sku.toUpperCase().trim();

  const existing = await Product.findOne({ sku: normalizedSku }).lean();
  if (existing) {
    throw new ProductError(ProductErrorCode.DUPLICATE_SKU);
  }

  const product = await Product.create({
    name: name.trim(),
    sku: normalizedSku,
    price,
    stock,
    imageUrl: imageUrl || null,
    createdBy,
  });

  return product.toObject();
}

/**
 * Update an existing product.
 * After a successful update, broadcasts SSE events to CASHIER role:
 *   - Always: { type: "product_updated", data: productSummary }
 *   - If stock changed: { type: "stock_updated", data: { productId, newStock } }
 *
 * @param {string} id - Product ObjectId string
 * @param {Object} updates - Fields to update (name, price, stock, imageUrl)
 * @returns {Promise<Object>} Updated product document (lean)
 * @throws {ProductError} PRODUCT_NOT_FOUND if product does not exist
 */
export async function updateProduct(id, updates) {
  await connectDB();

  const allowedFields = ["name", "price", "stock", "imageUrl"];
  const sanitized = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      sanitized[field] = typeof updates[field] === "string"
        ? updates[field].trim()
        : updates[field];
    }
  }
  sanitized.updatedAt = new Date();

  const stockUpdated = updates.stock !== undefined;

  const product = await Product.findByIdAndUpdate(
    id,
    { $set: sanitized },
    { new: true, runValidators: true }
  ).lean();

  if (!product) {
    throw new ProductError(ProductErrorCode.PRODUCT_NOT_FOUND);
  }

  // Broadcast product_updated to all CASHIER clients
  const productSummary = {
    _id: product._id.toString(),
    name: product.name,
    sku: product.sku,
    price: product.price,
    stock: product.stock,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
  };

  try {
    sseManager.broadcastToRole(
      { type: "product_updated", data: productSummary },
      ["CASHIER"]
    );
  } catch (err) {
    // SSE broadcast failure must not break the update operation
    console.error("product.service: failed to broadcast product_updated", err);
  }

  // Broadcast stock_updated if stock was part of the update
  if (stockUpdated) {
    try {
      sseManager.broadcastToRole(
        {
          type: "stock_updated",
          data: { productId: product._id.toString(), newStock: product.stock },
        },
        ["CASHIER"]
      );
    } catch (err) {
      console.error("product.service: failed to broadcast stock_updated", err);
    }
  }

  return product;
}

/**
 * Soft-delete a product by setting isActive to false.
 * Historical order data referencing this product is preserved.
 * @param {string} id - Product ObjectId string
 * @returns {Promise<Object>} Updated product document (lean)
 * @throws {ProductError} PRODUCT_NOT_FOUND if product does not exist
 */
export async function softDeleteProduct(id) {
  await connectDB();

  const product = await Product.findByIdAndUpdate(
    id,
    { $set: { isActive: false, updatedAt: new Date() } },
    { new: true }
  ).lean();

  if (!product) {
    throw new ProductError(ProductErrorCode.PRODUCT_NOT_FOUND);
  }

  return product;
}

/**
 * Get all active products, with optional search and SKU filter.
 * @param {Object} [options]
 * @param {string} [options.search] - Full-text search on name
 * @param {string} [options.sku] - Exact SKU filter (case-insensitive)
 * @returns {Promise<Object[]>} Array of active product documents (lean)
 */
export async function getProducts({ search, sku } = {}) {
  await connectDB();

  const query = { isActive: true };

  if (search && search.trim()) {
    query.$text = { $search: search.trim() };
  }

  if (sku && sku.trim()) {
    query.sku = sku.toUpperCase().trim();
  }

  const products = await Product.find(query)
    .sort({ createdAt: -1 })
    .lean();

  return products;
}

/**
 * Get a single product by ID.
 * @param {string} id - Product ObjectId string
 * @returns {Promise<Object>} Product document (lean)
 * @throws {ProductError} PRODUCT_NOT_FOUND if product does not exist
 */
export async function getProductById(id) {
  await connectDB();

  const product = await Product.findById(id).lean();

  if (!product) {
    throw new ProductError(ProductErrorCode.PRODUCT_NOT_FOUND);
  }

  return product;
}

/**
 * Validate an uploaded image file's MIME type and size.
 * @param {string} mimeType - e.g. "image/jpeg"
 * @param {number} sizeBytes - File size in bytes
 * @throws {ProductError} INVALID_IMAGE_FORMAT or IMAGE_TOO_LARGE
 */
export function validateImageFile(mimeType, sizeBytes) {
  if (!ALLOWED_IMAGE_FORMATS.includes(mimeType)) {
    throw new ProductError(ProductErrorCode.INVALID_IMAGE_FORMAT);
  }
  if (sizeBytes > MAX_IMAGE_SIZE_BYTES) {
    throw new ProductError(ProductErrorCode.IMAGE_TOO_LARGE);
  }
}
