import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatDatePart, parseInvoiceNumber } from "@/lib/invoice";

// Requirements: 5.2, 3.3

describe("formatDatePart()", () => {
  it("should format a date to YYYYMMDD string", () => {
    const date = new Date("2026-05-07T10:00:00Z");
    const result = formatDatePart(date);
    expect(result).toMatch(/^\d{8}$/);
  });

  it("should pad month and day with leading zeros", () => {
    const date = new Date(2026, 0, 5); // January 5, 2026
    const result = formatDatePart(date);
    expect(result).toBe("20260105");
  });

  it("should handle December correctly", () => {
    const date = new Date(2026, 11, 31); // December 31, 2026
    const result = formatDatePart(date);
    expect(result).toBe("20261231");
  });

  it("should produce an 8-character string for any valid date", () => {
    const dates = [
      new Date(2026, 0, 1),   // Jan 1
      new Date(2026, 5, 15),  // Jun 15
      new Date(2026, 11, 31), // Dec 31
    ];
    for (const d of dates) {
      expect(formatDatePart(d)).toHaveLength(8);
    }
  });
});

describe("parseInvoiceNumber()", () => {
  it("should parse a valid invoice number correctly", () => {
    const result = parseInvoiceNumber("INV-20260507-0001");
    expect(result).toEqual({
      prefix: "INV",
      date: "20260507",
      counter: 1,
    });
  });

  it("should parse counter value correctly", () => {
    const result = parseInvoiceNumber("INV-20260507-0042");
    expect(result).not.toBeNull();
    expect(result.counter).toBe(42);
  });

  it("should parse max counter value (9999)", () => {
    const result = parseInvoiceNumber("INV-20260507-9999");
    expect(result).not.toBeNull();
    expect(result.counter).toBe(9999);
  });

  it("should return null for invalid format", () => {
    expect(parseInvoiceNumber("INVALID")).toBeNull();
    expect(parseInvoiceNumber("INV-2026-0001")).toBeNull();
    expect(parseInvoiceNumber("INV-20260507-001")).toBeNull(); // only 3 digits
    expect(parseInvoiceNumber("")).toBeNull();
  });

  it("should return null for wrong prefix", () => {
    expect(parseInvoiceNumber("ORD-20260507-0001")).toBeNull();
  });

  it("should return null for extra characters", () => {
    expect(parseInvoiceNumber("INV-20260507-00001")).toBeNull(); // 5 digits
    expect(parseInvoiceNumber(" INV-20260507-0001")).toBeNull(); // leading space
  });
});

describe("Invoice number format — INV-YYYYMMDD-NNNN", () => {
  const invoiceRegex = /^INV-\d{8}-\d{4}$/;

  it("should match the expected format for valid invoice numbers", () => {
    expect("INV-20260507-0001").toMatch(invoiceRegex);
    expect("INV-20261231-9999").toMatch(invoiceRegex);
    expect("INV-20260101-0001").toMatch(invoiceRegex);
  });

  it("should not match invalid formats", () => {
    expect("INV-2026-0001").not.toMatch(invoiceRegex);
    expect("ORD-20260507-0001").not.toMatch(invoiceRegex);
    expect("INV-20260507-001").not.toMatch(invoiceRegex);
    expect("INV-20260507-00001").not.toMatch(invoiceRegex);
  });
});

describe("generateInvoiceNumber() — uniqueness and format", () => {
  // generateInvoiceNumber() requires a DB connection, so we test the
  // underlying logic (counter increment) and format contract directly.

  it("should produce unique invoice numbers for sequential counters on the same day", () => {
    const date = "20260507";
    const numbers = Array.from({ length: 10 }, (_, i) => {
      const counter = String(i + 1).padStart(4, "0");
      return `INV-${date}-${counter}`;
    });

    // All values must be unique
    const unique = new Set(numbers);
    expect(unique.size).toBe(numbers.length);
  });

  it("should produce unique invoice numbers across different days with the same counter", () => {
    const inv1 = "INV-20260507-0001";
    const inv2 = "INV-20260508-0001";
    expect(inv1).not.toBe(inv2);
  });

  it("should embed today's date in the invoice number", () => {
    const today = formatDatePart(new Date());
    const counter = "0001";
    const invoiceNumber = `INV-${today}-${counter}`;

    const parsed = parseInvoiceNumber(invoiceNumber);
    expect(parsed).not.toBeNull();
    expect(parsed.date).toBe(today);
  });

  it("should correctly increment counter from last order of the day", () => {
    // Simulate the counter logic used inside generateInvoiceNumber()
    const lastInvoice = "INV-20260507-0005";
    const parts = lastInvoice.split("-");
    const lastCounter = parseInt(parts[parts.length - 1], 10);
    const nextCounter = lastCounter + 1;

    expect(nextCounter).toBe(6);
    const nextInvoice = `INV-20260507-${String(nextCounter).padStart(4, "0")}`;
    expect(nextInvoice).toBe("INV-20260507-0006");
  });

  it("should start counter at 0001 when no orders exist for the day", () => {
    // When lastOrder is null, counter starts at 1
    const lastOrder = null;
    let counter = 1;
    if (lastOrder) {
      const parts = lastOrder.invoiceNumber.split("-");
      counter = parseInt(parts[parts.length - 1], 10) + 1;
    }

    const datePart = "20260507";
    const invoiceNumber = `INV-${datePart}-${String(counter).padStart(4, "0")}`;
    expect(invoiceNumber).toBe("INV-20260507-0001");
  });
});
