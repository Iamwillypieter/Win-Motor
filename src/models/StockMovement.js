import mongoose, { Schema } from "mongoose";

/**
 * StockMovement — mencatat setiap perubahan stok produk.
 *
 * type:
 *   - "in"         → barang masuk (addStock / stock-in)
 *   - "out"        → barang keluar (penjualan / pembayaran)
 *   - "adjustment" → koreksi manual (edit stok oleh gudang/owner)
 *   - "create"     → stok awal saat produk dibuat
 */
const StockMovementSchema = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: "Product",
    required: true,
    index: true,
  },
  productName: { type: String, required: true },     // snapshot nama produk
  sku: { type: String, required: true },             // snapshot SKU
  type: {
    type: String,
    enum: ["in", "out", "adjustment", "create"],
    required: true,
  },
  quantity: { type: Number, required: true },        // jumlah yang berubah (positif untuk "in", negatif untuk "out")
  previousStock: { type: Number, required: true },   // stok sebelum perubahan
  newStock: { type: Number, required: true },        // stok setelah perubahan
  reason: { type: String, default: null },           // keterangan (opsional)
  // Reference ke order jika perubahan karena penjualan
  orderId: {
    type: Schema.Types.ObjectId,
    ref: "Order",
    default: null,
  },
  invoiceNumber: { type: String, default: null },     // snapshot invoice number
  // Referensi supplier — diisi hanya untuk perubahan type "in"
  supplierId: {
    type: Schema.Types.ObjectId,
    ref: "Supplier",
    default: null,
  },
  supplierName: { type: String, default: null },     // snapshot nama supplier
  purchasePrice: { type: Number, default: null },    // harga beli per satuan (rupiah, integer)

  // Siapa yang melakukan perubahan
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  userName: { type: String, default: null },         // snapshot nama user
  createdAt: { type: Date, default: Date.now },
});

// Index untuk query cepat
StockMovementSchema.index({ createdAt: -1 });
StockMovementSchema.index({ productId: 1, createdAt: -1 });
StockMovementSchema.index({ type: 1, createdAt: -1 });

const StockMovement =
  mongoose.models.StockMovement ||
  mongoose.model("StockMovement", StockMovementSchema);

export default StockMovement;
