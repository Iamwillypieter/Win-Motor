import ProductGrid from "@/components/store/ProductGrid";

/**
 * StorePage — halaman katalog publik toko online.
 *
 * Server Component: fetch produk dari /api/store/products saat request,
 * lalu render ProductGrid (client component) dengan data tersebut.
 *
 * Tidak memerlukan autentikasi staf (Requirement 1.1).
 * CartDrawer sudah dikelola oleh StoreHeader di layout.
 *
 * Requirements:
 * - 1.1: Halaman publik di /store, dapat diakses tanpa autentikasi staf
 * - 1.5: Waktu muat awal < 3 detik pada koneksi broadband standar
 */
export const metadata = {
  title: "Katalog Produk — Toko Online",
  description: "Lihat dan pesan produk kami secara online",
};

async function getProducts() {
  try {
    // Gunakan NEXTAUTH_URL untuk absolute URL saat server-side fetch,
    // fallback ke localhost:3000 jika env tidak tersedia.
    const baseUrl =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "http://localhost:3000";

    const res = await fetch(`${baseUrl}/api/store/products`, {
      next: { revalidate: 60 }, // revalidate setiap 60 detik (ISR)
    });

    if (!res.ok) {
      console.error(`GET /api/store/products gagal: ${res.status}`);
      return [];
    }

    const json = await res.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch (err) {
    console.error("Gagal mengambil produk:", err);
    return [];
  }
}

export default async function StorePage() {
  const products = await getProducts();

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Katalog Produk</h1>
      <ProductGrid products={products} />
    </div>
  );
}
