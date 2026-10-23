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
  brand: { type: String, default: null, trim: true },
  aliases: { type: [String], default: [] },
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
      // ── Oli & Pelumas ──
      { name: "Oli Mesran 10W-40 1L", sku: "OLI-001", brand: "Pertamina", aliases: ["oli mesran", "oli mesin 10w40"], price: 38000, stock: 120 },
      { name: "Oli Mesran 20W-50 1L", sku: "OLI-002", brand: "Pertamina", aliases: ["oli mesran 2050", "oli mesin 20w50"], price: 35000, stock: 100 },
      { name: "Oli Shell Advance 10W-40 1L", sku: "OLI-003", brand: "Shell", aliases: ["shell advance", "oli shell motor"], price: 52000, stock: 80 },
      { name: "Oli Motul 5100 10W-40 1L", sku: "OLI-004", brand: "Motul", aliases: ["motul 5100", "oli motul"], price: 85000, stock: 50 },
      { name: "Oli Gardan SAE 140 1L", sku: "OLI-005", brand: "Pertamina", aliases: ["oli gardan", "oli transmisi"], price: 32000, stock: 60 },

      // ── Filter ──
      { name: "Filter Oli Honda Beat", sku: "FLT-001", brand: "Honda", aliases: ["filter oli beat", "saringan oli beat"], price: 25000, stock: 150 },
      { name: "Filter Oli Honda Vario", sku: "FLT-002", brand: "Honda", aliases: ["filter oli vario", "saringan oli vario"], price: 25000, stock: 120 },
      { name: "Filter Oli Yamaha NMAX", sku: "FLT-003", brand: "Yamaha", aliases: ["filter oli nmax", "saringan oli nmax"], price: 28000, stock: 90 },
      { name: "Filter Oli Suzuki Satria F-150", sku: "FLT-004", brand: "Suzuki", aliases: ["filter oli satria", "saringan oli fu"], price: 22000, stock: 70 },
      { name: "Filter Udara Honda Beat", sku: "FLT-005", brand: "Honda", aliases: ["filter udara beat", "saringan udara beat"], price: 30000, stock: 100 },

      // ── Busi ──
      { name: "Busi NGK CR9E-IX Iridium", sku: "BSS-001", brand: "NGK", aliases: ["busi iridium", "ngk cr9e"], price: 65000, stock: 80 },
      { name: "Busi NGK CPR8EA-9 Standar", sku: "BSS-002", brand: "NGK", aliases: ["busi standar", "ngk cpr8ea"], price: 18000, stock: 200 },
      { name: "Busi Denso IU24 Iridium", sku: "BSS-003", brand: "Denso", aliases: ["denso iu24", "busi denso"], price: 55000, stock: 60 },
      { name: "Busi NGK BPR6ES Mobil", sku: "BSS-004", brand: "NGK", aliases: ["busi mobil", "ngk bpr6es"], price: 15000, stock: 150 },

      // ── Kampas Rem ──
      { name: "Kampas Rem Depan Honda Beat", sku: "REM-001", brand: "Honda", aliases: ["kampas rem depan beat", "rem depan beat"], price: 45000, stock: 90 },
      { name: "Kampas Rem Belakang Honda Vario", sku: "REM-002", brand: "Honda", aliases: ["kampas rem belakang vario", "rem belakang vario"], price: 42000, stock: 80 },
      { name: "Kampas Rem Yamaha NMAX Depan", sku: "REM-003", brand: "Yamaha", aliases: ["kampas rem nmax", "rem nmax"], price: 48000, stock: 70 },
      { name: "Kampas Kopling Honda Supra X 125", sku: "REM-004", brand: "Honda", aliases: ["kampas kopling supra", "kopling supra x"], price: 85000, stock: 50 },

      // ── Rantai & Gear ──
      { name: "Rantai Motor Honda Beat", sku: "RNT-001", brand: "Honda", aliases: ["rantai beat", "chain beat"], price: 95000, stock: 40 },
      { name: "Rantai Motor Yamaha NMAX", sku: "RNT-002", brand: "Yamaha", aliases: ["rantai nmax", "chain nmax"], price: 110000, stock: 35 },
      { name: "Gear Set Honda Supra Fit", sku: "GRS-001", brand: "Honda", aliases: ["gear supra fit", "spigi supra"], price: 125000, stock: 25 },

      // ── Ban ──
      { name: "Ban Depan 70/90-14 IRC", sku: "BAN-001", brand: "IRC", aliases: ["ban depan 14", "ban irc 7090"], price: 85000, stock: 60 },
      { name: "Ban Belakang 80/90-14 FDR", sku: "BAN-002", brand: "FDR", aliases: ["ban belakang 14", "ban fdr 8090"], price: 95000, stock: 50 },
      { name: "Ban Dalam 14 Inch", sku: "BAN-003", brand: "Universal", aliases: ["ban dalam 14", "dalam ban 14"], price: 12000, stock: 200 },

      // ── Aki ──
      { name: "Aki GS Astra 12V 5Ah MF", sku: "AKI-001", brand: "GS Astra", aliases: ["aki gs", "aki 5ah", "aki mf"], price: 180000, stock: 30 },
      { name: "Aki Yuasa 12V 7Ah MF", sku: "AKI-002", brand: "Yuasa", aliases: ["aki yuasa", "aki 7ah"], price: 210000, stock: 25 },
      { name: "Aki Basah 12V 5Ah", sku: "AKI-003", brand: "GS Astra", aliases: ["aki basah", "aki 5ah basah"], price: 95000, stock: 40 },

      // ── Seal & Packing ──
      { name: "Oil Seal Garpu Honda Beat", sku: "SEAL-001", brand: "Honda", aliases: ["oil seal beat", "seal garpu beat"], price: 15000, stock: 100 },
      { name: "Packing Karter Honda Supra X", sku: "SEAL-002", brand: "Honda", aliases: ["packing karter supra", "gasket karter"], price: 12000, stock: 80 },

      // ── Lain-lain ──
      { name: "Lampu Utama LED H4 12V", sku: "LMP-001", brand: "Universal", aliases: ["lampu led h4", "bohlam led h4"], price: 45000, stock: 120 },
      { name: "Lampu Senja LED 12V", sku: "LMP-002", brand: "Universal", aliases: ["lampu senja led", "senja led"], price: 18000, stock: 150 },
      { name: "Selotip Kawat Bunga 5L", sku: "MISC-001", brand: "Universal", aliases: ["selotip bunga", "kawat bunga 5l"], price: 8500, stock: 300 },
      { name: "Mur Baut Set M6 10pcs", sku: "MISC-002", brand: "Universal", aliases: ["mur m6", "baut m6", "mur baut m6"], price: 10000, stock: 250 },
    ];

    for (const productData of seedProducts) {
      const result = await Product.findOneAndUpdate(
        { sku: productData.sku },
        {
          $set: {
            name: productData.name,
            sku: productData.sku,
            brand: productData.brand ?? null,
            aliases: productData.aliases ?? [],
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
        `📦  ${result.sku.padEnd(10)} | ${result.name.padEnd(35)} | Rp ${result.price.toLocaleString("id-ID").padStart(8)} | Stok: ${result.stock}`
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
