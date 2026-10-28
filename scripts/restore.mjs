/**
 * scripts/restore.mjs
 * Restore database MongoDB dari file backup JSON.
 *
 * ⚠️  PERHATIAN: Script ini akan MENGHAPUS data yang ada dan menggantinya
 *    dengan data dari file backup. Jalankan dengan hati-hati!
 *
 * Penggunaan:
 *   npm run db:restore -- backups/backup-2026-10-28.json
 *
 * Opsi:
 *   --dry-run   Hanya tampilkan statistik tanpa mengubah database
 *   --collection=orders   Restore satu koleksi saja
 */

import { readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Parse argumen ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const colArg = args.find((a) => a.startsWith("--collection="));
const targetCollection = colArg ? colArg.split("=")[1] : null;
const filePath = args.find((a) => !a.startsWith("--"));

if (!filePath) {
  console.error("❌  Tentukan path file backup. Contoh:");
  console.error("   npm run db:restore -- backups/backup-2026-10-28.json");
  process.exit(1);
}

// ── Load .env.local ──────────────────────────────────────────────────────────
if (!process.env.MONGODB_URI) {
  try {
    const envContent = readFileSync(join(ROOT, ".env.local"), "utf-8");
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
    // ignore
  }
}

if (!process.env.MONGODB_URI) {
  console.error("❌  MONGODB_URI tidak ditemukan.");
  process.exit(1);
}

// ── Baca file backup ─────────────────────────────────────────────────────────
const absPath = resolve(filePath);
console.log(`📂  Membaca file: ${absPath}`);

let backup;
try {
  backup = JSON.parse(readFileSync(absPath, "utf-8"));
} catch (err) {
  console.error(`❌  Gagal membaca file backup: ${err.message}`);
  process.exit(1);
}

if (!backup?.meta || !backup?.data) {
  console.error("❌  Format file backup tidak valid.");
  process.exit(1);
}

console.log(`\n📋  Info backup:`);
console.log(`   Dibuat pada : ${backup.meta.exportedAt}`);
console.log(`   Versi       : ${backup.meta.version}`);
console.log(`   Koleksi     : ${JSON.stringify(backup.meta.collections)}`);

if (isDryRun) {
  console.log("\n🔍  Mode DRY RUN — tidak ada perubahan ke database.");
  process.exit(0);
}

// ── Konfirmasi ───────────────────────────────────────────────────────────────
console.log(
  "\n⚠️   PERHATIAN: Ini akan MENGHAPUS data yang ada dan mengganti dengan backup!"
);
console.log("    Ketik YES untuk melanjutkan, atau tekan Ctrl+C untuk batal:\n");

const { createInterface } = await import("readline");
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await new Promise((res) => rl.question("> ", res));
rl.close();

if (answer.trim() !== "YES") {
  console.log("❌  Dibatalkan.");
  process.exit(0);
}

// ── Connect & restore ────────────────────────────────────────────────────────
const { default: mongoose } = await import("mongoose");

console.log("\n🔌  Menghubungkan ke MongoDB…");
await mongoose.connect(process.env.MONGODB_URI);
console.log("✅  Terhubung.");

const collectionsToRestore = targetCollection
  ? [targetCollection]
  : Object.keys(backup.data);

for (const name of collectionsToRestore) {
  const docs = backup.data[name];
  if (!docs) {
    console.warn(`   ⚠️  Koleksi "${name}" tidak ada di backup, dilewati.`);
    continue;
  }

  const col = mongoose.connection.db.collection(name);

  // Hapus data lama
  await col.deleteMany({});
  console.log(`   🗑️   ${name}: data lama dihapus`);

  if (docs.length > 0) {
    // Konversi string _id kembali ke ObjectId jika perlu
    const toInsert = docs.map((doc) => {
      if (doc._id && typeof doc._id === "string") {
        try {
          const { ObjectId } = mongoose.Types;
          return { ...doc, _id: new ObjectId(doc._id) };
        } catch {
          return doc;
        }
      }
      return doc;
    });

    await col.insertMany(toInsert, { ordered: false });
    console.log(`   ✅  ${name}: ${docs.length} dokumen di-restore`);
  } else {
    console.log(`   ℹ️   ${name}: kosong, tidak ada dokumen untuk di-restore`);
  }
}

await mongoose.disconnect();
console.log("\n✅  Restore selesai!");
