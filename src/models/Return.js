import mongoose, { Schema } from "mongoose";

/**
 * ReturnItem — satu produk yang dikembalikan dalam transaksi retur.
 */
const ReturnItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  productName: { type: String, required: true },   // snapshot nama produk
  sku: { type: String, required: true },            // snapshot SKU
  unitPrice: { type: Number, required: true },      // snapshot harga saat penjualan asli
  quantity: { type: Number, required: true, min: 1 },
  subtotal: { type: Number, required: true },       // unitPrice * quantity
  reason: { type: String, default: null },          // alasan retur per item (opsional)
});

/**
 * Return — dokumen retur transaksi.
 *
 * Retur bisa terikat ke satu Order (jika kasir memilih pesanan asal),
 * atau sebagai retur standalone (hanya produk tanpa referensi pesanan).
 */
const ReturnSchema = new Schema({
  returnNumber: { type: String, required: true, unique: true },
  // Format: RET-YYYYMMDD-NNNN

  // Referensi order asli (opsional — retur bisa dilakukan tanpa nomor pesanan)
  orderId: {
    type: Schema.Types.ObjectId,
    ref: "Order",
    default: null,
  },
  invoiceNumber: { type: String, default: null }, // snapshot nomor invoice asli

  cashierId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  cashierName: { type: String, required: true }, // snapshot nama kasir

  items: { type: [ReturnItemSchema], required: true },

  totalAmount: { type: Number, required: true, min: 0 }, // total nilai retur (integer rupiah)

  // Metode refund — bagaimana uang dikembalikan ke pelanggan
  refundMethod: {
    type: String,
    enum: ["CASH", "CREDIT", "EXCHANGE"],
    required: true,
    // CASH    = uang tunai dikembalikan
    // CREDIT  = kredit toko (dicatat tapi tidak ada flow uang keluar)
    // EXCHANGE = langsung ditukar produk lain (tidak ada uang keluar)
  },

  note: { type: String, default: null }, // catatan umum untuk seluruh retur

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ReturnSchema.index({ returnNumber: 1 });
ReturnSchema.index({ cashierId: 1, createdAt: -1 });
ReturnSchema.index({ orderId: 1 });
ReturnSchema.index({ createdAt: -1 });

const Return =
  mongoose.models.Return || mongoose.model("Return", ReturnSchema);

export default Return;
