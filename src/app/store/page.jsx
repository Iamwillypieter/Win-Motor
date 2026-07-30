import connectDB from "@/lib/db";
import Product from "@/models/Product";
import ProductGrid from "@/components/store/ProductGrid";

/**
 * StorePage — halaman katalog publik toko online.
 *
 * Server Component: fetch produk langsung dari MongoDB (bukan via HTTP)
 * agar data selalu sinkron dengan kasir dan gudang — tidak ada cache layer.
 *
 * Menggunakan query dan model yang sama persis dengan kasir (CashierPage)
 * sehingga produk, harga, dan stok yang tampil di store selalu identik.
 */
export const metadata = {
  title: "Katalog Produk — Toko Online",
  description: "Lihat dan pesan produk kami secara online",
};

// Paksa halaman ini selalu server-render (tidak di-cache)
export const dynamic = "force-dynamic";

export default async function StorePage() {
  let products = [];

  try {
    await connectDB();

    const raw = await Product.find({ isActive: true })
      .sort({ name: 1 })
      .lean();

    // Serialisasi ObjectId dan Date ke plain values (sama seperti CashierPage)
    products = raw.map((p) => ({
      _id: p._id.toString(),
      name: p.name,
      price: p.price,
      stock: p.stock,
      imageUrl: p.imageUrl ?? null,
    }));
  } catch (err) {
    console.error("StorePage: gagal mengambil produk", err);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Katalog Produk</h1>
      <ProductGrid products={products} />
    </div>
  );
}
