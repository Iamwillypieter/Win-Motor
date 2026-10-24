"use client";

import { useState, useRef, useCallback } from "react";

/**
 * ImportExcelModal — modal untuk import produk massal dari file Excel/CSV.
 *
 * Flow:
 *  1. Upload file (.xlsx / .xls / .csv)
 *  2. Parse di client-side menggunakan SheetJS (xlsx)
 *  3. Tampilkan tabel preview + validasi per baris
 *  4. User konfirmasi → kirim ke POST /api/products/import
 *  5. Tampilkan hasil (berhasil/gagal per baris)
 *
 * @param {{
 *   onSuccess: (count: number) => void,
 *   onClose: () => void
 * }} props
 */
export default function ImportExcelModal({ onSuccess, onClose }) {
  // step: "upload" | "preview" | "result"
  const [step, setStep] = useState("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [rows, setRows] = useState([]); // data hasil parse
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const fileInputRef = useRef(null);

  // ── Template download ────────────────────────────────────────────────────────

  async function handleDownloadTemplate() {
    const { utils, writeFile } = await import("xlsx");

    const templateRows = [
      {
        name: "Contoh Produk A",
        sku: "PRD-001",
        price: 50000,
        stock: 10,
        brand: "Merk A",
        category: "Kategori A",
        aliases: "nama lain;sebutan lain",
      },
      {
        name: "Contoh Produk B",
        sku: "PRD-002",
        price: 75000,
        stock: 5,
        brand: "Merk B",
        category: "Kategori B",
        aliases: "",
      },
    ];

    const ws = utils.json_to_sheet(templateRows, {
      header: ["name", "sku", "price", "stock", "brand", "category", "aliases"],
    });

    // Lebar kolom
    ws["!cols"] = [
      { wch: 30 }, // name
      { wch: 15 }, // sku
      { wch: 12 }, // price
      { wch: 10 }, // stock
      { wch: 20 }, // brand
      { wch: 20 }, // category
      { wch: 30 }, // aliases
    ];

    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Produk");
    writeFile(wb, "template-import-produk.xlsx");
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

      // Normalisasi header — case-insensitive, trim whitespace
      const normalized = data.map((raw, idx) => {
        const row = {};
        for (const [k, v] of Object.entries(raw)) {
          row[k.trim().toLowerCase()] = v;
        }
        return {
          _rowNum: idx + 2, // baris di Excel (baris 1 = header)
          name: String(row.name ?? "").trim(),
          sku: String(row.sku ?? "").trim(),
          price: row.price !== "" ? Number(row.price) : "",
          stock: row.stock !== "" ? Number(row.stock) : 0,
          brand: String(row.brand ?? "").trim(),
          category: String(row.category ?? "").trim(),
          aliases: String(row.aliases ?? "").trim(),
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

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  // ── Validasi per baris ───────────────────────────────────────────────────────

  function getRowError(row) {
    if (!row.name) return "Nama wajib diisi";
    if (!row.sku) return "SKU wajib diisi";
    if (row.price === "" || isNaN(row.price) || row.price < 0)
      return "Harga tidak valid";
    if (isNaN(row.stock) || row.stock < 0) return "Stok tidak valid";
    return null;
  }

  const validRows = rows.filter((r) => !getRowError(r));
  const invalidRows = rows.filter((r) => !!getRowError(r));

  // ── Import ke API ────────────────────────────────────────────────────────────

  async function handleImport() {
    if (validRows.length === 0) return;
    setImporting(true);

    try {
      const payload = validRows.map((r) => ({
        name: r.name,
        sku: r.sku,
        price: Number(r.price),
        stock: Number(r.stock),
        brand: r.brand || null,
        category: r.category || null,
        aliases: r.aliases || "",
      }));

      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: payload }),
      });

      const json = await res.json();

      if (!res.ok) {
        setParseError(json.error?.message || "Gagal mengimport produk");
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
      aria-label="Import Produk dari Excel"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Import Produk dari Excel</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {step === "upload" && "Upload file Excel atau CSV berisi data produk"}
              {step === "preview" && `Preview data dari "${fileName}" — ${rows.length} baris ditemukan`}
              {step === "result" && "Hasil Import"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Tutup"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
                    <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Drag & drop file ke sini, atau{" "}
                      <span className="text-blue-600">klik untuk pilih file</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv — maks. 10MB</p>
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
                  <h3 className="text-sm font-medium text-gray-700">Format Kolom Excel</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Kolom</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Wajib</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Contoh</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[
                        { col: "name", req: true, ex: "Ban Luar 70/90", note: "Nama produk" },
                        { col: "sku", req: true, ex: "BAN-001", note: "Kode unik, otomatis jadi huruf besar" },
                        { col: "price", req: true, ex: "85000", note: "Harga dalam rupiah (angka bulat)" },
                        { col: "stock", req: false, ex: "15", note: "Stok awal, default 0" },
                        { col: "brand", req: false, ex: "FDR", note: "Merk produk" },
                        { col: "category", req: false, ex: "Ban", note: "Kategori produk" },
                        { col: "aliases", req: false, ex: "ban luar;ban motor", note: "Nama alias dipisah titik koma (;)" },
                      ].map(({ col, req, ex, note }) => (
                        <tr key={col} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-blue-700">{col}</td>
                          <td className="px-3 py-2">
                            {req ? (
                              <span className="text-red-600 font-medium">Wajib</span>
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
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="flex-1 text-sm text-blue-800">
                  Belum punya template? Download template Excel yang sudah diformat dengan benar.
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
                  <span className="text-sm text-green-800 font-medium">{validRows.length} baris valid</span>
                </div>
                {invalidRows.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                    <span className="text-sm text-red-800 font-medium">{invalidRows.length} baris error (akan dilewati)</span>
                  </div>
                )}
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
                        <th className="px-3 py-2 text-left font-medium text-gray-600 w-10">#</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Nama</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">SKU</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">Harga</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">Stok</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Merk</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Kategori</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((row) => {
                        const err = getRowError(row);
                        return (
                          <tr
                            key={row._rowNum}
                            className={err ? "bg-red-50" : "hover:bg-gray-50"}
                          >
                            <td className="px-3 py-2 text-gray-400">{row._rowNum}</td>
                            <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate">{row.name || <span className="text-red-400 italic">kosong</span>}</td>
                            <td className="px-3 py-2 font-mono text-gray-700">{row.sku || <span className="text-red-400 italic">kosong</span>}</td>
                            <td className="px-3 py-2 text-right text-gray-700">
                              {row.price !== "" && !isNaN(row.price)
                                ? `Rp ${Number(row.price).toLocaleString("id-ID")}`
                                : <span className="text-red-400">-</span>}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700">{row.stock}</td>
                            <td className="px-3 py-2 text-gray-600">{row.brand}</td>
                            <td className="px-3 py-2 text-gray-600">{row.category}</td>
                            <td className="px-3 py-2">
                              {err ? (
                                <span className="inline-flex items-center gap-1 text-red-600">
                                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                  </svg>
                                  {err}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-green-600">
                                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  Valid
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
                  <p className="text-2xl font-bold text-gray-900">{importResults.total}</p>
                  <p className="text-xs text-gray-500 mt-1">Total Diproses</p>
                </div>
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">{importResults.success}</p>
                  <p className="text-xs text-green-600 mt-1">Berhasil Diimport</p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
                  <p className="text-2xl font-bold text-red-700">{importResults.failed}</p>
                  <p className="text-xs text-red-600 mt-1">Gagal</p>
                </div>
              </div>

              {/* Detail hasil per baris */}
              {importResults.failed > 0 && (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-sm font-medium text-gray-700">Detail Baris yang Gagal</h3>
                  </div>
                  <div className="overflow-x-auto max-h-[300px]">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Baris</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">SKU</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Nama</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Keterangan Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importResults.results
                          .filter((r) => r.status === "failed")
                          .map((r) => (
                            <tr key={`${r.row}-${r.sku}`} className="bg-red-50">
                              <td className="px-3 py-2 text-gray-500">{r.row}</td>
                              <td className="px-3 py-2 font-mono text-gray-700">{r.sku}</td>
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
                onClick={() => { setStep("upload"); setRows([]); setFileName(""); setParseError(""); }}
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
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    )}
                    {importing ? "Mengimport..." : `Import ${validRows.length} Produk`}
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
