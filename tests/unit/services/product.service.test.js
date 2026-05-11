/**
 * Unit Tests: ProductService
 *
 * Validates: Requirements 2.1–2.8
 *
 * Tests:
 *   1. createProduct: SKU duplikat → error DUPLICATE_SKU; SKU baru → berhasil
 *   2. updateProduct: nama, harga, stok diperbarui dengan benar
 *   3. softDeleteProduct: isActive menjadi false, data historis tetap ada
 *   4. getProducts: hanya mengembalikan produk dengan isActive: true
 *   5. validateImageFile: format salah → error; ukuran > 2MB → error; valid → diterima
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — harus dideklarasikan sebelum import modul yang dimock
// ---------------------------------------------------------------------------

// Mock koneksi database — tidak perlu koneksi nyata di unit test
vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

// Mock Product model Mongoose
vi.mock("@/models/Product", () => {
  const mockProduct = {
    findOne: vi.fn(),
    create: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
  };
  return { default: mockProduct };
});

// ---------------------------------------------------------------------------
// Import modul setelah mock didefinisikan
// ---------------------------------------------------------------------------

import Product from "@/models/Product";
import {
  createProduct,
  updateProduct,
  softDeleteProduct,
  getProducts,
  getProductById,
  validateImageFile,
  ProductError,
} from "@/server/services/product.service";
import {
  ProductErrorCode,
  ALLOWED_IMAGE_FORMATS,
  MAX_IMAGE_SIZE_BYTES,
} from "@/types/product.types";

// ---------------------------------------------------------------------------
// Data fixture
// ---------------------------------------------------------------------------

const mockProductDoc = {
  _id: "product-id-123",
  name: "Kopi Arabika",
  sku: "KOP-001",
  price: 25000,
  stock: 100,
  imageUrl: "https://example.com/kopi.jpg",
  isActive: true,
  createdBy: "user-id-456",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("ProductService — createProduct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // SKU duplikat → error DUPLICATE_SKU
  // Validates: Requirement 2.2
  // -------------------------------------------------------------------------

  describe("SKU duplikat", () => {
    it("harus melempar ProductError dengan code DUPLICATE_SKU ketika SKU sudah ada", async () => {
      // Arrange — Product.findOne menemukan produk dengan SKU yang sama
      Product.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockProductDoc),
      });

      // Act & Assert
      await expect(
        createProduct({
          name: "Produk Baru",
          sku: "KOP-001",
          price: 30000,
          stock: 50,
          createdBy: "user-id-456",
        })
      ).rejects.toThrow(ProductError);
    });

    it("harus melempar error dengan code DUPLICATE_SKU (bukan kode lain)", async () => {
      // Arrange
      Product.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockProductDoc),
      });

      // Act
      let thrownError = null;
      try {
        await createProduct({
          name: "Produk Baru",
          sku: "KOP-001",
          price: 30000,
          stock: 50,
          createdBy: "user-id-456",
        });
      } catch (err) {
        thrownError = err;
      }

      // Assert
      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe(ProductErrorCode.DUPLICATE_SKU);
    });

    it("harus menormalisasi SKU ke uppercase sebelum cek duplikat", async () => {
      // Arrange — SKU dikirim lowercase, harus dicek sebagai uppercase
      Product.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });
      Product.create.mockResolvedValue({
        toObject: () => ({ ...mockProductDoc, sku: "KOP-002" }),
      });

      // Act
      await createProduct({
        name: "Produk Baru",
        sku: "kop-002",
        price: 30000,
        stock: 50,
        createdBy: "user-id-456",
      });

      // Assert — findOne dipanggil dengan SKU uppercase
      expect(Product.findOne).toHaveBeenCalledWith({ sku: "KOP-002" });
    });

    it("TIDAK boleh memanggil Product.create ketika SKU duplikat", async () => {
      // Arrange
      Product.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockProductDoc),
      });

      // Act
      try {
        await createProduct({
          name: "Produk Baru",
          sku: "KOP-001",
          price: 30000,
          stock: 50,
          createdBy: "user-id-456",
        });
      } catch {
        // expected
      }

      // Assert — create tidak boleh dipanggil
      expect(Product.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // SKU baru → produk berhasil dibuat
  // Validates: Requirement 2.1
  // -------------------------------------------------------------------------

  describe("SKU baru — berhasil dibuat", () => {
    it("harus mengembalikan produk yang dibuat dengan field yang benar", async () => {
      // Arrange
      Product.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });
      Product.create.mockResolvedValue({
        toObject: () => ({ ...mockProductDoc }),
      });

      // Act
      const result = await createProduct({
        name: "Kopi Arabika",
        sku: "KOP-001",
        price: 25000,
        stock: 100,
        imageUrl: "https://example.com/kopi.jpg",
        createdBy: "user-id-456",
      });

      // Assert
      expect(result).toBeDefined();
      expect(result._id).toBe("product-id-123");
      expect(result.name).toBe("Kopi Arabika");
      expect(result.sku).toBe("KOP-001");
      expect(result.price).toBe(25000);
      expect(result.stock).toBe(100);
    });

    it("harus memanggil Product.create dengan data yang benar", async () => {
      // Arrange
      Product.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });
      Product.create.mockResolvedValue({
        toObject: () => ({ ...mockProductDoc }),
      });

      // Act
      await createProduct({
        name: "  Kopi Arabika  ",
        sku: "kop-001",
        price: 25000,
        stock: 100,
        imageUrl: "https://example.com/kopi.jpg",
        createdBy: "user-id-456",
      });

      // Assert — nama di-trim, SKU di-uppercase
      expect(Product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Kopi Arabika",
          sku: "KOP-001",
          price: 25000,
          stock: 100,
          createdBy: "user-id-456",
        })
      );
    });

    it("harus menyimpan imageUrl sebagai null ketika tidak diberikan", async () => {
      // Arrange
      Product.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });
      Product.create.mockResolvedValue({
        toObject: () => ({ ...mockProductDoc, imageUrl: null }),
      });

      // Act
      await createProduct({
        name: "Kopi Arabika",
        sku: "KOP-001",
        price: 25000,
        stock: 100,
        createdBy: "user-id-456",
      });

      // Assert
      expect(Product.create).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: null })
      );
    });

    it("harus memanggil Product.findOne untuk cek duplikat sebelum create", async () => {
      // Arrange
      Product.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });
      Product.create.mockResolvedValue({
        toObject: () => ({ ...mockProductDoc }),
      });

      // Act
      await createProduct({
        name: "Kopi Arabika",
        sku: "KOP-001",
        price: 25000,
        stock: 100,
        createdBy: "user-id-456",
      });

      // Assert — urutan: findOne dulu, baru create
      expect(Product.findOne).toHaveBeenCalledOnce();
      expect(Product.create).toHaveBeenCalledOnce();
    });
  });
});

// ---------------------------------------------------------------------------

describe("ProductService — updateProduct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Update berhasil — nama, harga, stok diperbarui
  // Validates: Requirements 2.3, 2.4
  // -------------------------------------------------------------------------

  describe("update berhasil", () => {
    it("harus mengembalikan produk dengan nama yang diperbarui", async () => {
      // Arrange
      const updatedDoc = { ...mockProductDoc, name: "Kopi Robusta" };
      Product.findByIdAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(updatedDoc),
      });

      // Act
      const result = await updateProduct("product-id-123", { name: "Kopi Robusta" });

      // Assert
      expect(result.name).toBe("Kopi Robusta");
    });

    it("harus mengembalikan produk dengan harga yang diperbarui", async () => {
      // Arrange
      const updatedDoc = { ...mockProductDoc, price: 35000 };
      Product.findByIdAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(updatedDoc),
      });

      // Act
      const result = await updateProduct("product-id-123", { price: 35000 });

      // Assert
      expect(result.price).toBe(35000);
    });

    it("harus mengembalikan produk dengan stok yang diperbarui", async () => {
      // Arrange
      const updatedDoc = { ...mockProductDoc, stock: 200 };
      Product.findByIdAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(updatedDoc),
      });

      // Act
      const result = await updateProduct("product-id-123", { stock: 200 });

      // Assert
      expect(result.stock).toBe(200);
    });

    it("harus memanggil findByIdAndUpdate dengan opsi { new: true, runValidators: true }", async () => {
      // Arrange
      Product.findByIdAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockProductDoc),
      });

      // Act
      await updateProduct("product-id-123", { name: "Kopi Robusta" });

      // Assert
      expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
        "product-id-123",
        expect.objectContaining({ $set: expect.any(Object) }),
        { new: true, runValidators: true }
      );
    });

    it("harus men-trim nama sebelum disimpan", async () => {
      // Arrange
      const updatedDoc = { ...mockProductDoc, name: "Kopi Robusta" };
      Product.findByIdAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(updatedDoc),
      });

      // Act
      await updateProduct("product-id-123", { name: "  Kopi Robusta  " });

      // Assert — nama di-trim dalam $set
      expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
        "product-id-123",
        expect.objectContaining({
          $set: expect.objectContaining({ name: "Kopi Robusta" }),
        }),
        expect.any(Object)
      );
    });

    it("harus mengabaikan field yang tidak diizinkan (misal: sku, isActive)", async () => {
      // Arrange
      Product.findByIdAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockProductDoc),
      });

      // Act
      await updateProduct("product-id-123", {
        name: "Kopi Robusta",
        sku: "HACKED-SKU",
        isActive: false,
      });

      // Assert — $set tidak boleh mengandung sku atau isActive
      const callArgs = Product.findByIdAndUpdate.mock.calls[0];
      const setPayload = callArgs[1].$set;
      expect(setPayload).not.toHaveProperty("sku");
      expect(setPayload).not.toHaveProperty("isActive");
      expect(setPayload).toHaveProperty("name", "Kopi Robusta");
    });
  });

  // -------------------------------------------------------------------------
  // Produk tidak ditemukan → error PRODUCT_NOT_FOUND
  // -------------------------------------------------------------------------

  describe("produk tidak ditemukan", () => {
    it("harus melempar ProductError dengan code PRODUCT_NOT_FOUND", async () => {
      // Arrange — findByIdAndUpdate mengembalikan null (produk tidak ada)
      Product.findByIdAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      // Act & Assert
      await expect(
        updateProduct("id-tidak-ada", { name: "Nama Baru" })
      ).rejects.toThrow(ProductError);
    });

    it("harus melempar error dengan code PRODUCT_NOT_FOUND", async () => {
      // Arrange
      Product.findByIdAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      // Act
      let thrownError = null;
      try {
        await updateProduct("id-tidak-ada", { name: "Nama Baru" });
      } catch (err) {
        thrownError = err;
      }

      // Assert
      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe(ProductErrorCode.PRODUCT_NOT_FOUND);
    });
  });
});

// ---------------------------------------------------------------------------

describe("ProductService — softDeleteProduct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // isActive menjadi false
  // Validates: Requirement 2.8
  // -------------------------------------------------------------------------

  describe("soft delete berhasil", () => {
    it("harus mengembalikan produk dengan isActive: false", async () => {
      // Arrange
      const deletedDoc = { ...mockProductDoc, isActive: false };
      Product.findByIdAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(deletedDoc),
      });

      // Act
      const result = await softDeleteProduct("product-id-123");

      // Assert
      expect(result.isActive).toBe(false);
    });

    it("harus memanggil findByIdAndUpdate dengan $set { isActive: false }", async () => {
      // Arrange
      const deletedDoc = { ...mockProductDoc, isActive: false };
      Product.findByIdAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(deletedDoc),
      });

      // Act
      await softDeleteProduct("product-id-123");

      // Assert
      expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
        "product-id-123",
        expect.objectContaining({
          $set: expect.objectContaining({ isActive: false }),
        }),
        expect.objectContaining({ new: true })
      );
    });

    it("harus mempertahankan data historis (nama, sku, harga) setelah soft delete", async () => {
      // Arrange — dokumen yang dikembalikan masih memiliki semua field asli
      const deletedDoc = {
        ...mockProductDoc,
        isActive: false,
      };
      Product.findByIdAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(deletedDoc),
      });

      // Act
      const result = await softDeleteProduct("product-id-123");

      // Assert — data historis tetap ada
      expect(result.name).toBe("Kopi Arabika");
      expect(result.sku).toBe("KOP-001");
      expect(result.price).toBe(25000);
      expect(result._id).toBe("product-id-123");
    });

    it("TIDAK boleh menghapus dokumen dari database (bukan hard delete)", async () => {
      // Arrange
      const deletedDoc = { ...mockProductDoc, isActive: false };
      Product.findByIdAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(deletedDoc),
      });

      // Act
      await softDeleteProduct("product-id-123");

      // Assert — hanya findByIdAndUpdate yang dipanggil, bukan deleteOne/findByIdAndDelete
      expect(Product.findByIdAndUpdate).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Produk tidak ditemukan → error PRODUCT_NOT_FOUND
  // -------------------------------------------------------------------------

  describe("produk tidak ditemukan", () => {
    it("harus melempar ProductError dengan code PRODUCT_NOT_FOUND", async () => {
      // Arrange
      Product.findByIdAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      // Act & Assert
      await expect(
        softDeleteProduct("id-tidak-ada")
      ).rejects.toThrow(ProductError);
    });

    it("harus melempar error dengan code PRODUCT_NOT_FOUND", async () => {
      // Arrange
      Product.findByIdAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      // Act
      let thrownError = null;
      try {
        await softDeleteProduct("id-tidak-ada");
      } catch (err) {
        thrownError = err;
      }

      // Assert
      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe(ProductErrorCode.PRODUCT_NOT_FOUND);
    });
  });
});

// ---------------------------------------------------------------------------

describe("ProductService — getProducts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Hanya mengembalikan produk aktif (isActive: true)
  // Validates: Requirements 2.8, 3.1
  // -------------------------------------------------------------------------

  describe("filter produk aktif", () => {
    it("harus mengembalikan hanya produk dengan isActive: true", async () => {
      // Arrange
      const activeProducts = [
        { ...mockProductDoc, _id: "prod-1", isActive: true },
        { ...mockProductDoc, _id: "prod-2", sku: "KOP-002", isActive: true },
      ];
      Product.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(activeProducts),
        }),
      });

      // Act
      const result = await getProducts();

      // Assert
      expect(result).toHaveLength(2);
      result.forEach((p) => expect(p.isActive).toBe(true));
    });

    it("harus memanggil Product.find dengan query { isActive: true }", async () => {
      // Arrange
      Product.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      });

      // Act
      await getProducts();

      // Assert
      expect(Product.find).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true })
      );
    });

    it("harus mengembalikan array kosong ketika tidak ada produk aktif", async () => {
      // Arrange
      Product.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      });

      // Act
      const result = await getProducts();

      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it("produk yang di-soft-delete TIDAK boleh muncul di hasil getProducts", async () => {
      // Arrange — hanya produk aktif yang dikembalikan oleh query (soft-deleted sudah difilter DB)
      const activeProducts = [
        { ...mockProductDoc, _id: "prod-active", isActive: true },
      ];
      Product.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(activeProducts),
        }),
      });

      // Act
      const result = await getProducts();

      // Assert — tidak ada produk dengan isActive: false
      const hasInactive = result.some((p) => p.isActive === false);
      expect(hasInactive).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Filter opsional: search dan sku
  // Validates: Requirement 2.5
  // -------------------------------------------------------------------------

  describe("filter opsional", () => {
    it("harus menambahkan $text search ke query ketika parameter search diberikan", async () => {
      // Arrange
      Product.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([mockProductDoc]),
        }),
      });

      // Act
      await getProducts({ search: "kopi" });

      // Assert
      expect(Product.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          $text: { $search: "kopi" },
        })
      );
    });

    it("harus menambahkan filter sku ke query ketika parameter sku diberikan", async () => {
      // Arrange
      Product.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([mockProductDoc]),
        }),
      });

      // Act
      await getProducts({ sku: "kop-001" });

      // Assert — SKU dinormalisasi ke uppercase
      expect(Product.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          sku: "KOP-001",
        })
      );
    });

    it("harus mengabaikan parameter search yang kosong", async () => {
      // Arrange
      Product.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      });

      // Act
      await getProducts({ search: "   " });

      // Assert — $text tidak boleh ada di query
      const callArgs = Product.find.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty("$text");
    });
  });
});

// ---------------------------------------------------------------------------

describe("ProductService — validateImageFile", () => {
  // -------------------------------------------------------------------------
  // Format gambar tidak valid → error INVALID_IMAGE_FORMAT
  // Validates: Requirement 2.6
  // -------------------------------------------------------------------------

  describe("format gambar tidak valid", () => {
    it("harus melempar ProductError dengan code INVALID_IMAGE_FORMAT untuk format GIF", () => {
      expect(() => validateImageFile("image/gif", 1024)).toThrow(ProductError);

      let thrownError = null;
      try {
        validateImageFile("image/gif", 1024);
      } catch (err) {
        thrownError = err;
      }
      expect(thrownError.code).toBe(ProductErrorCode.INVALID_IMAGE_FORMAT);
    });

    it("harus melempar error INVALID_IMAGE_FORMAT untuk format PDF", () => {
      let thrownError = null;
      try {
        validateImageFile("application/pdf", 1024);
      } catch (err) {
        thrownError = err;
      }
      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe(ProductErrorCode.INVALID_IMAGE_FORMAT);
    });

    it("harus melempar error INVALID_IMAGE_FORMAT untuk format BMP", () => {
      let thrownError = null;
      try {
        validateImageFile("image/bmp", 1024);
      } catch (err) {
        thrownError = err;
      }
      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe(ProductErrorCode.INVALID_IMAGE_FORMAT);
    });

    it("harus melempar error INVALID_IMAGE_FORMAT untuk format SVG", () => {
      let thrownError = null;
      try {
        validateImageFile("image/svg+xml", 1024);
      } catch (err) {
        thrownError = err;
      }
      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe(ProductErrorCode.INVALID_IMAGE_FORMAT);
    });

    it("harus melempar error INVALID_IMAGE_FORMAT untuk string MIME yang tidak valid", () => {
      let thrownError = null;
      try {
        validateImageFile("text/plain", 1024);
      } catch (err) {
        thrownError = err;
      }
      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe(ProductErrorCode.INVALID_IMAGE_FORMAT);
    });
  });

  // -------------------------------------------------------------------------
  // Ukuran gambar melebihi batas → error IMAGE_TOO_LARGE
  // Validates: Requirement 2.7
  // -------------------------------------------------------------------------

  describe("ukuran gambar melebihi batas 2MB", () => {
    it("harus melempar ProductError dengan code IMAGE_TOO_LARGE untuk file > 2MB", () => {
      const oversizedBytes = MAX_IMAGE_SIZE_BYTES + 1;

      let thrownError = null;
      try {
        validateImageFile("image/jpeg", oversizedBytes);
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError).toBeInstanceOf(ProductError);
      expect(thrownError.code).toBe(ProductErrorCode.IMAGE_TOO_LARGE);
    });

    it("harus melempar IMAGE_TOO_LARGE untuk file PNG yang terlalu besar", () => {
      const oversizedBytes = MAX_IMAGE_SIZE_BYTES + 1024;

      let thrownError = null;
      try {
        validateImageFile("image/png", oversizedBytes);
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe(ProductErrorCode.IMAGE_TOO_LARGE);
    });

    it("harus melempar IMAGE_TOO_LARGE untuk file WEBP yang terlalu besar", () => {
      const oversizedBytes = MAX_IMAGE_SIZE_BYTES * 2;

      let thrownError = null;
      try {
        validateImageFile("image/webp", oversizedBytes);
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe(ProductErrorCode.IMAGE_TOO_LARGE);
    });

    it("harus melempar IMAGE_TOO_LARGE untuk file tepat 1 byte di atas batas", () => {
      let thrownError = null;
      try {
        validateImageFile("image/jpeg", MAX_IMAGE_SIZE_BYTES + 1);
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe(ProductErrorCode.IMAGE_TOO_LARGE);
    });
  });

  // -------------------------------------------------------------------------
  // Format dan ukuran valid → diterima tanpa error
  // Validates: Requirements 2.6, 2.7
  // -------------------------------------------------------------------------

  describe("format dan ukuran valid", () => {
    it("harus menerima image/jpeg dengan ukuran dalam batas", () => {
      expect(() => validateImageFile("image/jpeg", 1024 * 1024)).not.toThrow();
    });

    it("harus menerima image/png dengan ukuran dalam batas", () => {
      expect(() => validateImageFile("image/png", 500 * 1024)).not.toThrow();
    });

    it("harus menerima image/webp dengan ukuran dalam batas", () => {
      expect(() => validateImageFile("image/webp", 800 * 1024)).not.toThrow();
    });

    it("harus menerima file dengan ukuran tepat di batas 2MB (MAX_IMAGE_SIZE_BYTES)", () => {
      expect(() =>
        validateImageFile("image/jpeg", MAX_IMAGE_SIZE_BYTES)
      ).not.toThrow();
    });

    it("harus menerima file dengan ukuran 1 byte", () => {
      expect(() => validateImageFile("image/png", 1)).not.toThrow();
    });

    it("harus menerima semua format yang diizinkan (ALLOWED_IMAGE_FORMATS)", () => {
      ALLOWED_IMAGE_FORMATS.forEach((mimeType) => {
        expect(() =>
          validateImageFile(mimeType, MAX_IMAGE_SIZE_BYTES)
        ).not.toThrow();
      });
    });
  });
});
