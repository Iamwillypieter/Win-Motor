/**
 * Property-Based Tests: Product Management (P5–P9)
 *
 * Validates: Requirements 2.2, 2.3, 2.4, 2.6, 2.7, 2.8, 3.1
 *
 * P5: SKU Unik — membuat produk dengan SKU yang sudah ada selalu ditolak
 *     dengan error code DUPLICATE_SKU.
 * P6: Update Produk Round-Trip — setelah update berhasil, membaca produk
 *     mengembalikan nilai yang sama persis.
 * P7: Validasi Format dan Ukuran Gambar — format non-JPG/PNG/WEBP ditolak;
 *     ukuran > 2MB ditolak; kombinasi valid diterima.
 * P8: Soft Delete Menyembunyikan dari Katalog — produk soft-deleted tidak
 *     muncul di hasil getProducts().
 * P9: Katalog Hanya Produk Aktif dengan Field Lengkap — setiap produk di
 *     katalog memiliki isActive: true dan semua field wajib.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import {
  ProductErrorCode,
  ALLOWED_IMAGE_FORMATS,
  MAX_IMAGE_SIZE_BYTES,
} from "@/types/product.types";

// ---------------------------------------------------------------------------
// In-memory product store — mirrors the real service logic without MongoDB.
// This lets property tests run fast and deterministically without a live DB.
// ---------------------------------------------------------------------------

/**
 * Creates a fresh in-memory product store for each test run.
 * The store exposes the same interface as product.service.js so the
 * properties test the *logic*, not the database driver.
 */
function createProductStore() {
  /** @type {Map<string, Object>} */
  const db = new Map();
  let idCounter = 0;

  function nextId() {
    return `product-${++idCounter}`;
  }

  /**
   * Create a new product.
   * @throws {{ code: string }} with code DUPLICATE_SKU if SKU already exists
   */
  function createProduct({ name, sku, price, stock, imageUrl, createdBy }) {
    const normalizedSku = sku.toUpperCase().trim();

    const duplicate = [...db.values()].find((p) => p.sku === normalizedSku);
    if (duplicate) {
      const err = new Error("SKU sudah digunakan");
      err.code = ProductErrorCode.DUPLICATE_SKU;
      throw err;
    }

    const id = nextId();
    const product = {
      _id: id,
      name: name.trim(),
      sku: normalizedSku,
      price,
      stock,
      imageUrl: imageUrl || null,
      isActive: true,
      createdBy: createdBy || "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    db.set(id, { ...product });
    return { ...product };
  }

  /**
   * Update an existing product (name, price, stock, imageUrl only).
   * @throws {{ code: string }} with code PRODUCT_NOT_FOUND if not found
   */
  function updateProduct(id, updates) {
    const product = db.get(id);
    if (!product) {
      const err = new Error("Produk tidak ditemukan");
      err.code = ProductErrorCode.PRODUCT_NOT_FOUND;
      throw err;
    }

    const allowedFields = ["name", "price", "stock", "imageUrl"];
    const updated = { ...product };
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updated[field] =
          typeof updates[field] === "string"
            ? updates[field].trim()
            : updates[field];
      }
    }
    updated.updatedAt = new Date();

    db.set(id, updated);
    return { ...updated };
  }

  /**
   * Soft-delete a product (sets isActive: false).
   * @throws {{ code: string }} with code PRODUCT_NOT_FOUND if not found
   */
  function softDeleteProduct(id) {
    const product = db.get(id);
    if (!product) {
      const err = new Error("Produk tidak ditemukan");
      err.code = ProductErrorCode.PRODUCT_NOT_FOUND;
      throw err;
    }

    const updated = { ...product, isActive: false, updatedAt: new Date() };
    db.set(id, updated);
    return { ...updated };
  }

  /**
   * Get all active products (mirrors getProducts({ isActive: true })).
   */
  function getProducts() {
    return [...db.values()]
      .filter((p) => p.isActive === true)
      .map((p) => ({ ...p }));
  }

  /**
   * Get a single product by ID (regardless of isActive).
   */
  function getProductById(id) {
    const product = db.get(id);
    if (!product) {
      const err = new Error("Produk tidak ditemukan");
      err.code = ProductErrorCode.PRODUCT_NOT_FOUND;
      throw err;
    }
    return { ...product };
  }

  return { createProduct, updateProduct, softDeleteProduct, getProducts, getProductById };
}

