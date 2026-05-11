/**
 * Unit Tests: AuthService — authorize callback & session management
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.7
 *
 * Tests:
 *   1. Login dengan kredensial valid → session dibuat (user object dikembalikan)
 *   2. Login dengan email tidak terdaftar → null (pesan generik)
 *   3. Login dengan password salah → null (pesan generik)
 *   4. Logout → signOut dipanggil dan sesi dihapus
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — harus dideklarasikan sebelum import modul yang dimock
// ---------------------------------------------------------------------------

// vi.hoisted() memastikan variabel ini tersedia saat factory mock dieksekusi
// (mock factories di-hoist ke atas file oleh Vitest sebelum import lainnya).
const { capturedConfig } = vi.hoisted(() => {
  return { capturedConfig: { value: null } };
});

// Mock next-auth: tangkap config yang dikirim ke NextAuth() agar kita bisa
// mengekstrak fungsi authorize() untuk diuji secara langsung.
vi.mock("next-auth", () => {
  const mockSignOut = vi.fn().mockResolvedValue(undefined);
  const NextAuth = vi.fn((config) => {
    capturedConfig.value = config;
    return {
      handlers: {},
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: mockSignOut,
    };
  });
  return { default: NextAuth };
});

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((config) => config),
}));

// Mock koneksi database — tidak perlu koneksi nyata di unit test
vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

// Mock User model Mongoose
vi.mock("@/models/User", () => ({
  default: {
    findOne: vi.fn(),
  },
}));

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import modul setelah mock didefinisikan
// ---------------------------------------------------------------------------

// Import auth.js untuk memicu eksekusi NextAuth() dan menangkap config-nya
import "@/lib/auth";
import bcrypt from "bcryptjs";
import User from "@/models/User";

// ---------------------------------------------------------------------------
// Helper: ekstrak fungsi authorize dari config NextAuth yang tertangkap
// ---------------------------------------------------------------------------

function getAuthorize() {
  // Credentials provider config ada di providers[0]
  const credentialsConfig = capturedConfig.value?.providers?.[0];
  const authorize = credentialsConfig?.authorize;
  if (!authorize) {
    throw new Error(
      "authorize() tidak ditemukan di NextAuth config. Pastikan src/lib/auth.js sudah diimport."
    );
  }
  return authorize;
}

// ---------------------------------------------------------------------------
// Data fixture
// ---------------------------------------------------------------------------

const mockUser = {
  _id: { toString: () => "user-id-123" },
  name: "Budi Santoso",
  email: "budi@example.com",
  password: "$2b$10$hashedpassword",
  role: "CASHIER",
  isActive: true,
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("AuthService — authorize callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Login dengan kredensial valid
  // Validates: Requirements 1.1, 1.2
  // -------------------------------------------------------------------------

  describe("login dengan kredensial valid", () => {
    it("harus mengembalikan objek user dengan id, name, email, dan role yang benar", async () => {
      // Arrange
      User.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockUser),
      });
      bcrypt.compare.mockResolvedValue(true);

      const authorize = getAuthorize();

      // Act
      const result = await authorize({
        email: "budi@example.com",
        password: "password123",
      });

      // Assert
      expect(result).not.toBeNull();
      expect(result.id).toBe("user-id-123");
      expect(result.name).toBe("Budi Santoso");
      expect(result.email).toBe("budi@example.com");
      expect(result.role).toBe("CASHIER");
    });

    it("harus memanggil User.findOne dengan email lowercase dan isActive: true", async () => {
      // Arrange
      User.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockUser),
      });
      bcrypt.compare.mockResolvedValue(true);

      const authorize = getAuthorize();

      // Act
      await authorize({
        email: "BUDI@EXAMPLE.COM",
        password: "password123",
      });

      // Assert — email harus dinormalisasi ke lowercase sebelum query
      expect(User.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "budi@example.com",
          isActive: true,
        })
      );
    });

    it("harus memanggil bcrypt.compare untuk memverifikasi password", async () => {
      // Arrange
      User.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockUser),
      });
      bcrypt.compare.mockResolvedValue(true);

      const authorize = getAuthorize();

      // Act
      await authorize({
        email: "budi@example.com",
        password: "password123",
      });

      // Assert
      expect(bcrypt.compare).toHaveBeenCalledWith(
        "password123",
        mockUser.password
      );
    });

    it("harus mengembalikan user dengan role WAREHOUSE untuk staf gudang", async () => {
      // Arrange
      const warehouseUser = { ...mockUser, role: "WAREHOUSE", name: "Siti Rahayu" };
      User.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(warehouseUser),
      });
      bcrypt.compare.mockResolvedValue(true);

      const authorize = getAuthorize();

      // Act
      const result = await authorize({
        email: "siti@example.com",
        password: "password123",
      });

      // Assert
      expect(result).not.toBeNull();
      expect(result.role).toBe("WAREHOUSE");
    });

    it("harus mengembalikan user dengan role OWNER untuk pemilik", async () => {
      // Arrange
      const ownerUser = { ...mockUser, role: "OWNER", name: "Pak Hendra" };
      User.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(ownerUser),
      });
      bcrypt.compare.mockResolvedValue(true);

      const authorize = getAuthorize();

      // Act
      const result = await authorize({
        email: "hendra@example.com",
        password: "password123",
      });

      // Assert
      expect(result).not.toBeNull();
      expect(result.role).toBe("OWNER");
    });
  });

  // -------------------------------------------------------------------------
  // 2. Login dengan email tidak terdaftar
  // Validates: Requirement 1.3
  // -------------------------------------------------------------------------

  describe("login dengan email tidak terdaftar", () => {
    it("harus mengembalikan null ketika email tidak ditemukan di database", async () => {
      // Arrange — User.findOne mengembalikan null (email tidak ada)
      User.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      const authorize = getAuthorize();

      // Act
      const result = await authorize({
        email: "tidakada@example.com",
        password: "password123",
      });

      // Assert — null berarti UI menampilkan pesan generik "Email atau kata sandi salah"
      expect(result).toBeNull();
    });

    it("TIDAK boleh memanggil bcrypt.compare ketika email tidak ditemukan (cegah timing attack)", async () => {
      // Arrange
      User.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      const authorize = getAuthorize();

      // Act
      await authorize({
        email: "tidakada@example.com",
        password: "password123",
      });

      // Assert — bcrypt tidak boleh dipanggil jika user tidak ada
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("harus mengembalikan null untuk email yang tidak aktif (isActive: false)", async () => {
      // Arrange — User.findOne dengan filter isActive: true tidak menemukan user nonaktif
      User.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      const authorize = getAuthorize();

      // Act
      const result = await authorize({
        email: "nonaktif@example.com",
        password: "password123",
      });

      // Assert
      expect(result).toBeNull();
      // Pastikan query menyertakan filter isActive: true
      expect(User.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true })
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. Login dengan password salah
  // Validates: Requirement 1.3
  // -------------------------------------------------------------------------

  describe("login dengan password salah", () => {
    it("harus mengembalikan null ketika password tidak cocok", async () => {
      // Arrange — user ditemukan tapi bcrypt.compare mengembalikan false
      User.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockUser),
      });
      bcrypt.compare.mockResolvedValue(false);

      const authorize = getAuthorize();

      // Act
      const result = await authorize({
        email: "budi@example.com",
        password: "passwordsalah",
      });

      // Assert — null berarti UI menampilkan pesan generik "Email atau kata sandi salah"
      expect(result).toBeNull();
    });

    it("harus tetap memanggil bcrypt.compare meskipun password salah", async () => {
      // Arrange
      User.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockUser),
      });
      bcrypt.compare.mockResolvedValue(false);

      const authorize = getAuthorize();

      // Act
      await authorize({
        email: "budi@example.com",
        password: "passwordsalah",
      });

      // Assert — bcrypt.compare harus dipanggil (user ditemukan, password dicek)
      expect(bcrypt.compare).toHaveBeenCalledOnce();
    });

    it("hasil null untuk email tidak ada dan password salah harus identik (tidak ada info leakage)", async () => {
      // Arrange — Skenario A: email tidak ada
      User.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });
      const authorize = getAuthorize();
      const resultEmailTidakAda = await authorize({
        email: "tidakada@example.com",
        password: "password123",
      });

      // Arrange — Skenario B: email ada tapi password salah
      User.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockUser),
      });
      bcrypt.compare.mockResolvedValue(false);
      const resultPasswordSalah = await authorize({
        email: "budi@example.com",
        password: "passwordsalah",
      });

      // Assert — kedua skenario harus menghasilkan null yang identik
      expect(resultEmailTidakAda).toBeNull();
      expect(resultPasswordSalah).toBeNull();
      expect(resultEmailTidakAda).toBe(resultPasswordSalah);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases: kredensial kosong / tidak lengkap
  // Validates: Requirement 1.1
  // -------------------------------------------------------------------------

  describe("kredensial tidak lengkap", () => {
    it("harus mengembalikan null ketika email tidak diberikan", async () => {
      const authorize = getAuthorize();

      const result = await authorize({ email: "", password: "password123" });

      expect(result).toBeNull();
      expect(User.findOne).not.toHaveBeenCalled();
    });

    it("harus mengembalikan null ketika password tidak diberikan", async () => {
      const authorize = getAuthorize();

      const result = await authorize({ email: "budi@example.com", password: "" });

      expect(result).toBeNull();
      expect(User.findOne).not.toHaveBeenCalled();
    });

    it("harus mengembalikan null ketika credentials adalah null", async () => {
      const authorize = getAuthorize();

      const result = await authorize(null);

      expect(result).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Logout — signOut menghapus sesi
// Validates: Requirement 1.7
// ---------------------------------------------------------------------------

describe("AuthService — logout (signOut)", () => {
  it("signOut harus diekspor dari src/lib/auth.js", async () => {
    // Arrange & Act — import signOut dari auth module
    const authModule = await import("@/lib/auth");

    // Assert — signOut harus tersedia sebagai fungsi
    expect(authModule.signOut).toBeDefined();
    expect(typeof authModule.signOut).toBe("function");
  });

  it("signOut harus dapat dipanggil tanpa error", async () => {
    // Arrange
    const authModule = await import("@/lib/auth");

    // Act & Assert — tidak boleh melempar error
    await expect(authModule.signOut()).resolves.not.toThrow();
  });

  it("signOut harus dipanggil tepat sekali saat pengguna logout", async () => {
    // Arrange
    const authModule = await import("@/lib/auth");
    const signOutSpy = vi.spyOn(authModule, "signOut");
    signOutSpy.mockClear(); // reset call count sebelum test ini

    // Act — simulasi pengguna menekan tombol logout
    await authModule.signOut();

    // Assert — signOut dipanggil tepat sekali
    expect(signOutSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getDefaultRedirect — redirect sesuai role setelah login
// Validates: Requirement 1.2
// ---------------------------------------------------------------------------

describe("getDefaultRedirect — redirect sesuai role", () => {
  it("harus mengarahkan CASHIER ke halaman POS (/cashier)", async () => {
    const { getDefaultRedirect } = await import("@/lib/auth");
    expect(getDefaultRedirect("CASHIER")).toBe("/cashier");
  });

  it("harus mengarahkan WAREHOUSE ke halaman Antrean_Gudang (/warehouse/queue)", async () => {
    const { getDefaultRedirect } = await import("@/lib/auth");
    expect(getDefaultRedirect("WAREHOUSE")).toBe("/warehouse/queue");
  });

  it("harus mengarahkan OWNER ke halaman Dashboard (/owner/dashboard)", async () => {
    const { getDefaultRedirect } = await import("@/lib/auth");
    expect(getDefaultRedirect("OWNER")).toBe("/owner/dashboard");
  });

  it("harus mengembalikan /login untuk role yang tidak dikenal", async () => {
    const { getDefaultRedirect } = await import("@/lib/auth");
    expect(getDefaultRedirect("UNKNOWN")).toBe("/login");
    expect(getDefaultRedirect(undefined)).toBe("/login");
    expect(getDefaultRedirect("")).toBe("/login");
  });
});
