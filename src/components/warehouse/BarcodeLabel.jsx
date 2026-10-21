"use client";

import { useRef, useEffect } from "react";
import { formatRupiah } from "@/lib/utils";

/**
 * BarcodeLabel — modal yang menampilkan label barcode produk untuk dicetak.
 *
 * Barcode di-generate dari SKU produk menggunakan format Code 128
 * (mendukung karakter alfanumerik dan tanda hubung).
 *
 * @param {{ product: Object|null, onClose: () => void }} props
 */
export default function BarcodeLabel({ product, onClose }) {
  const barcodeRef = useRef(null);

  useEffect(() => {
    if (!product || !barcodeRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        const JsBarcode = (await import("jsbarcode")).default;

        if (cancelled || !barcodeRef.current) return;

        JsBarcode(barcodeRef.current, product.sku, {
          format: "CODE128",
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 14,
          margin: 5,
          textMargin: 4,
        });
      } catch (err) {
        console.error("Failed to generate barcode:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [product]);

  if (!product) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      {/* Print-specific styles — only show barcode label when printing */}
      <style jsx>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area,
          .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 50%;
            top: 30%;
            transform: translateX(-50%);
            border: none;
            box-shadow: none;
            padding: 0;
            margin: 0;
          }
          .no-print {
            display: none;
          }
        }
      `}</style>

      <div
        className="bg-white rounded-xl p-6 max-w-xs w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* --- Print area --- */}
        <div className="print-area text-center">
          <p className="font-semibold text-gray-900 text-sm leading-tight mb-1">
            {product.name}
          </p>
          <svg ref={barcodeRef} className="mx-auto" />
          <p className="font-mono text-xs text-gray-600 mt-1">
            {product.sku}
          </p>
          <p className="text-sm text-gray-800 mt-1">
            {formatRupiah(product.price)}
          </p>
        </div>

        {/* --- Controls (hidden when printing) --- */}
        <div className="no-print flex gap-2 mt-5">
          <button
            onClick={() => window.print()}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Cetak
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
