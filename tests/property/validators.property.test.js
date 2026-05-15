/**
 * Property-Based Tests: Validasi Format WhatsApp (Property 3)
 *
 * **Validates: Requirements 3.4**
 *
 * Property 3: Validasi Format WhatsApp
 * Fungsi `isValidWhatsapp` harus menerima semua format valid dan menolak
 * semua format tidak valid secara konsisten untuk input arbitrer.
 *
 * Sub-properties yang diuji:
 *   P3a: Semua string dengan prefix "08" diikuti 8–13 digit → true
 *   P3b: Semua string dengan prefix "+62" diikuti 8–13 digit → true
 *   P3c: String yang tidak cocok dengan pola valid → false
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { isValidWhatsapp } from "@/lib/validators";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Menghasilkan string digit acak dengan panjang tertentu.
 * @param {number} min - panjang minimum
 * @param {number} max - panjang maksimum
 */
const arbDigits = (min, max) =>
  fc
    .integer({ min, max })
    .chain((len) =>
      fc.array(fc.integer({ min: 0, max: 9 }), { minLength: len, maxLength: len })
    )
    .map((digits) => digits.join(""));

/**
 * Nomor WhatsApp valid format 08xx:
 * "08" + 8–13 digit = total 10–15 karakter
 */
const arbValid08 = arbDigits(8, 13).map((digits) => `08${digits}`);

/**
 * Nomor WhatsApp valid format +62xx:
 * "+62" + 8–13 digit = total 11–16 karakter
 */
const arbValidPlus62 = arbDigits(8, 13).map((digits) => `+62${digits}`);

/**
 * Nomor 08xx yang terlalu pendek: "08" + 0–7 digit (total < 10 karakter)
 */
const arbTooShort08 = arbDigits(0, 7).map((digits) => `08${digits}`);

/**
 * Nomor 08xx yang terlalu panjang: "08" + 14+ digit (total > 15 karakter)
 */
const arbTooLong08 = arbDigits(14, 20).map((digits) => `08${digits}`);

/**
 * Nomor +62xx yang terlalu pendek: "+62" + 0–7 digit (total < 11 karakter)
 */
const arbTooShortPlus62 = arbDigits(0, 7).map((digits) => `+62${digits}`);

/**
 * Nomor +62xx yang terlalu panjang: "+62" + 14+ digit (total > 16 karakter)
 */
const arbTooLongPlus62 = arbDigits(14, 20).map((digits) => `+62${digits}`);

/**
 * String dengan prefix yang salah (bukan "08" atau "+62"):
 * Menggunakan prefix lain yang umum.
 */
const arbWrongPrefix = fc.oneof(
  // Prefix numerik lain
  arbDigits(8, 13).map((d) => `09${d}`),
  arbDigits(8, 13).map((d) => `07${d}`),
  arbDigits(8, 13).map((d) => `62${d}`),   // tanpa +
  arbDigits(8, 13).map((d) => `+63${d}`),  // prefix Filipina
  arbDigits(8, 13).map((d) => `+1${d}`),   // prefix AS
  arbDigits(8, 13).map((d) => `+44${d}`),  // prefix UK
  // Hanya digit tanpa prefix yang valid
  arbDigits(8, 13).map((d) => `1${d}`),
  arbDigits(8, 13).map((d) => `2${d}`)
);

/**
 * String yang mengandung karakter non-digit di tengah nomor yang seharusnya valid.
 * Contoh: "0812-3456-7890", "0812 3456 7890"
 */
const arbWithSeparators = fc.oneof(
  arbDigits(4, 6).chain((a) =>
    arbDigits(4, 6).map((b) => `08${a}-${b}`)
  ),
  arbDigits(4, 6).chain((a) =>
    arbDigits(4, 6).map((b) => `08${a} ${b}`)
  ),
  arbDigits(4, 6).chain((a) =>
    arbDigits(4, 6).map((b) => `+62${a}-${b}`)
  ),
  arbDigits(4, 6).chain((a) =>
    arbDigits(4, 6).map((b) => `+62${a} ${b}`)
  )
);

/**
 * String kosong atau hanya whitespace.
 */
const arbEmptyOrWhitespace = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  fc.constant("\t"),
  fc.constant("\n")
);

/**
 * String alfanumerik acak yang tidak cocok dengan pola valid.
 * Difilter untuk memastikan tidak secara kebetulan valid.
 */
const arbRandomInvalid = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => {
    const trimmed = s.trim();
    return !/^(\+62|08)\d{8,13}$/.test(trimmed);
  });

