import { describe, it, expect } from "vitest";
import { isValidWhatsapp } from "@/lib/validators";

// Requirements: 3.4, 10.2

describe("isValidWhatsapp()", () => {
  // ─── Valid formats ────────────────────────────────────────────────────────

  describe("valid 08xx format", () => {
    it("should accept a typical 12-digit 08xx number", () => {
      expect(isValidWhatsapp("081234567890")).toBe(true);
    });

    it("should accept the minimum valid 08xx number (10 digits total)", () => {
      // 08 + 8 digits = 10 digits total
      expect(isValidWhatsapp("0812345678")).toBe(true);
    });

    it("should accept the maximum valid 08xx number (15 digits total)", () => {
      // 08 + 13 digits = 15 digits total
      expect(isValidWhatsapp("081234567890123")).toBe(true);
    });

    it("should accept an 11-digit 08xx number", () => {
      expect(isValidWhatsapp("08123456789")).toBe(true);
    });

    it("should accept a 13-digit 08xx number", () => {
      expect(isValidWhatsapp("0812345678901")).toBe(true);
    });

    it("should accept a 14-digit 08xx number", () => {
      expect(isValidWhatsapp("08123456789012")).toBe(true);
    });

    it("should accept 08xx number with leading/trailing spaces (trimmed)", () => {
      expect(isValidWhatsapp("  081234567890  ")).toBe(true);
    });
  });

  describe("valid +62xx format", () => {
    it("should accept a typical 13-digit +62xx number", () => {
      expect(isValidWhatsapp("+6281234567890")).toBe(true);
    });

    it("should accept the minimum valid +62xx number (10 digits total)", () => {
      // +62 + 8 digits = 10 digits total
      expect(isValidWhatsapp("+6212345678")).toBe(true);
    });

    it("should accept the maximum valid +62xx number (15 digits total)", () => {
      // +62 + 13 digits = 15 digits total
      expect(isValidWhatsapp("+621234567890123")).toBe(true);
    });

    it("should accept an 11-digit +62xx number", () => {
      expect(isValidWhatsapp("+62123456789")).toBe(true);
    });

    it("should accept a 14-digit +62xx number", () => {
      expect(isValidWhatsapp("+6212345678901")).toBe(true);
    });

    it("should accept +62xx number with leading/trailing spaces (trimmed)", () => {
      expect(isValidWhatsapp("  +6281234567890  ")).toBe(true);
    });
  });

  // ─── Invalid: too short ───────────────────────────────────────────────────

  describe("invalid: too short (< 10 digits total)", () => {
    it("should reject 08xx number with only 7 digits after prefix (9 total)", () => {
      // 08 + 7 digits = 9 digits total
      expect(isValidWhatsapp("081234567")).toBe(false);
    });

    it("should reject 08xx number with only 1 digit after prefix", () => {
      expect(isValidWhatsapp("081")).toBe(false);
    });

    it("should reject +62xx number with only 7 digits after prefix (9 total)", () => {
      // +62 + 7 digits = 9 digits total
      expect(isValidWhatsapp("+621234567")).toBe(false);
    });

    it("should reject +62xx number with only 1 digit after prefix", () => {
      expect(isValidWhatsapp("+621")).toBe(false);
    });
  });

  // ─── Invalid: too long ────────────────────────────────────────────────────

  describe("invalid: too long (> 15 digits total)", () => {
    it("should reject 08xx number with 16 digits total", () => {
      // 08 + 14 digits = 16 digits total
      expect(isValidWhatsapp("0812345678901234")).toBe(false);
    });

    it("should reject +62xx number with 16 digits total", () => {
      // +62 + 14 digits = 16 digits total
      expect(isValidWhatsapp("+62123456789012345")).toBe(false);
    });
  });

  // ─── Invalid: non-digit characters ───────────────────────────────────────

  describe("invalid: non-digit characters", () => {
    it("should reject number with spaces in the middle", () => {
      expect(isValidWhatsapp("0812 3456 7890")).toBe(false);
    });

    it("should reject number with dashes", () => {
      expect(isValidWhatsapp("0812-3456-7890")).toBe(false);
    });

    it("should reject number with parentheses", () => {
      expect(isValidWhatsapp("(0812)34567890")).toBe(false);
    });

    it("should reject number with letters mixed in", () => {
      expect(isValidWhatsapp("0812abc34567")).toBe(false);
    });

    it("should reject a purely alphabetic string", () => {
      expect(isValidWhatsapp("abcdefghij")).toBe(false);
    });

    it("should reject number with a dot separator", () => {
      expect(isValidWhatsapp("0812.3456.7890")).toBe(false);
    });
  });

  // ─── Invalid: wrong prefix ────────────────────────────────────────────────

  describe("invalid: wrong prefix", () => {
    it("should reject 62xx without leading + sign", () => {
      expect(isValidWhatsapp("6281234567890")).toBe(false);
    });

    it("should reject +63xx (Philippine prefix)", () => {
      expect(isValidWhatsapp("+6381234567890")).toBe(false);
    });

    it("should reject +1xx (US prefix)", () => {
      expect(isValidWhatsapp("+11234567890")).toBe(false);
    });

    it("should reject number starting with 09xx", () => {
      expect(isValidWhatsapp("091234567890")).toBe(false);
    });

    it("should reject number starting with 07xx", () => {
      expect(isValidWhatsapp("071234567890")).toBe(false);
    });

    it("should reject number starting with 00xx", () => {
      expect(isValidWhatsapp("006281234567890")).toBe(false);
    });

    it("should reject a plain 10-digit number with no valid prefix", () => {
      expect(isValidWhatsapp("1234567890")).toBe(false);
    });
  });

  // ─── Invalid: edge cases ─────────────────────────────────────────────────

  describe("invalid: edge cases", () => {
    it("should reject an empty string", () => {
      expect(isValidWhatsapp("")).toBe(false);
    });

    it("should reject null", () => {
      expect(isValidWhatsapp(null)).toBe(false);
    });

    it("should reject undefined", () => {
      expect(isValidWhatsapp(undefined)).toBe(false);
    });

    it("should reject a string of only spaces", () => {
      expect(isValidWhatsapp("   ")).toBe(false);
    });

    it("should reject a number with only the 08 prefix and no digits", () => {
      expect(isValidWhatsapp("08")).toBe(false);
    });

    it("should reject a number with only the +62 prefix and no digits", () => {
      expect(isValidWhatsapp("+62")).toBe(false);
    });
  });
});
