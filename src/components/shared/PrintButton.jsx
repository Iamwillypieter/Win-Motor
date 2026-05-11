"use client";

/**
 * PrintButton — tombol cetak yang memanggil window.print().
 * Dipisah sebagai Client Component agar halaman invoice tetap Server Component.
 */
export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
    >
      🖨️ Cetak Invoice
    </button>
  );
}
