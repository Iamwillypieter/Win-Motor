import { describe, it, expect } from "vitest";
import { formatRupiah, calculateChange } from "@/lib/utils";

// Requirements: 5.2, 3.3

describe("formatRupiah()", () => {
  it("should return 'Rp 0' for zero", () => {
    expect(formatRupiah(0)).toBe("Rp 0");
  });

  it("should format a small positive value correctly", () => {
    expect(formatRupiah(1000)).toBe("Rp 1.000");
  });

  it("should format a typical price correctly", () => {
    expect(formatRupiah(25000)).toBe("Rp 25.000");
  });

  it("should format a large value with multiple thousand separators", () => {
    expect(formatRupiah(1000000)).toBe("Rp 1.000.000");
  });

  it("should format a very large value correctly", () => {
    expect(formatRupiah(1500000000)).toBe("Rp 1.500.000.000");
  });

  it("should handle single-digit values", () => {
    expect(formatRupiah(5)).toBe("Rp 5");
  });

  it("should handle values less than 1000", () => {
    expect(formatRupiah(999)).toBe("Rp 999");
  });

  it("should handle exactly 1000", () => {
    expect(formatRupiah(1000)).toBe("Rp 1.000");
  });

  it("should handle non-number input gracefully", () => {
    expect(formatRupiah(NaN)).toBe("Rp 0");
  });

  it("should truncate decimal values (floor)", () => {
    // Monetary values should be integers, but handle gracefully
    expect(formatRupiah(25000.99)).toBe("Rp 25.000");
  });
});

describe("calculateChange()", () => {
  it("should return zero when cashReceived equals totalAmount (exact change)", () => {
    expect(calculateChange(50000, 50000)).toBe(0);
  });

  it("should return positive change when cashReceived exceeds totalAmount", () => {
    expect(calculateChange(100000, 75000)).toBe(25000);
  });

  it("should return correct change for typical transaction", () => {
    expect(calculateChange(50000, 25000)).toBe(25000);
  });

  it("should return correct change for large amounts", () => {
    expect(calculateChange(1000000, 750000)).toBe(250000);
  });

  it("should return negative value when cashReceived is less than totalAmount", () => {
    // This case should be validated before calling, but the function itself returns the difference
    expect(calculateChange(10000, 25000)).toBe(-15000);
  });

  it("should handle zero totalAmount", () => {
    expect(calculateChange(50000, 0)).toBe(50000);
  });

  it("should handle zero cashReceived and zero totalAmount", () => {
    expect(calculateChange(0, 0)).toBe(0);
  });
});
