import mongoose, { Schema } from "mongoose";

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: { type: String, required: true }, // bcrypt hash
  role: {
    type: String,
    enum: ["CASHIER", "WAREHOUSE", "OWNER"],
    required: true,
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Prevent model recompilation in Next.js dev mode (hot reload)
const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default User;
