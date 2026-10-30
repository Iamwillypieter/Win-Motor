"use client";

import { useState, useRef, useCallback, useMemo } from "react";

/**
 * ImportExcelModal — import Barang Masuk massal dari Excel/CSV (smart import).
 *
 * Untuk tiap baris, sistem mencocokkan produk berdasarkan SKU/barcode:
 *   - Ditemukan & aktif → tambah stok (stock_added)
 *   - Belum terdaftar   → buat produk baru dengan stok awal = jumlah (created)
 * Mencegah duplikat (validasi client + pencarian SKU server-side).
 *
 * Flow:
 *  1. Upload file (.xlsx / .xls / .csv)
 *  2. Parse di client-side dengan SheetJS (xlsx)
 *  3. Preview + validasi per baris (termasuk status: tambah stok / produk baru)
 *  4. Konfirmasi → POST /api/products/import-stock-in
 *  5. Hasil per baris (berhasil/gagal + tindakan)
 *
 * @param {{
 *   existingSkus?: string[],        // SKU produk yang sudah ada (untuk preview match)
 *   onSuccess: (count: number) => void,
 *   onClose: () => void
 * }} props
 */

// Pemetaan header Excel (case-insensitive) → field internal.
// Mendukung header lama (name, sku, price, stock, ...) DAN header baru
// (Barcode/SKU, Nama Produk, Asal Barang, Harga Beli Satuan, ...).
const HEADER_MAP = {
  // SKU / Barcode
  sku: "sku",
  barcode: "sku",
  "barcode/sku": "sku",
  "sku/barcode": "sku",
  kode: "sku",
  "kode produk": "sku",
  // Nama
  "nama produk": "name",
  nama: "name",
  name: "name",
  produk: "name",
  // Merk / Brand
  merk: "brand",
  merek: "brand",
  brand: "brand",
  // Kategori
  kategori: "category",
  category: "category",
  // Asal Barang / Supplier
  "asal barang": "supplier",
  asal: "supplier",
  supplier: "supplier",
  pemasok: "supplier",
  // Harga Beli Satuan
  "harga beli satuan": "purchasePrice",
  "harga beli": "purchasePrice",
  "harga beli/satuan": "purchasePrice",
  purchaseprice: "purchasePrice",
  hargabeli: "purchasePrice",
  // Harga Jual
  "harga jual": "price",
  "harga jual satuan": "price",
  "harga jual (rp)": "price",
  price: "price",
  harga: "price",
  // Alias
  alias: "aliases",
  aliases: "aliases",
  "nama lain": "aliases",
  // Jumlah barang masuk
  "jumlah barang masuk": "qty",
  "jumlah masuk": "qty",
  jumlah: "qty",
  qty: "qty",
  quantity: "qty",
  stock: "qty",
  stok: "qty",
  "stok awal": "qty",
};