// ---------------------------------------------------------------------------
// P3a: Format 08xx Valid
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------

describe("P3a: Format 08xx — semua nomor valid diterima", () => {
  it(
    "harus mengembalikan true untuk setiap string '08' + 8–13 digit",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Untuk setiap string yang diawali "08" diikuti tepat 8–13 digit
       * (total 10–15 karakter), isValidWhatsapp() harus mengembalikan true.
       * Ini memverifikasi bahwa semua nomor format 08xx yang valid diterima
       * secara konsisten.
       */
      fc.assert(
        fc.property(arbValid08, (number) => {
          expect(isValidWhatsapp(number)).toBe(true);
        }),
        { numRuns: 500 }
      );
    }
  );

  it(
    "harus mengembalikan true untuk nomor 08xx dengan spasi di awal/akhir (trimmed)",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Fungsi harus melakukan trim() sebelum validasi, sehingga nomor valid
       * yang dikelilingi spasi tetap diterima.
       */
      fc.assert(
        fc.property(
          arbValid08,
          fc.integer({ min: 0, max: 5 }),
          fc.integer({ min: 0, max: 5 }),
          (number, leadingSpaces, trailingSpaces) => {
            const padded =
              " ".repeat(leadingSpaces) + number + " ".repeat(trailingSpaces);
            expect(isValidWhatsapp(padded)).toBe(true);
          }
        ),
        { numRuns: 300 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P3b: Format +62xx Valid
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------

describe("P3b: Format +62xx — semua nomor valid diterima", () => {
  it(
    "harus mengembalikan true untuk setiap string '+62' + 8–13 digit",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Untuk setiap string yang diawali "+62" diikuti tepat 8–13 digit
       * (total 11–16 karakter), isValidWhatsapp() harus mengembalikan true.
       * Ini memverifikasi bahwa semua nomor format +62xx yang valid diterima
       * secara konsisten.
       */
      fc.assert(
        fc.property(arbValidPlus62, (number) => {
          expect(isValidWhatsapp(number)).toBe(true);
        }),
        { numRuns: 500 }
      );
    }
  );

  it(
    "harus mengembalikan true untuk nomor +62xx dengan spasi di awal/akhir (trimmed)",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Fungsi harus melakukan trim() sebelum validasi, sehingga nomor valid
       * yang dikelilingi spasi tetap diterima.
       */
      fc.assert(
        fc.property(
          arbValidPlus62,
          fc.integer({ min: 0, max: 5 }),
          fc.integer({ min: 0, max: 5 }),
          (number, leadingSpaces, trailingSpaces) => {
            const padded =
              " ".repeat(leadingSpaces) + number + " ".repeat(trailingSpaces);
            expect(isValidWhatsapp(padded)).toBe(true);
          }
        ),
        { numRuns: 300 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P3c: Format Tidak Valid Ditolak
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------

describe("P3c: Format tidak valid — semua nomor tidak valid ditolak", () => {
  it(
    "harus mengembalikan false untuk nomor 08xx yang terlalu pendek (< 10 digit total)",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Nomor dengan prefix "08" tetapi kurang dari 8 digit setelahnya
       * (total < 10 karakter) harus selalu ditolak.
       */
      fc.assert(
        fc.property(arbTooShort08, (number) => {
          expect(isValidWhatsapp(number)).toBe(false);
        }),
        { numRuns: 300 }
      );
    }
  );

  it(
    "harus mengembalikan false untuk nomor 08xx yang terlalu panjang (> 15 digit total)",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Nomor dengan prefix "08" tetapi lebih dari 13 digit setelahnya
       * (total > 15 karakter) harus selalu ditolak.
       */
      fc.assert(
        fc.property(arbTooLong08, (number) => {
          expect(isValidWhatsapp(number)).toBe(false);
        }),
        { numRuns: 300 }
      );
    }
  );

  it(
    "harus mengembalikan false untuk nomor +62xx yang terlalu pendek (< 11 karakter total)",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Nomor dengan prefix "+62" tetapi kurang dari 8 digit setelahnya
       * (total < 11 karakter) harus selalu ditolak.
       */
      fc.assert(
        fc.property(arbTooShortPlus62, (number) => {
          expect(isValidWhatsapp(number)).toBe(false);
        }),
        { numRuns: 300 }
      );
    }
  );

  it(
    "harus mengembalikan false untuk nomor +62xx yang terlalu panjang (> 16 karakter total)",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Nomor dengan prefix "+62" tetapi lebih dari 13 digit setelahnya
       * (total > 16 karakter) harus selalu ditolak.
       */
      fc.assert(
        fc.property(arbTooLongPlus62, (number) => {
          expect(isValidWhatsapp(number)).toBe(false);
        }),
        { numRuns: 300 }
      );
    }
  );

  it(
    "harus mengembalikan false untuk nomor dengan prefix yang salah",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Nomor yang tidak diawali "08" atau "+62" harus selalu ditolak,
       * terlepas dari panjang atau konten digit-nya.
       */
      fc.assert(
        fc.property(arbWrongPrefix, (number) => {
          expect(isValidWhatsapp(number)).toBe(false);
        }),
        { numRuns: 500 }
      );
    }
  );

  it(
    "harus mengembalikan false untuk nomor yang mengandung karakter non-digit (separator)",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Nomor yang mengandung tanda hubung, spasi di tengah, atau karakter
       * pemisah lainnya harus selalu ditolak — hanya digit murni yang valid.
       */
      fc.assert(
        fc.property(arbWithSeparators, (number) => {
          expect(isValidWhatsapp(number)).toBe(false);
        }),
        { numRuns: 300 }
      );
    }
  );

  it(
    "harus mengembalikan false untuk string kosong atau hanya whitespace",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * String kosong dan string yang hanya berisi whitespace harus ditolak.
       */
      fc.assert(
        fc.property(arbEmptyOrWhitespace, (input) => {
          expect(isValidWhatsapp(input)).toBe(false);
        })
      );
    }
  );

  it(
    "harus mengembalikan false untuk null dan undefined",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Input null dan undefined harus ditolak tanpa melempar exception.
       */
      expect(isValidWhatsapp(null)).toBe(false);
      expect(isValidWhatsapp(undefined)).toBe(false);
    }
  );

  it(
    "harus mengembalikan false untuk string acak yang tidak cocok dengan pola valid",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Untuk setiap string arbitrer yang tidak cocok dengan pola
       * /^(\+62|08)\d{8,13}$/, isValidWhatsapp() harus mengembalikan false.
       * Ini adalah properti utama yang memverifikasi konsistensi penolakan.
       */
      fc.assert(
        fc.property(arbRandomInvalid, (input) => {
          expect(isValidWhatsapp(input)).toBe(false);
        }),
        { numRuns: 1000 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// P3 (Combined): Konsistensi Keseluruhan
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------

describe("P3: Konsistensi keseluruhan — valid ↔ invalid tidak tumpang tindih", () => {
  it(
    "tidak ada nomor valid yang juga dianggap tidak valid (determinisme)",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Fungsi harus deterministik: memanggil isValidWhatsapp() dua kali
       * dengan input yang sama harus selalu menghasilkan hasil yang sama.
       * Ini memverifikasi tidak ada side-effect atau non-determinisme.
       */
      fc.assert(
        fc.property(
          fc.oneof(arbValid08, arbValidPlus62),
          (number) => {
            const result1 = isValidWhatsapp(number);
            const result2 = isValidWhatsapp(number);
            expect(result1).toBe(result2);
            expect(result1).toBe(true);
          }
        ),
        { numRuns: 500 }
      );
    }
  );

  it(
    "tidak ada nomor tidak valid yang juga dianggap valid (determinisme)",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Fungsi harus deterministik untuk input tidak valid juga:
       * memanggil dua kali harus menghasilkan false yang konsisten.
       */
      fc.assert(
        fc.property(
          fc.oneof(arbTooShort08, arbTooLong08, arbTooShortPlus62, arbTooLongPlus62, arbWrongPrefix),
          (number) => {
            const result1 = isValidWhatsapp(number);
            const result2 = isValidWhatsapp(number);
            expect(result1).toBe(result2);
            expect(result1).toBe(false);
          }
        ),
        { numRuns: 500 }
      );
    }
  );

  it(
    "hasil validasi konsisten dengan regex referensi /^(\\+62|08)\\d{8,13}$/",
    () => {
      /**
       * **Validates: Requirements 3.4**
       *
       * Untuk setiap string arbitrer, hasil isValidWhatsapp() harus konsisten
       * dengan regex referensi dari design document.
       * Ini adalah properti round-trip yang memverifikasi implementasi
       * sesuai dengan spesifikasi.
       */
      const referenceRegex = /^(\+62|08)\d{8,13}$/;

      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 25 }),
          (input) => {
            const trimmed = input.trim();
            const expected = referenceRegex.test(trimmed);
            // null/undefined/empty sudah ditangani sebelum regex
            const actual = isValidWhatsapp(input);
            expect(actual).toBe(expected);
          }
        ),
        { numRuns: 2000 }
      );
    }
  );
});
