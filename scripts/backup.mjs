/**
 * scripts/backup.mjs
 * Backup database MongoDB ke file JSON lokal.
 *
 * Penggunaan:
 *   npm run db:backup
 *
 * File output disimpan di folder backups/ dengan nama backup-YYYY-MM-DD.json
 * Membutuhkan MONGODB_URI di environment (atau dari .env.local).
 */

import { createWriteStream, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Load .env.local ──────────────────────────────────────────────────────────
// Node.js 20.6+ mendukung --env-file flag, tapi untuk kompatibilitas
// kita baca manual jika MONGODB_URI belum tersedia
if (!process.env.MONGODB_URI) {
  try {
    const { readFileSync } = await import("fs");
    const envPath = join(ROOT, ".env.local");
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local tidak ada — lanjutkan, mungkin env sudah ter-set dari shell
  }
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error(
    "❌  MONGODB_URI tidak ditemukan. Set di .env.local atau environment variable."
  );
  process.exit(1);
}

// ── Connect & dump ───────────────────────────────────────────────────────────
const { default: mongoose } = await import("mongoose");

console.log("🔌  Menghubungkan ke MongoDB…");
await mongoose.connect(MONGODB_URI);
console.log("✅  Terhubung.");

const COLLECTIONS = ["orders", "invoices", "products", "users", "stockmovements"];

const data = {};
let totalDocs = 0;

for (const name of COLLECTIONS) {
  const col = mongoose.connection.db.collection(name);
  const docs = await col.find({}).toArray();

  // Hapus field password dari users
  if (name === "users") {
    for (const doc of docs) delete doc.password;
  }

  data[name] = docs;
  totalDocs += docs.length;
  console.log(`  📄  ${name}: ${docs.length} dokumen`);
}

await mongoose.disconnect();

const backupDate = new Date();
const dateLabel = backupDate.toISOString().slice(0, 10);

const payload = {
  meta: {
    version: "1.0",
    exportedAt: backupDate.toISOString(),
    collections: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v.length])
    ),
  },
  data,
};

// ── Tulis ke file ────────────────────────────────────────────────────────────
const backupDir = join(ROOT, "backups");
mkdirSync(backupDir, { recursive: true });

const outPath = join(backupDir, `backup-${dateLabel}.json`);
const ws = createWriteStream(outPath, { encoding: "utf-8" });
ws.write(JSON.stringify(payload, null, 2));
ws.end();

await new Promise((resolve, reject) => {
  ws.on("finish", resolve);
  ws.on("error", reject);
});

console.log(`\n✅  Backup selesai → ${outPath}`);
console.log(`   Total: ${totalDocs} dokumen dari ${COLLECTIONS.length} koleksi`);
