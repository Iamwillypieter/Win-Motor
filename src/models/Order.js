import mongoose, { Schema } from "mongoose";

const OrderItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  productName: { type: String, required: true }, // snapshot at order creation
  sku: { type: String, required: true },
  unitPrice: { type: Number, required: true }, // snapshot price at order creation
  quantity: { type: Number, required: true, min: 1 },
});

const OrderSchema = new Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  // Format: INV-YYYYMMDD-NNNN (e.g., INV-20260507-0001)

  cashierId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  customerName: { type: String, default: null }, // nama pelanggan (opsional)
  items: { type: [OrderItemSchema], required: true },
  totalAmount: { type: Number, required: true, min: 0 }, // integer rupiah

  orderStatus: {
    type: String,
    enum: [
      "waiting_preparation",
      "preparing",
      "ready",
      "completed",
      "cancelled",
    ],
    default: "waiting_preparation",
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "expired"],
    default: "pending",
  },
  paymentMethod: {
    type: String,
    enum: ["CASH", "QRIS", null],
    default: null,
  },

  // CASH payment fields
  cashReceived: { type: Number, default: null },
  changeAmount: { type: Number, default: null },

  // QRIS payment fields
  qrisCode: { type: String, default: null },
  qrisExpiresAt: { type: Date, default: null },
  qrisPaymentRef: { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
});

OrderSchema.index({ cashierId: 1, orderStatus: 1 });
OrderSchema.index({ orderStatus: 1 });
OrderSchema.index({ createdAt: -1 });
// invoiceNumber index sudah dibuat otomatis via unique: true di field definition

// Gunakan schema yang sudah ada jika model sudah terdaftar,
// tapi pastikan schema-nya adalah yang terbaru dengan menghapus cache dulu
// saat schema berubah (development only)
delete mongoose.models.Order;
const Order = mongoose.model("Order", OrderSchema);

export default Order;