export default function ImportExcelModal({ existingSkus = [], onSuccess, onClose }) {
  // step: "upload" | "preview" | "result"
  const [step, setStep] = useState("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [rows, setRows] = useState([]); // data hasil parse
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const fileInputRef = useRef(null);

  // Set SKU yang sudah ada (uppercase) untuk preview "tambah stok" vs "produk baru"
  const skuSet = useMemo(
    () => new Set((existingSkus || []).map((s) => String(s).toUpperCase())),
    [existingSkus]
  );

  // ── Template download ────────────────────────────────────────────────────────

  async function handleDownloadTemplate() {
    const { utils, writeFile } = await import("xlsx");

    const templateRows = [
      {
        "Barcode/SKU": "BAN-001",
        "Nama Produk": "Ban Luar 70/90-17",
        Merk: "FDR",
        Kategori: "Ban",
        "Asal Barang": "Toko Ban Maju",
        "Harga Beli Satuan": 120000,
        "Harga Jual": 150000,
        Alias: "ban luar;ban motor",
        "Jumlah Barang Masuk": 10,
      },
      {
        "Barcode/SKU": "OLI-001",
        "Nama Produk": "Oli Mesin 800ml",
        Merk: "Yamalube",
        Kategori: "Oli & Pelumas",
        "Asal Barang": "",
        "Harga Beli Satuan": 35000,
        "Harga Jual": 45000,
        Alias: "oli mesin",
        "Jumlah Barang Masuk": 24,
      },
    ];

    const headerOrder = [
      "Barcode/SKU",
      "Nama Produk",
      "Merk",
      "Kategori",
      "Asal Barang",
      "Harga Beli Satuan",
      "Harga Jual",
      "Alias",
      "Jumlah Barang Masuk",
    ];

    const ws = utils.json_to_sheet(templateRows, { header: headerOrder });

    ws["!cols"] = [
      { wch: 16 }, // Barcode/SKU
      { wch: 28 }, // Nama Produk
      { wch: 14 }, // Merk
      { wch: 16 }, // Kategori
      { wch: 18 }, // Asal Barang
      { wch: 18 }, // Harga Beli Satuan
      { wch: 14 }, // Harga Jual
      { wch: 24 }, // Alias
      { wch: 18 }, // Jumlah Barang Masuk
    ];

    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Barang Masuk");
    writeFile(wb, "template-barang-masuk.xlsx");
  }

  // ── File parsing ─────────────────────────────────────────────────────────────

  async function parseFile(file) {
    setParseError("");

    const ext = file.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext)) {
      setParseError("Format file tidak didukung. Gunakan .xlsx, .xls, atau .csv");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setParseError("Ukuran file maksimal 10MB");
      return;
    }

    try {
      const { read, utils } = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = utils.sheet_to_json(ws, { defval: "" });

      if (data.length === 0) {
        setParseError("File kosong atau tidak ada data di sheet pertama");
        return;
      }

      if (data.length > 2000) {
        setParseError("Maksimal 2.000 baris per import");
        return;
      }

      // Normalisasi header via HEADER_MAP (case-insensitive)
      const normalized = data.map((raw, idx) => {
        const row = {};
        for (const [k, v] of Object.entries(raw)) {
          const field = HEADER_MAP[k.trim().toLowerCase()];
          if (field) row[field] = v;
        }
        return {
          _rowNum: idx + 2, // baris di Excel (baris 1 = header)
          sku: String(row.sku ?? "").trim(),
          name: String(row.name ?? "").trim(),
          brand: String(row.brand ?? "").trim(),
          category: String(row.category ?? "").trim(),
          supplier: String(row.supplier ?? "").trim(),
          purchasePrice:
            row.purchasePrice !== undefined && row.purchasePrice !== ""
              ? Number(row.purchasePrice)
              : "",
          price:
            row.price !== undefined && row.price !== "" ? Number(row.price) : "",
          aliases: String(row.aliases ?? "").trim(),
          qty: row.qty !== undefined && row.qty !== "" ? Number(row.qty) : "",
        };
      });

      setRows(normalized);
      setFileName(file.name);
      setStep("preview");
    } catch (err) {
      console.error("Parse error:", err);
      setParseError("Gagal membaca file. Pastikan format file benar.");
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  }

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) parseFile(file);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    []
  );

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  // ── Validasi per baris ───────────────────────────────────────────────────────

  function getRowError(row) {
    if (!row.sku) return "SKU/Barcode wajib diisi";
    if (
      row.qty === "" ||
      isNaN(row.qty) ||
      row.qty <= 0 ||
      !Number.isInteger(row.qty)
    )
      return "Jumlah barang masuk tidak valid";

    // Untuk produk yang belum terdaftar, wajib isi nama & harga jual
    if (!skuSet.has(row.sku.toUpperCase())) {
      if (!row.name) return "Nama wajib diisi (produk baru)";
      if (row.price === "" || isNaN(row.price) || row.price < 0)
        return "Harga jual wajib diisi (produk baru)";
    }
    return null;
  }

  function rowAction(row) {
    // "stock_added" jika SKU sudah ada, "created" jika produk baru
    return skuSet.has(row.sku.toUpperCase()) ? "stock_added" : "created";
  }

  const validRows = rows.filter((r) => !getRowError(r));
  const invalidRows = rows.filter((r) => !!getRowError(r));

  // ── Import ke API ────────────────────────────────────────────────────────────

  async function handleImport() {
    if (validRows.length === 0) return;
    setImporting(true);
    setParseError("");

    try {
      const payload = validRows.map((r) => ({
        sku: r.sku,
        name: r.name || null,
        price: r.price !== "" && !isNaN(r.price) ? Number(r.price) : null,
        qty: Number(r.qty),
        brand: r.brand || null,
        category: r.category || null,
        aliases: r.aliases || "",
        supplier: r.supplier || null,
        purchasePrice:
          r.purchasePrice !== "" && !isNaN(r.purchasePrice)
            ? Number(r.purchasePrice)
            : null,
        _rowNum: r._rowNum,
      }));

      const res = await fetch("/api/products/import-stock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });

      const json = await res.json();

      if (!res.ok) {
        setParseError(json.error?.message || "Gagal mengimport data");
        return;
      }

      setImportResults(json.data);
      setStep("result");

      if (json.data.success > 0) {
        onSuccess(json.data.success);
      }
    } catch {
      setParseError("Gagal terhubung ke server. Coba lagi.");
    } finally {
      setImporting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Import Barang Masuk dari Excel"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Import Barang Masuk dari Excel
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {step === "upload" &&
                "Cocokkan SKU/barcode: produk lama → tambah stok, produk baru → dibuat"}
              {step === "preview" &&
                `Preview data dari "${fileName}" — ${rows.length} baris ditemukan`}
              {step === "result" && "Hasil Import"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Tutup"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Step: Upload ── */}
          {step === "upload" && (
            <div className="p-6 space-y-6">
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
                }`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
                    <svg
                      className="w-7 h-7 text-blue-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Drag &amp; drop file ke sini, atau{" "}
                      <span className="text-blue-600">klik untuk pilih file</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      .xlsx, .xls, .csv — maks. 10MB
                    </p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {parseError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {parseError}
                </div>
              )}

              {/* Panduan kolom */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700">
                    Format Kolom Template
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    SKU/barcode cocok → stok bertambah. Belum terdaftar → produk
                    baru dibuat (wajib Nama &amp; Harga Jual).
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                          Kolom
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                          Wajib
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                          Contoh
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                          Keterangan
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[
                        {
                          col: "Barcode/SKU",
                          req: true,
                          ex: "BAN-001",
                          note: "Kode unik produk (otomatis huruf besar)",
                        },
                        {
                          col: "Nama Produk",
                          req: "produk baru",
                          ex: "Ban Luar 70/90",
                          note: "Wajib jika produk belum terdaftar",
                        },
                        {
                          col: "Merk",
                          req: false,
                          ex: "FDR",
                          note: "Merk produk",
                        },
                        {
                          col: "Kategori",
                          req: false,
                          ex: "Ban",
                          note: "Kategori produk",
                        },
                        {
                          col: "Asal Barang",
                          req: false,
                          ex: "Toko Ban Maju",
                          note: "Nama supplier (opsional)",
                        },
                        {
                          col: "Harga Beli Satuan",
                          req: false,
                          ex: "120000",
                          note: "Harga modal per satuan (rupiah)",
                        },
                        {
                          col: "Harga Jual",
                          req: "produk baru",
                          ex: "150000",
                          note: "Wajib jika produk belum terdaftar",
                        },
                        {
                          col: "Alias",
                          req: false,
                          ex: "ban luar;ban motor",
                          note: "Dipisah titik koma (;)",
                        },
                        {
                          col: "Jumlah Barang Masuk",
                          req: true,
                          ex: "10",
                          note: "Jumlah yang ditambahkan ke stok",
                        },
                      ].map(({ col, req, ex, note }) => (
                        <tr key={col} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-blue-700">{col}</td>
                          <td className="px-3 py-2">
                            {req === true ? (
                              <span className="text-red-600 font-medium">Wajib</span>
                            ) : req === "produk baru" ? (
                              <span className="text-amber-600 font-medium">
                                Produk baru
                              </span>
                            ) : (
                              <span className="text-gray-400">Opsional</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600 font-mono">{ex}</td>
                          <td className="px-3 py-2 text-gray-500">{note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Download template */}
              <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
                <svg
                  className="w-5 h-5 text-blue-500 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <div className="flex-1 text-sm text-blue-800">
                  Belum punya template? Download template Excel yang sudah diformat
                  dengan benar.
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="text-sm font-medium text-blue-700 hover:text-blue-900 underline whitespace-nowrap"
                >
                  Download Template
                </button>
              </div>
            </div>
          )}

          {/* ── Step: Preview ── */}
          {step === "preview" && (
            <div className="p-6 space-y-4">
              {/* Ringkasan validasi */}
              <div className="flex gap-3 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                  <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-sm text-green-800 font-medium">
                    {validRows.length} baris valid
                  </span>
                </div>
                {invalidRows.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                    <span className="text-sm text-red-800 font-medium">
                      {invalidRows.length} baris error (akan dilewati)
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
                  <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                  <span className="text-sm text-blue-800 font-medium">
                    {validRows.filter((r) => rowAction(r) === "stock_added").length}{" "}
                    tambah stok
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
                  <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                  <span className="text-sm text-purple-800 font-medium">
                    {validRows.filter((r) => rowAction(r) === "created").length}{" "}
                    produk baru
                  </span>
                </div>
              </div>

              {parseError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {parseError}
                </div>
              )}

              {/* Tabel preview */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto max-h-[400px]">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 w-10">
                          #
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                          SKU
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                          Nama
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                          Merk
                        </th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">
                          Harga Jual
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                          Asal Barang
                        </th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">
                          Jumlah
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((row) => {
                        const err = getRowError(row);
                        const action = rowAction(row);
                        return (
                          <tr
                            key={row._rowNum}
                            className={err ? "bg-red-50" : "hover:bg-gray-50"}
                          >
                            <td className="px-3 py-2 text-gray-400">{row._rowNum}</td>
                            <td className="px-3 py-2 font-mono text-gray-700">
                              {row.sku || (
                                <span className="text-red-400 italic">kosong</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate">
                              {row.name || (
                                <span className="text-gray-300 italic">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{row.brand || "—"}</td>
                            <td className="px-3 py-2 text-right text-gray-700">
                              {row.price !== "" && !isNaN(row.price)
                                ? `Rp ${Number(row.price).toLocaleString("id-ID")}`
                                : "—"}
                            </td>
                            <td className="px-3 py-2 text-gray-600">
                              {row.supplier || "—"}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700">
                              {row.qty === "" ? (
                                <span className="text-red-400">—</span>
                              ) : (
                                row.qty
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {err ? (
                                <span className="inline-flex items-center gap-1 text-red-600">
                                  <svg
                                    className="w-3.5 h-3.5 flex-shrink-0"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  {err}
                                </span>
                              ) : action === "stock_added" ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 font-medium">
                                  Tambah Stok
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-purple-700 font-medium">
                                  Produk Baru
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Step: Result ── */}
          {step === "result" && importResults && (
            <div className="p-6 space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {importResults.total}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Total Diproses</p>
                </div>
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {importResults.success}
                  </p>
                  <p className="text-xs text-green-600 mt-1">Berhasil</p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
                  <p className="text-2xl font-bold text-red-700">
                    {importResults.failed}
                  </p>
                  <p className="text-xs text-red-600 mt-1">Gagal</p>
                </div>
              </div>

              {/* Rincian tindakan */}
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
                  <span className="text-sm text-blue-800 font-medium">
                    {
                      importResults.results.filter(
                        (r) => r.status === "success" && r.action === "stock_added"
                      ).length
                    }{" "}
                    produk stok bertambah
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
                  <span className="text-sm text-purple-800 font-medium">
                    {
                      importResults.results.filter(
                        (r) => r.status === "success" && r.action === "created"
                      ).length
                    }{" "}
                    produk baru dibuat
                  </span>
                </div>
              </div>

              {/* Detail hasil per baris yang gagal */}
              {importResults.failed > 0 && (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-sm font-medium text-gray-700">
                      Detail Baris yang Gagal
                    </h3>
                  </div>
                  <div className="overflow-x-auto max-h-[300px]">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Baris
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            SKU
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Nama
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Keterangan Error
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importResults.results
                          .filter((r) => r.status === "failed")
                          .map((r) => (
                            <tr key={`${r.row}-${r.sku}`} className="bg-red-50">
                              <td className="px-3 py-2 text-gray-500">{r.row}</td>
                              <td className="px-3 py-2 font-mono text-gray-700">
                                {r.sku}
                              </td>
                              <td className="px-3 py-2 text-gray-700">{r.name}</td>
                              <td className="px-3 py-2 text-red-600">{r.error}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          {/* Kiri */}
          <div>
            {step === "preview" && (
              <button
                onClick={() => {
                  setStep("upload");
                  setRows([]);
                  setFileName("");
                  setParseError("");
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← Ganti File
              </button>
            )}
          </div>

          {/* Kanan */}
          <div className="flex gap-3">
            {step === "result" ? (
              <button
                onClick={onClose}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Selesai
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Batal
                </button>
                {step === "preview" && (
                  <button
                    onClick={handleImport}
                    disabled={importing || validRows.length === 0}
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2"
                  >
                    {importing && (
                      <svg
                        className="animate-spin w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
                    )}
                    {importing
                      ? "Mengimport..."
                      : `Import ${validRows.length} Baris`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
