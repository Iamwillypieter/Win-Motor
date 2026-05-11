/**
 * Seed script: creates initial users for each role.
 * Run with: npm run seed
 *
 * Requires MONGODB_URI in environment (set in .env.local or export before running).
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Manually load .env.local since dotenv may not be a direct dependency
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.local not found — rely on environment variables already set
}

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI is not defined. Set it in .env.local");
  process.exit(1);
}

// Inline User schema to avoid Next.js module resolution issues in plain Node
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["CASHIER", "WAREHOUSE", "OWNER"],
    required: true,
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const User = mongoose.models.User || mongoose.model("User", UserSchema);

// Inline Product schema
const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  sku: { type: String, required: true, unique: true, uppercase: true },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  imageUrl: { type: String, default: null },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Product = mongoose.models.Product || mongoose.model("Product", ProductSchema);

const SALT_ROUNDS = 10;

const seedUsers = [
  {
    name: "Kasir Utama",
    email: "kasir@pos.local",
    password: "kasir123",
    role: "CASHIER",
  },
  {
    name: "Staf Gudang",
    email: "gudang@pos.local",
    password: "gudang123",
    role: "WAREHOUSE",
  },
  {
    name: "Pemilik Toko",
    email: "owner@pos.local",
    password: "owner123",
    role: "OWNER",
  },
];

async function seed() {
  console.log("🔌  Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  console.log("✅  Connected\n");

  // --- Seed Users ---
  console.log("👥  Seeding users...");
  for (const userData of seedUsers) {
    const hashedPassword = await bcrypt.hash(userData.password, SALT_ROUNDS);

    const result = await User.findOneAndUpdate(
      { email: userData.email },
      {
        $set: {
          name: userData.name,
          email: userData.email,
          password: hashedPassword,
          role: userData.role,
          isActive: true,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    console.log(
      `👤  ${result.role.padEnd(10)} | ${result.name.padEnd(20)} | ${result.email}`
    );
  }

  // --- Seed Products ---
  console.log("\n📦  Seeding products...");

  // Get warehouse user as createdBy reference
  const warehouseUser = await User.findOne({ role: "WAREHOUSE" });
  if (!warehouseUser) {
    console.warn("⚠️  Warehouse user not found, skipping product seed.");
  } else {
    const seedProducts = [
      { name: "Kopi Arabika", sku: "KOP-001", price: 25000, stock: 100 },
      { name: "Kopi Robusta", sku: "KOP-002", price: 20000, stock: 80 },
      { name: "Teh Hijau", sku: "TEH-001", price: 15000, stock: 150 },
      { name: "Teh Hitam", sku: "TEH-002", price: 12000, stock: 120 },
      { name: "Jus Jeruk", sku: "JUS-001", price: 18000, stock: 60 },
      { name: "Jus Mangga", sku: "JUS-002", price: 20000, stock: 50 },
      { name: "Air Mineral 600ml", sku: "AIR-001", price: 5000, stock: 200 },
      { name: "Croissant", sku: "ROT-001", price: 22000, stock: 40 },
      { name: "Sandwich Ayam", sku: "SND-001", price: 35000, stock: 30 },
      { name: "Cheesecake", sku: "KUE-001", price: 45000, stock: 20 },
    ];

    for (const productData of seedProducts) {
      const result = await Product.findOneAndUpdate(
        { sku: productData.sku },
        {
          $set: {
            name: productData.name,
            sku: productData.sku,
            price: productData.price,
            stock: productData.stock,
            isActive: true,
            createdBy: warehouseUser._id,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );

      console.log(
        `📦  ${result.sku.padEnd(10)} | ${result.name.padEnd(25)} | Rp ${result.price.toLocaleString("id-ID").padStart(8)} | Stok: ${result.stock}`
      );
    }
  }

  console.log("\n✅  Seed selesai.");
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("❌  Seed gagal:", err);
  process.exit(1);
});
