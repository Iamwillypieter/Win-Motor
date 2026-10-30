import connectDB from "@/lib/db";
import mongoose from "mongoose";
import Product from "@/models/Product";
import StockMovement from "@/models/StockMovement";
import Supplier from "@/models/Supplier";
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
 * @param {Object} [data.supplierInfo] - Asal barang opsional
 * @param {string|null} [data.supplierInfo.supplierId]
 * @param {string|null} [data.supplierInfo.supplierName]
 * @param {number|null} [data.supplierInfo.purchasePrice]
 * @returns {Promise<Object>} Created product document (lean)
 * @throws {ProductError} DUPLICATE_SKU if SKU already exists
 */
export async function createProduct({ name, sku, price, stock, imageUrl, brand, aliases, category, createdBy, supplierInfo = {} }) {
  await connectDB();

  const normalizedSku = sku.toUpperCase().trim();

  const existing = await Product.findOne({ sku: normalizedSku }).lean();
  if (existing) {
    throw new ProductError(ProductErrorCode.DUPLICATE_SKU);
  }

  // Normalisasi aliases: trim tiap entry, buang yang kosong, simpan unik
  const normalizedAliases = Array.isArray(aliases)
    ? [...new Set(aliases.map((a) => a.trim()).filter(Boolean))]
    : [];

  const { supplierId = null, supplierName = null, purchasePrice = null } = supplierInfo;

  const product = await Product.create({
    name: name.trim(),
    sku: normalizedSku,
    category: category?.trim() || null,
    brand: brand?.trim() || null,
    aliases: normalizedAliases,
    price,
    stock,
    imageUrl: imageUrl || null,
    // Simpan info pengadaan awal (Asal Barang & Harga Beli) di produk
    lastSupplierName: supplierName?.trim() || null,
    lastPurchasePrice: purchasePrice ?? null,
    createdBy,
  });

  // Catat stok awal sebagai stock movement
  if (stock > 0) {
    try {
      const user = await mongoose.model("User").findById(createdBy).select("name").lean();
      await StockMovement.create({
        productId: product._id,
        productName: product.name,
        sku: product.sku,
        type: "create",
        quantity: stock,
        previousStock: 0,
        newStock: stock,
        reason: "Stok awal saat produk dibuat",
        supplierId: supplierId ?? null,
        supplierName: supplierName ?? null,
        purchasePrice: purchasePrice ?? null,
        userId: createdBy,
        userName: user?.name ?? null,
      });
    } catch (err) {
      console.error("createProduct: failed to record stock movement", err);
    }
  }

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
export async function updateProduct(id, updates, userId = null) {
  await connectDB();

  const allowedFields = ["name", "price", "stock", "imageUrl", "brand", "aliases", "category"];
  const sanitized = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      if (field === "aliases") {
        sanitized.aliases = Array.isArray(updates.aliases)
          ? [...new Set(updates.aliases.map((a) => a.trim()).filter(Boolean))]
          : [];
      } else {
        sanitized[field] = typeof updates[field] === "string"
          ? updates[field].trim()
          : updates[field];
        if ((field === "brand" || field === "category") && !sanitized[field]) {
          sanitized[field] = null;
        }
      }
    }
  }
  sanitized.updatedAt = new Date();

  const stockUpdated = updates.stock !== undefined;

  // Ambil stok sebelum update jika stok berubah
  let previousStock = null;
  if (stockUpdated) {
    const before = await Product.findById(id).select("stock").lean();
    previousStock = before?.stock ?? 0;
  }

  const product = await Product.findByIdAndUpdate(
    id,
    { $set: sanitized },
    { new: true, runValidators: true }
  ).lean();

  if (!product) {
    throw new ProductError(ProductErrorCode.PRODUCT_NOT_FOUND);
  }

  // Catat mutasi stok kalau stok berubah
  if (stockUpdated && previousStock !== null && previousStock !== product.stock) {
    try {
      const user = userId
        ? await mongoose.model("User").findById(userId).select("name").lean()
        : null;
      const diff = product.stock - previousStock;
      await StockMovement.create({
        productId: product._id,
        productName: product.name,
        sku: product.sku,
        type: "adjustment",
        quantity: diff,
        previousStock,
        newStock: product.stock,
        reason: "Koreksi stok manual",
        userId: userId ?? null,
        userName: user?.name ?? null,
      });
    } catch (err) {
      console.error("updateProduct: failed to record stock movement", err);
    }
  }

  // Broadcast product_updated to all CASHIER clients
  const productSummary = {
    _id: product._id.toString(),
    name: product.name,
    sku: product.sku,
    brand: product.brand ?? null,
    aliases: product.aliases ?? [],
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
 * Aktifkan / nonaktifkan produk (toggle isActive).
 *
 * Nonaktif = produk tidak muncul di katalog kasir (mencegah penjualan rugi
 * saat harga beli naik). Dapat diaktifkan kembali. Berbeda dari updateProduct
 * (yang sengaja tidak mengizinkan perubahan isActive) — ini operasi eksplisit.
 *
 * Setelah berhasil, menyiarkan event product_updated ke CASHIER agar katalog
 * mereka ter-update real-time (produk hilang/muncul).
 *
 * @param {string} id - Product ObjectId string
 * @param {boolean} active - status aktif baru
 * @returns {Promise<Object>} Updated product document (lean)
 * @throws {ProductError} PRODUCT_NOT_FOUND if product does not exist
 */
export async function setProductActive(id, active) {
  await connectDB();

  const product = await Product.findByIdAndUpdate(
    id,
    { $set: { isActive: !!active, updatedAt: new Date() } },
    { new: true }
  ).lean();

  if (!product) {
    throw new ProductError(ProductErrorCode.PRODUCT_NOT_FOUND);
  }

  // Siarkan ke CASHIER agar katalog ter-update (produk aktif/nonaktif)
  const productSummary = {
    _id: product._id.toString(),
    name: product.name,
    sku: product.sku,
    brand: product.brand ?? null,
    aliases: product.aliases ?? [],
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
    console.error("setProductActive: failed to broadcast product_updated", err);
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
    const term = search.trim();
    // Coba full-text search dulu. Kalau kata kunci terlalu pendek (< 3 karakter)
    // atau tidak cocok di index, gunakan regex fallback yang cek name, brand, dan aliases.
    if (term.length >= 3) {
      query.$text = { $search: term };
    } else {
      const re = new RegExp(term, "i");
      query.$or = [
        { name: re },
        { brand: re },
        { aliases: re },
        { sku: re },
      ];
    }
  }

  if (sku && sku.trim()) {
    // Exact match SKU atau regex untuk prefix search (scanner barcode)
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
 * Add stock to an existing product (barang masuk).
 * Uses atomic $inc to avoid race conditions when multiple staff
 * add stock simultaneously.
 *
 * After a successful update, broadcasts SSE events to CASHIER role:
 *   - { type: "stock_updated", data: { productId, newStock } }
 *
 * @param {string} id - Product ObjectId string
 * @param {number} quantity - Positive integer to add to stock
 * @param {string|null} [userId] - ID user yang melakukan stock-in
 * @param {Object} [supplierInfo] - Info supplier opsional
 * @param {string|null} [supplierInfo.supplierId] - Supplier ObjectId string
 * @param {string|null} [supplierInfo.supplierName] - Snapshot nama supplier
 * @param {number|null} [supplierInfo.purchasePrice] - Harga beli per satuan (rupiah)
 * @returns {Promise<Object>} Updated product document (lean)
 * @throws {ProductError} PRODUCT_NOT_FOUND if product does not exist
 */
export async function addStock(id, quantity, userId = null, supplierInfo = {}) {
  await connectDB();

  // Ambil stok sebelum update untuk catatan mutasi
  const before = await Product.findById(id).select("stock name sku").lean();
  if (!before) {
    throw new ProductError(ProductErrorCode.PRODUCT_NOT_FOUND);
  }
  const previousStock = before.stock;

  // Bangun $set — selalu update updatedAt, dan perbarui info pengadaan terakhir
  // (Asal Barang & Harga Beli) hanya jika disertakan pada stock-in ini.
  const setUpdate = { updatedAt: new Date() };
  if (supplierInfo.supplierName) {
    setUpdate.lastSupplierName = String(supplierInfo.supplierName).trim();
  }
  if (supplierInfo.purchasePrice !== undefined && supplierInfo.purchasePrice !== null) {
    setUpdate.lastPurchasePrice = supplierInfo.purchasePrice;
  }

  const product = await Product.findByIdAndUpdate(
    id,
    {
      $inc: { stock: quantity },
      $set: setUpdate,
    },
    { new: true, runValidators: true }
  ).lean();

  if (!product) {
    throw new ProductError(ProductErrorCode.PRODUCT_NOT_FOUND);
  }

  // Catat mutasi stok
  try {
    const user = userId
      ? await mongoose.model("User").findById(userId).select("name").lean()
      : null;

    const { supplierId = null, supplierName = null, purchasePrice = null } = supplierInfo;

    await StockMovement.create({
      productId: product._id,
      productName: product.name,
      sku: product.sku,
      type: "in",
      quantity,
      previousStock,
      newStock: product.stock,
      reason: "Barang masuk",
      supplierId: supplierId ?? null,
      supplierName: supplierName ?? null,
      purchasePrice: purchasePrice ?? null,
      userId: userId ?? null,
      userName: user?.name ?? null,
    });
  } catch (err) {
    console.error("addStock: failed to record stock movement", err);
  }

  // Broadcast stock update to all CASHIER clients
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

  return product;
}

/**
 * Import barang masuk massal dari Excel.
 *
 * Untuk setiap baris: cari produk berdasarkan SKU (termasuk produk nonaktif
 * agar tidak terjadi duplikat). Jika ditemukan & aktif → tambahkan stok.
 * Jika tidak ditemukan → buat produk baru dengan stok awal = qty.
 *
 * Mencegah duplikat: pencarian SKU tidak difilter isActive, dan createProduct
 * juga mengecek duplikat (unik di level index).
 *
 * @param {Array<Object>} rows - Hasil parse Excel (sudah dinormalisasi client)
 * @param {string} userId - ObjectId user yang melakukan import
 * @returns {Promise<Object>} { success, failed, total, results }
 */
export async function importStockInBatch(rows, userId) {
  await connectDB();

  // Muat semua supplier aktif sekali untuk resolusi nama → id (case-insensitive).
  const supplierDocs = await Supplier.find({ isActive: true }).lean();
  const supplierByName = new Map();
  for (const s of supplierDocs) supplierByName.set(s.name.toLowerCase(), s);

  const results = [];
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const excelRow = row._rowNum ?? i + 2;

    const rawSku = String(row.sku ?? "").trim();
    if (!rawSku) {
      results.push({ row: excelRow, sku: "-", name: row.name ?? "-", status: "failed", error: "SKU/Barcode wajib diisi" });
      failedCount++;
      continue;
    }
    const normalizedSku = rawSku.toUpperCase();

    const qty = Number(row.qty);
    if (!Number.isInteger(qty) || qty <= 0) {
      results.push({ row: excelRow, sku: normalizedSku, name: row.name ?? "-", status: "failed", error: "Jumlah barang masuk tidak valid" });
      failedCount++;
      continue;
    }
    if (qty > 100_000) {
      results.push({ row: excelRow, sku: normalizedSku, name: row.name ?? "-", status: "failed", error: "Jumlah maksimal 100.000 per item" });
      failedCount++;
      continue;
    }

    // Resolusi info supplier (Asal Barang & Harga Beli) dari baris
    const supplierNameRaw = row.supplier ? String(row.supplier).trim() : "";
    const matchedSupplier = supplierNameRaw
      ? supplierByName.get(supplierNameRaw.toLowerCase())
      : null;
    const supplierInfo = {
      supplierId: matchedSupplier?._id ? String(matchedSupplier._id) : null,
      supplierName: supplierNameRaw || null,
      purchasePrice:
        row.purchasePrice !== undefined && row.purchasePrice !== null && row.purchasePrice !== ""
          ? Number(row.purchasePrice)
          : null,
    };
    if (supplierInfo.purchasePrice !== null) {
      if (!Number.isInteger(supplierInfo.purchasePrice) || supplierInfo.purchasePrice < 0) {
        results.push({ row: excelRow, sku: normalizedSku, name: row.name ?? "-", status: "failed", error: "Harga beli tidak valid" });
        failedCount++;
        continue;
      }
    }

    // Cari produk berdasarkan SKU (tanpa filter isActive → cegah duplikat).
    const existing = await Product.findOne({ sku: normalizedSku }).lean();

    if (existing) {
      if (!existing.isActive) {
        results.push({ row: excelRow, sku: normalizedSku, name: existing.name, status: "failed", error: "SKU sudah ada pada produk nonaktif" });
        failedCount++;
        continue;
      }
      // Produk ditemukan → tambah stok
      try {
        const updated = await addStock(String(existing._id), qty, userId, supplierInfo);
        results.push({
          row: excelRow,
          sku: updated.sku,
          name: updated.name,
          status: "success",
          action: "stock_added",
          quantity: qty,
          newStock: updated.stock,
        });
        successCount++;
      } catch (err) {
        const msg = err instanceof ProductError ? err.message : "Gagal menambah stok";
        results.push({ row: excelRow, sku: normalizedSku, name: existing.name, status: "failed", error: msg });
        failedCount++;
      }
      continue;
    }

    // Produk belum terdaftar → buat produk baru. Wajib: name & price.
    const name = String(row.name ?? "").trim();
    if (!name) {
      results.push({ row: excelRow, sku: normalizedSku, name: "-", status: "failed", error: "Nama produk wajib diisi untuk produk baru" });
      failedCount++;
      continue;
    }
    const price = Number(row.price);
    if (row.price === undefined || row.price === "" || isNaN(price) || price < 0) {
      results.push({ row: excelRow, sku: normalizedSku, name, status: "failed", error: "Harga jual wajib diisi untuk produk baru" });
      failedCount++;
      continue;
    }

    // Normalisasi aliases (bisa string "a;b;c" atau array)
    let aliases = [];
    if (Array.isArray(row.aliases)) {
      aliases = row.aliases;
    } else if (typeof row.aliases === "string" && row.aliases.trim()) {
      aliases = row.aliases.split(";").map((a) => a.trim()).filter(Boolean);
    }

    try {
      const created = await createProduct({
        name,
        sku: normalizedSku,
        price: Math.round(price),
        stock: qty,
        brand: row.brand ? String(row.brand).trim() : null,
        category: row.category ? String(row.category).trim() : null,
        aliases,
        imageUrl: null,
        createdBy: userId,
        supplierInfo,
      });
      results.push({
        row: excelRow,
        sku: created.sku,
        name: created.name,
        status: "success",
        action: "created",
        quantity: qty,
        newStock: created.stock,
      });
      successCount++;
    } catch (err) {
      const msg = err instanceof ProductError ? err.message : "Gagal membuat produk";
      results.push({ row: excelRow, sku: normalizedSku, name, status: "failed", error: msg });
      failedCount++;
    }
  }

  return { success: successCount, failed: failedCount, total: rows.length, results };
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

/**
 * Catat stock movement "out" untuk setiap item yang terjual.
 * Dipanggil dari payment.service setelah stok berhasil dikurangi.
 *
 * @param {Array<{productId, productName, sku, quantity}>} items
 * @param {Object} [meta] - { orderId, invoiceNumber, userId, userName }
 */
export async function recordStockOutMovements(items, meta = {}) {
  await connectDB();

  const movements = await Promise.all(
    items.map(async (item) => {
      try {
        // Ambil stok terkini setelah decrement
        const product = await Product.findById(item.productId).select("stock").lean();
        const newStock = product?.stock ?? 0;
        const previousStock = newStock + item.quantity;

        return {
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          type: "out",
          quantity: -item.quantity,
          previousStock,
          newStock,
          reason: "Terjual",
          orderId: meta.orderId ?? null,
          invoiceNumber: meta.invoiceNumber ?? null,
          userId: meta.userId ?? null,
          userName: meta.userName ?? null,
        };
      } catch {
        return null;
      }
    })
  );

  const valid = movements.filter(Boolean);
  if (valid.length > 0) {
    await StockMovement.insertMany(valid).catch((err) =>
      console.error("recordStockOutMovements: insertMany failed", err)
    );
  }
}
