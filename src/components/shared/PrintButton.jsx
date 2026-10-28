"use client";

import { useState, useEffect } from "react";

const PAPER_SIZES = [
  { value: "80mm", label: "80mm" },
  { value: "58mm", label: "58mm" },
];

/**
 * PrintButton — tombol cetak dengan selector ukuran kertas thermal.
 * Menyimpan preferensi ukuran kertas di localStorage dan memberi tahu
 * komponen lain via custom event "thermal-size-change".
 *
 * @param {{ onSizeChange?: (size: string) => void }} props
 */
export default function PrintButton({ onSizeChange }) {
  const [paperSize, setPaperSize] = useState("80mm");

  // Muat preferensi dari localStorage
  useEffect(() => {
    const saved = localStorage.getItem("thermal-paper-size");
    if (saved === "58mm" || saved === "80mm") {
      setPaperSize(saved);
      onSizeChange?.(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSizeChange = (size) => {
    setPaperSize(size);
    localStorage.setItem("thermal-paper-size", size);
    onSizeChange?.(size);
    // Beritahu komponen lain di halaman yang sama
    window.dispatchEvent(new Event("thermal-size-change"));
  };

  const handlePrint = () => {
    // Inject @page size secara dinamis agar browser menggunakan ukuran yang tepat
    let styleEl = document.getElementById("thermal-print-style");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "thermal-print-style";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `@page { size: ${paperSize} auto; margin: 0; }`;

    // Update atribut data-paper di elemen receipt
    const receipt = document.querySelector(".thermal-receipt");
    if (receipt) receipt.setAttribute("data-paper", paperSize);

    window.print();
  };

  return (
    <div className="flex items-center gap-2">
      {/* Selector ukuran kertas */}
      <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
        {PAPER_SIZES.map((size) => (
          <button
            key={size.value}
            onClick={() => handleSizeChange(size.value)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              paperSize === size.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {size.label}
          </button>
        ))}
      </div>

      {/* Tombol cetak */}
      <button
        onClick={handlePrint}
        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      >
        🖨️ Cetak
      </button>
    </div>
  );
}