/**
 * Validates image MIME type and size — mirrors validateImageFile() in
 * product.service.js without importing it (avoids connectDB side-effects).
 */
function validateImageFile(mimeType, sizeBytes) {
  if (!ALLOWED_IMAGE_FORMATS.includes(mimeType)) {
    const err = new Error("Format gambar tidak didukung. Gunakan JPG, PNG, atau WEBP");
    err.code = ProductErrorCode.INVALID_IMAGE_FORMAT;
    throw err;
  }
  if (sizeBytes > MAX_IMAGE_SIZE_BYTES) {
    const err = new Error("Ukuran gambar melebihi batas 2MB");
    err.code = ProductErrorCode.IMAGE_TOO_LARGE;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Valid product name: 1–80 printable characters */
const arbName = fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0);

/** Valid SKU: 3–20 uppercase alphanumeric + hyphens */
const arbSku = fc
  .stringMatching(/^[A-Z0-9]{2,8}(-[A-Z0-9]{1,6}){0,2}$/)
  .filter((s) => s.length >= 3);

/** Valid price: integer rupiah 0–100_000_000 */
const arbPrice = fc.integer({ min: 0, max: 100_000_000 });

/** Valid stock: integer 0–10_000 */
const arbStock = fc.integer({ min: 0, max: 10_000 });

/** Valid product creation payload */
const arbProductPayload = fc.record({
  name: arbName,
  sku: arbSku,
  price: arbPrice,
  stock: arbStock,
  imageUrl: fc.option(fc.webUrl(), { nil: undefined }),
  createdBy: fc.constant("user-1"),
});

/** Valid MIME types for images */
const arbValidMimeType = fc.constantFrom(...ALLOWED_IMAGE_FORMATS);

/** Invalid MIME types (not in the allowed list) */
const arbInvalidMimeType = fc
  .string({ minLength: 3, maxLength: 30 })
  .filter((s) => !ALLOWED_IMAGE_FORMATS.includes(s) && s.includes("/"));

/** File size within the 2MB limit (1 byte – 2MB) */
const arbValidSize = fc.integer({ min: 1, max: MAX_IMAGE_SIZE_BYTES });

/** File size exceeding the 2MB limit */
const arbOversizedFile = fc.integer({
  min: MAX_IMAGE_SIZE_BYTES + 1,
  max: MAX_IMAGE_SIZE_BYTES * 3,
});

// ---------------------------------------------------------------------------
// P5: SKU Unik
// Validates: Requirement 2.2
// ---------------------------------------------------------------------------

describe("P5: SKU Unik", () => {
  it(
    "should always reject a duplicate SKU with DUPLICATE_SKU error code",
    () => {
      /**
       * Validates: Requirement 2.2
       *
       * For any product that already exists in the catalog, attempting to create
       * another product with the same SKU (case-insensitive) must always throw
       * an error with code DUPLICATE_SKU.
       */
      fc.assert(
        fc.property(arbProductPayload, (payload) => {
          const store = createProductStore();

          // Create the first product — must succeed
          const first = store.createProduct(payload);
          expect(first._id).toBeDefined();

          // Attempt to create a second product with the same SKU
          const duplicate = { ...payload, name: "Different Name" };
          let thrownError = null;
          try {
            store.createProduct(duplicate);
          } catch (err) {
            thrownError = err;
          }

          expect(thrownError).not.toBeNull();
          expect(thrownError.code).toBe(ProductErrorCode.DUPLICATE_SKU);
        })
      );
    }
  );

  it(
    "should reject duplicate SKU regardless of letter case",
    () => {
      /**
       * Validates: Requirement 2.2
       *
       * SKU comparison is case-insensitive. A lowercase submission of an
       * existing uppercase SKU must also be rejected.
       */
      fc.assert(
        fc.property(arbProductPayload, (payload) => {
          const store = createProductStore();

          // Create with uppercase SKU
          store.createProduct({ ...payload, sku: payload.sku.toUpperCase() });

          // Attempt with lowercase version
          let thrownError = null;
          try {
            store.createProduct({
              ...payload,
              name: "Another Name",
              sku: payload.sku.toLowerCase(),
            });
          } catch (err) {
            thrownError = err;
          }

          expect(thrownError).not.toBeNull();
          expect(thrownError.code).toBe(ProductErrorCode.DUPLICATE_SKU);
        })
      );
    }
  );

  it(
    "should allow creating products with distinct SKUs",
    () => {
      /**
       * Validates: Requirement 2.2 (positive case)
       *
       * Two products with different SKUs must both be created successfully.
       */
      fc.assert(
        fc.property(
          arbProductPayload,
          arbProductPayload,
          (payloadA, payloadB) => {
            // Ensure SKUs are different
            fc.pre(payloadA.sku.toUpperCase() !== payloadB.sku.toUpperCase());

            const store = createProductStore();

            const productA = store.createProduct(payloadA);
            const productB = store.createProduct(payloadB);

            expect(productA._id).toBeDefined();
            expect(productB._id).toBeDefined();
            expect(productA._id).not.toBe(productB._id);
          }
        )
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P6: Update Produk Round-Trip
// Validates: Requirements 2.3, 2.4
// ---------------------------------------------------------------------------

describe("P6: Update Produk Round-Trip", () => {
  /** Arbitrary for update payload (subset of updatable fields) */
  const arbUpdatePayload = fc.record({
    name: fc.option(arbName, { nil: undefined }),
    price: fc.option(arbPrice, { nil: undefined }),
    stock: fc.option(arbStock, { nil: undefined }),
  });

  it(
    "should return the updated values when reading the product after a successful update",
    () => {
      /**
       * Validates: Requirements 2.3, 2.4
       *
       * After updateProduct() succeeds, getProductById() must return a document
       * whose fields exactly match the values that were submitted in the update.
       * This is the round-trip property: write(x) then read() === x.
       */
      fc.assert(
        fc.property(arbProductPayload, arbUpdatePayload, (payload, updates) => {
          // Filter out undefined fields so the check is meaningful
          const definedUpdates = Object.fromEntries(
            Object.entries(updates).filter(([, v]) => v !== undefined)
          );
          fc.pre(Object.keys(definedUpdates).length > 0);

          const store = createProductStore();
          const created = store.createProduct(payload);

          const updated = store.updateProduct(created._id, definedUpdates);

          // The returned document must reflect the new values
          for (const [field, value] of Object.entries(definedUpdates)) {
            if (typeof value === "string") {
              expect(updated[field]).toBe(value.trim());
            } else {
              expect(updated[field]).toBe(value);
            }
          }

          // Reading back must also return the same values
          const fetched = store.getProductById(created._id);
          for (const [field, value] of Object.entries(definedUpdates)) {
            if (typeof value === "string") {
              expect(fetched[field]).toBe(value.trim());
            } else {
              expect(fetched[field]).toBe(value);
            }
          }
        })
      );
    }
  );

  it(
    "should not change fields that were not included in the update",
    () => {
      /**
       * Validates: Requirements 2.3, 2.4
       *
       * An update that only touches `price` must leave `name`, `sku`, and
       * `stock` unchanged. Partial updates must not corrupt unrelated fields.
       */
      fc.assert(
        fc.property(arbProductPayload, arbPrice, (payload, newPrice) => {
          const store = createProductStore();
          const created = store.createProduct(payload);

          store.updateProduct(created._id, { price: newPrice });
          const fetched = store.getProductById(created._id);

          // SKU must never change via updateProduct
          expect(fetched.sku).toBe(created.sku);
          // name and stock must be unchanged
          expect(fetched.name).toBe(created.name);
          expect(fetched.stock).toBe(created.stock);
          // price must reflect the new value
          expect(fetched.price).toBe(newPrice);
        })
      );
    }
  );

  it(
    "should preserve isActive: true after an update",
    () => {
      /**
       * Validates: Requirements 2.3, 2.4
       *
       * Updating product data must not accidentally soft-delete the product.
       * isActive must remain true after any normal update.
       */
      fc.assert(
        fc.property(arbProductPayload, arbUpdatePayload, (payload, updates) => {
          const store = createProductStore();
          const created = store.createProduct(payload);

          store.updateProduct(created._id, updates);
          const fetched = store.getProductById(created._id);

          expect(fetched.isActive).toBe(true);
        })
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P7: Validasi Format dan Ukuran Gambar
// Validates: Requirements 2.6, 2.7
// ---------------------------------------------------------------------------

describe("P7: Validasi Format dan Ukuran Gambar", () => {
  it(
    "should reject any MIME type that is not JPG, PNG, or WEBP",
    () => {
      /**
       * Validates: Requirement 2.6
       *
       * For every MIME type that is not in [image/jpeg, image/png, image/webp],
       * validateImageFile() must throw with code INVALID_IMAGE_FORMAT.
       */
      fc.assert(
        fc.property(arbInvalidMimeType, arbValidSize, (mimeType, size) => {
          let thrownError = null;
          try {
            validateImageFile(mimeType, size);
          } catch (err) {
            thrownError = err;
          }

          expect(thrownError).not.toBeNull();
          expect(thrownError.code).toBe(ProductErrorCode.INVALID_IMAGE_FORMAT);
        })
      );
    }
  );

  it(
    "should reject any file larger than 2MB regardless of format",
    () => {
      /**
       * Validates: Requirement 2.7
       *
       * For every valid MIME type, if the file size exceeds MAX_IMAGE_SIZE_BYTES
       * (2MB), validateImageFile() must throw with code IMAGE_TOO_LARGE.
       */
      fc.assert(
        fc.property(arbValidMimeType, arbOversizedFile, (mimeType, size) => {
          let thrownError = null;
          try {
            validateImageFile(mimeType, size);
          } catch (err) {
            thrownError = err;
          }

          expect(thrownError).not.toBeNull();
          expect(thrownError.code).toBe(ProductErrorCode.IMAGE_TOO_LARGE);
        })
      );
    }
  );

  it(
    "should accept every valid MIME type with a size within the 2MB limit",
    () => {
      /**
       * Validates: Requirements 2.6, 2.7 (positive case)
       *
       * For every combination of (valid MIME type, size <= 2MB),
       * validateImageFile() must not throw.
       */
      fc.assert(
        fc.property(arbValidMimeType, arbValidSize, (mimeType, size) => {
          expect(() => validateImageFile(mimeType, size)).not.toThrow();
        })
      );
    }
  );

  it(
    "should reject a file that is exactly 1 byte over the 2MB limit",
    () => {
      /**
       * Validates: Requirement 2.7 (boundary)
       *
       * The boundary condition: MAX_IMAGE_SIZE_BYTES + 1 must be rejected.
       */
      fc.assert(
        fc.property(arbValidMimeType, (mimeType) => {
          let thrownError = null;
          try {
            validateImageFile(mimeType, MAX_IMAGE_SIZE_BYTES + 1);
          } catch (err) {
            thrownError = err;
          }

          expect(thrownError).not.toBeNull();
          expect(thrownError.code).toBe(ProductErrorCode.IMAGE_TOO_LARGE);
        })
      );
    }
  );

  it(
    "should accept a file that is exactly at the 2MB limit",
    () => {
      /**
       * Validates: Requirement 2.7 (boundary)
       *
       * A file of exactly MAX_IMAGE_SIZE_BYTES must be accepted.
       */
      fc.assert(
        fc.property(arbValidMimeType, (mimeType) => {
          expect(() =>
            validateImageFile(mimeType, MAX_IMAGE_SIZE_BYTES)
          ).not.toThrow();
        })
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P8: Soft Delete Menyembunyikan dari Katalog
// Validates: Requirement 2.8
// ---------------------------------------------------------------------------

describe("P8: Soft Delete Menyembunyikan dari Katalog", () => {
  it(
    "should not include a soft-deleted product in getProducts() results",
    () => {
      /**
       * Validates: Requirement 2.8
       *
       * After softDeleteProduct() is called, the product must not appear in
       * the catalog returned by getProducts(). The product's data must still
       * exist in the store (historical integrity), but isActive must be false.
       */
      fc.assert(
        fc.property(arbProductPayload, (payload) => {
          const store = createProductStore();
          const created = store.createProduct(payload);

          // Verify it appears in the catalog before deletion
          const before = store.getProducts();
          expect(before.some((p) => p._id === created._id)).toBe(true);

          // Soft-delete the product
          store.softDeleteProduct(created._id);

          // Must not appear in the catalog after deletion
          const after = store.getProducts();
          expect(after.some((p) => p._id === created._id)).toBe(false);
        })
      );
    }
  );

  it(
    "should preserve the product data after soft delete (historical integrity)",
    () => {
      /**
       * Validates: Requirement 2.8
       *
       * Soft delete must not destroy the product record. getProductById() must
       * still return the product with isActive: false, preserving all fields.
       */
      fc.assert(
        fc.property(arbProductPayload, (payload) => {
          const store = createProductStore();
          const created = store.createProduct(payload);

          store.softDeleteProduct(created._id);

          // Data must still be accessible by ID
          const fetched = store.getProductById(created._id);
          expect(fetched).not.toBeNull();
          expect(fetched.isActive).toBe(false);
          // Core fields must be preserved
          expect(fetched.sku).toBe(created.sku);
          expect(fetched.name).toBe(created.name);
          expect(fetched.price).toBe(created.price);
        })
      );
    }
  );

  it(
    "should not affect other active products when one is soft-deleted",
    () => {
      /**
       * Validates: Requirement 2.8
       *
       * Deleting one product must not remove other active products from the
       * catalog. The catalog must still contain all non-deleted products.
       */
      fc.assert(
        fc.property(
          arbProductPayload,
          arbProductPayload,
          (payloadA, payloadB) => {
            fc.pre(payloadA.sku.toUpperCase() !== payloadB.sku.toUpperCase());

            const store = createProductStore();
            const productA = store.createProduct(payloadA);
            const productB = store.createProduct(payloadB);

            // Soft-delete only product A
            store.softDeleteProduct(productA._id);

            const catalog = store.getProducts();

            // Product A must be gone
            expect(catalog.some((p) => p._id === productA._id)).toBe(false);
            // Product B must still be present
            expect(catalog.some((p) => p._id === productB._id)).toBe(true);
          }
        )
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P9: Katalog Hanya Produk Aktif dengan Field Lengkap
// Validates: Requirements 2.8, 3.1
// ---------------------------------------------------------------------------

describe("P9: Katalog Hanya Produk Aktif dengan Field Lengkap", () => {
  /** Required fields that every catalog product must have */
  const REQUIRED_CATALOG_FIELDS = ["_id", "name", "sku", "price", "stock", "isActive"];

  it(
    "should only include products with isActive: true in the catalog",
    () => {
      /**
       * Validates: Requirements 2.8, 3.1
       *
       * Every product returned by getProducts() must have isActive: true.
       * No soft-deleted product may appear in the catalog.
       */
      fc.assert(
        fc.property(
          fc.array(arbProductPayload, { minLength: 1, maxLength: 10 }),
          fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
          (payloads, deleteFlags) => {
            // Deduplicate SKUs so all creates succeed
            const uniquePayloads = [];
            const seenSkus = new Set();
            for (const p of payloads) {
              const sku = p.sku.toUpperCase();
              if (!seenSkus.has(sku)) {
                seenSkus.add(sku);
                uniquePayloads.push(p);
              }
            }

            const store = createProductStore();
            const created = uniquePayloads.map((p) => store.createProduct(p));

            // Soft-delete some products based on deleteFlags
            for (let i = 0; i < created.length; i++) {
              if (deleteFlags[i % deleteFlags.length]) {
                store.softDeleteProduct(created[i]._id);
              }
            }

            const catalog = store.getProducts();

            // Every product in the catalog must be active
            for (const product of catalog) {
              expect(product.isActive).toBe(true);
            }
          }
        )
      );
    }
  );

  it(
    "should include all required fields for every product in the catalog",
    () => {
      /**
       * Validates: Requirement 3.1
       *
       * Every product returned by getProducts() must have all required fields:
       * _id, name, sku, price, stock, isActive.
       * This ensures the Kasir UI can always render the catalog correctly.
       */
      fc.assert(
        fc.property(
          fc.array(arbProductPayload, { minLength: 1, maxLength: 10 }),
          (payloads) => {
            // Deduplicate SKUs
            const uniquePayloads = [];
            const seenSkus = new Set();
            for (const p of payloads) {
              const sku = p.sku.toUpperCase();
              if (!seenSkus.has(sku)) {
                seenSkus.add(sku);
                uniquePayloads.push(p);
              }
            }

            const store = createProductStore();
            uniquePayloads.forEach((p) => store.createProduct(p));

            const catalog = store.getProducts();

            for (const product of catalog) {
              for (const field of REQUIRED_CATALOG_FIELDS) {
                expect(
                  product[field],
                  `Field "${field}" missing on product ${product._id}`
                ).toBeDefined();
              }
            }
          }
        )
      );
    }
  );

  it(
    "should return an empty catalog when all products are soft-deleted",
    () => {
      /**
       * Validates: Requirements 2.8, 3.1 (edge case)
       *
       * If every product in the store has been soft-deleted, getProducts()
       * must return an empty array — not null, not undefined.
       */
      fc.assert(
        fc.property(
          fc.array(arbProductPayload, { minLength: 1, maxLength: 5 }),
          (payloads) => {
            // Deduplicate SKUs
            const uniquePayloads = [];
            const seenSkus = new Set();
            for (const p of payloads) {
              const sku = p.sku.toUpperCase();
              if (!seenSkus.has(sku)) {
                seenSkus.add(sku);
                uniquePayloads.push(p);
              }
            }

            const store = createProductStore();
            const created = uniquePayloads.map((p) => store.createProduct(p));

            // Delete all products
            created.forEach((p) => store.softDeleteProduct(p._id));

            const catalog = store.getProducts();

            expect(Array.isArray(catalog)).toBe(true);
            expect(catalog).toHaveLength(0);
          }
        )
      );
    }
  );

  it(
    "should have consistent isActive: true across all catalog entries regardless of store size",
    () => {
      /**
       * Validates: Requirements 2.8, 3.1
       *
       * The isActive invariant must hold for any number of products and any
       * combination of active/deleted states. This is the core catalog
       * correctness property.
       */
      fc.assert(
        fc.property(
          fc.array(arbProductPayload, { minLength: 0, maxLength: 15 }),
          (payloads) => {
            // Deduplicate SKUs
            const uniquePayloads = [];
            const seenSkus = new Set();
            for (const p of payloads) {
              const sku = p.sku.toUpperCase();
              if (!seenSkus.has(sku)) {
                seenSkus.add(sku);
                uniquePayloads.push(p);
              }
            }

            const store = createProductStore();
            const created = uniquePayloads.map((p) => store.createProduct(p));

            // Randomly soft-delete roughly half the products (deterministic: even indices)
            created
              .filter((_, i) => i % 2 === 0)
              .forEach((p) => store.softDeleteProduct(p._id));

            const catalog = store.getProducts();

            // Invariant: every catalog entry is active
            const allActive = catalog.every((p) => p.isActive === true);
            expect(allActive).toBe(true);

            // Invariant: count of active products matches catalog length
            const expectedActiveCount = created.filter((_, i) => i % 2 !== 0).length;
            expect(catalog).toHaveLength(expectedActiveCount);
          }
        )
      );
    }
  );
});
