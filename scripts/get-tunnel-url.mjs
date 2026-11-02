/**
 * get-tunnel-url.mjs
 *
 * Baca URL publik Cloudflare tunnel dari log dan tampilkan ke terminal.
 * Berguna setelah `pm2 start ecosystem.config.cjs` untuk tahu URL akses publik.
 *
 * Penggunaan:
 *   node scripts/get-tunnel-url.mjs
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const LOG_FILES = [
  resolve("logs/cloudflared.log"),
  resolve("logs/pm2-tunnel-out.log"),
  resolve("logs/pm2-tunnel-error.log"),
];

const TUNNEL_URL_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/g;

let found = false;

for (const logFile of LOG_FILES) {
  if (!existsSync(logFile)) continue;

  const content = readFileSync(logFile, "utf-8");
  const matches = content.match(TUNNEL_URL_REGEX);

  if (matches && matches.length > 0) {
    // Ambil URL terakhir (paling baru)
    const url = matches[matches.length - 1];
    console.log("\n✅ URL Publik Cloudflare Tunnel:");
    console.log(`\n   👉  ${url}\n`);
    console.log("   Bagikan URL ini ke pengguna untuk mengakses POS System dari mana saja.");
    console.log("   ⚠️  URL ini berubah setiap kali tunnel di-restart.\n");
    found = true;
    break;
  }
}

if (!found) {
  console.log("\n⏳ URL tunnel belum tersedia. Kemungkinan penyebab:");
  console.log("   1. Tunnel belum selesai start — tunggu 10-15 detik lalu coba lagi");
  console.log("   2. PM2 belum dijalankan — jalankan: pm2 start ecosystem.config.cjs");
  console.log("   3. File log belum dibuat\n");
  console.log("   Coba juga: pm2 logs pos-tunnel --lines 30\n");
}
