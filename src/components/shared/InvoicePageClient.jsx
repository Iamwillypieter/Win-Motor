"use client";

import { useState, useEffect } from "react";
import InvoicePrint from "@/components/shared/InvoicePrint";
import PrintButton from "@/components/shared/PrintButton";

/**
 * InvoicePageClient — wrapper client untuk halaman invoice.
 * Membaca preferensi ukuran kertas dari localStorage agar preview
 * di layar sesuai dengan output cetak thermal printer.
 *
 * @param {{ invoice: Object }} props
 */
export default function InvoicePageClient({ invoice }) {
  const [paperSize, setPaperSize] = useState("80mm");

  // Sinkron dengan preferensi yang disimpan PrintButton
  useEffect(() => {
    const syncSize = () => {
      const saved = localStorage.getItem("thermal-paper-size");
      if (saved === "58mm" || saved === "80mm") setPaperSize(saved);
    };

    syncSize();

    // Dengarkan perubahan dari PrintButton di tab yang sama
    window.addEventListener("storage", syncSize);
    // Custom event untuk perubahan di tab yang sama
    window.addEventListener("thermal-size-change", syncSize);
    return () => {
      window.removeEventListener("storage", syncSize);
      window.removeEventListener("thermal-size-change", syncSize);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white print:min-h-0">
      {/* Toolbar cetak — hanya tampil di layar */}
      <div className="no-print flex justify-center pt-4 pb-2">
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-2.5">
          <span className="text-xs text-gray-500">Ukuran kertas:</span>
          <PrintButton onSizeChange={setPaperSize} />
        </div>
      </div>

      {/* Preview receipt */}
      <div className="flex justify-center py-4 print:py-0 print:block">
        {/* Simulasi background printer di layar */}
        <div className="no-print bg-white shadow-lg rounded border border-gray-200 p-3 inline-block">
          <InvoicePrint invoice={invoice} paperWidth={paperSize} />
        </div>
        {/* Saat print: langsung render tanpa wrapper */}
        <div className="hidden print:block">
          <InvoicePrint invoice={invoice} paperWidth={paperSize} />
        </div>
      </div>
    </div>
  );
}
