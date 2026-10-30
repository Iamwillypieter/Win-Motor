import mongoose, { Schema } from "mongoose";

const ProductSchema = new Schema({
  name: { type: String, required: true, trim: true },
  sku: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  category: { type: String, default: null, trim: true }, // kategori produk, opsional
  brand: { type: String, default: null, trim: true },   // merk produk, opsional
  aliases: { type: [String], default: [] },              // nama alternatif/sebutan pelanggan
  price: { type: Number, required: true, min: 0 }, // integer rupiah
  stock: { type: Number, required: true, min: 0, default: 0 },
  imageUrl: { type: String, default: null },
  // Info pengadaan terakhir — denormalisasi dari StockMovement type "in"/"create".
  // Diperbarui atomik saat barang masuk, agar tampilan scan/gudang tidak perlu
  // query tambahan untuk menampilkan Asal Barang & Harga Beli terakhir.
  lastSupplierName: { type: String, default: null, trim: true }, // Asal Barang terakhir
  lastPurchasePrice: { type: Number, default: null, min: 0 }, // Harga beli satuan terakhir (rupiah)
  isActive: { type: Boolean, default: true }, // soft delete flag
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Full-text search on name, brand, and aliases
ProductSchema.index({ name: "text", brand: "text", aliases: "text" });
// Fast lookup by active status (sku index sudah dibuat otomatis via unique: true)
ProductSchema.index({ isActive: 1 });

// Prevent model recompilation in Next.js dev mode (hot reload)
const Product =
  mongoose.models.Product || mongoose.model("Product", ProductSchema);

export default Product;
