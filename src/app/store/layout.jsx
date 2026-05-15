import StoreHeader from "@/components/store/StoreHeader";

export const metadata = {
  title: "Toko Online",
  description: "Belanja produk kami secara online",
};

/**
 * StoreLayout — layout publik untuk semua halaman /store/*.
 *
 * Tidak memerlukan autentikasi staf. Menampilkan header sederhana
 * berisi nama toko dan ikon keranjang (via StoreHeader client component).
 *
 * Ini adalah Server Component — StoreHeader yang membutuhkan Zustand
 * ditandai "use client" secara terpisah.
 */
export default function StoreLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <StoreHeader />
      <main>{children}</main>
    </div>
  );
}
