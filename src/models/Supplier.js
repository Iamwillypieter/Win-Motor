import mongoose, { Schema } from "mongoose";

/**
 * Supplier — menyimpan data pemasok / vendor barang.
 *
 * Digunakan sebagai referensi saat gudang mencatat barang masuk (stock-in),
 * sehingga setiap perubahan stok dapat ditelusuri ke sumber pengadaannya.
 */
const SupplierSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  contactName: {
    type: String,
    default: null,
    trim: true,
  },
  phone: {
    type: String,
    default: null,
    trim: true,
  },
  email: {
    type: String,
    default: null,
    trim: true,
    lowercase: true,
  },
  address: {
    type: String,
    default: null,
    trim: true,
  },
  notes: {
    type: String,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

SupplierSchema.index({ name: "text" });
SupplierSchema.index({ isActive: 1, createdAt: -1 });

const Supplier =
  mongoose.models.Supplier || mongoose.model("Supplier", SupplierSchema);

export default Supplier;
