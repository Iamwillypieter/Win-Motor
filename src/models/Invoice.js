import mongoose, { Schema } from "mongoose";

const InvoiceItemSchema = new Schema({
  productName: { type: String, required: true },
  sku: { type: String, required: true },
  unitPrice: { type: Number, required: true }, // integer rupiah
  quantity: { type: Number, required: true, min: 1 },
  subtotal: { type: Number, required: true }, // unitPrice * quantity
});

const InvoiceSchema = new Schema({
  orderId: {
    type: Schema.Types.ObjectId,
    ref: "Order",
    required: true,
    unique: true,
  },
  invoiceNumber: { type: String, required: true, unique: true },
  cashierName: { type: String, required: true }, // snapshot nama kasir

  items: { type: [InvoiceItemSchema], required: true },

  totalAmount: { type: Number, required: true, min: 0 }, // integer rupiah
  paymentMethod: {
    type: String,
    enum: [
      "CASH",
      "QRIS",
      "EWALLET_DANA",
      "EWALLET_OVO",
      "EWALLET_GOPAY",
      "BANK_TRANSFER",
      "DEBT",
    ],
    required: true,
  },

  // CASH payment fields
  cashReceived: { type: Number, default: null },
  changeAmount: { type: Number, default: null },

  transactionAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },

  // Online ordering fields
  customerName: { type: String, default: null },
  customerWhatsapp: { type: String, default: null },
  shippingAddress: { type: String, default: null },
  orderType: {
    type: String,
    enum: ["OFFLINE", "ONLINE"],
    default: "OFFLINE",
  },
});

InvoiceSchema.index({ invoiceNumber: 1 });
InvoiceSchema.index({ orderId: 1 });
InvoiceSchema.index({ transactionAt: -1 });

// Prevent model recompilation in Next.js dev mode (hot reload)
const Invoice =
  mongoose.models.Invoice || mongoose.model("Invoice", InvoiceSchema);

export default Invoice;
