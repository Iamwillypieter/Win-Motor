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
  price: { type: Number, required: true, min: 0 }, // integer rupiah
  stock: { type: Number, required: true, min: 0, default: 0 },
  imageUrl: { type: String, default: null },
  isActive: { type: Boolean, default: true }, // soft delete flag
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Full-text search on name
ProductSchema.index({ name: "text" });
// Fast lookup by active status (sku index sudah dibuat otomatis via unique: true)
ProductSchema.index({ isActive: 1 });

// Prevent model recompilation in Next.js dev mode (hot reload)
const Product =
  mongoose.models.Product || mongoose.model("Product", ProductSchema);

export default Product;
