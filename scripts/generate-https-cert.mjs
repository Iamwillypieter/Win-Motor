/**
 * generate-https-cert.mjs
 *
 * Membuat sertifikat self-signed untuk dev server HTTPS agar kamera
 * (getUserMedia) bisa diakses dari perangkat mobile via IP LAN.
 *
 * Browser di HP memblokir akses kamera pada koneksi HTTP — wajib HTTPS.
 * Sertifikat ini mencakup localhost + 127.0.0.1 + semua IP LAN aktif
 * sehingga HP di jaringan yang sama bisa mengakses via https://<IP-LAN>:3000.
 *
 * Dijalankan otomatis sebelum `npm run dev` (via lifecycle `predev`).
 * Skip bila sertifikat sudah ada, masih valid, dan IP tidak berubah.
 *
 * Pada HP: buka https://<IP-LAN>:3000 lalu pilih "Lanjutkan / Proceed"
 * saat peringatan sertifikat muncul (sekali saja per browser).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { networkInterfaces } from "os";
import { X509Certificate } from "crypto";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const certDir = join(projectRoot, ".cert");
const certPath = join(certDir, "cert.pem");
const keyPath = join(certDir, "key.pem");
const metaPath = join(certDir, "meta.json");

// --- Kumpulkan semua IPv4 non-internal (IP LAN) -----------------------
function getLanIPs() {
  const ifaces = networkInterfaces();
  const ips = ["127.0.0.1"];
  for (const list of Object.values(ifaces)) {
    for (const addr of list || []) {
      if (addr.family === "IPv4" && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  return [...new Set(ips)];
}

// --- Cek apakah sertifikat perlu (dibuat ulang) ----------------------
function needsRegenerate(currentIPs) {
  if (!existsSync(certPath) || !existsSync(keyPath)) return true;

  // Bandingkan IP tersimpan vs IP sekarang
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      const old = [...(meta.ips || [])].sort().join(",");
      const now = [...currentIPs].sort().join(",");
      if (old !== now) return true; // IP berubah → regenerate
    } catch {
      return true; // meta rusak → regenerate
    }
  } else {
    return true; // tidak ada meta → regenerate
  }

  // Cek kedaluwarsa (kurang dari 30 hari → regenerate)
  try {
    const cert = new X509Certificate(readFileSync(certPath, "utf8"));
    const expiry = new Date(cert.validTo);
    const daysLeft = (expiry.getTime() - Date.now()) / 86_400_000;
    if (daysLeft < 30) return true;
  } catch {
    return true; // cert rusak → regenerate
  }

  return false;
}

// --- Generate sertifikat --------------------------------------------
async function generate() {
  const currentIPs = getLanIPs();

  if (!needsRegenerate(currentIPs)) {
    // Sudah ada & valid — silent skip
    return;
  }

  // selfsigned adalah CJS; import dinamis aman dari ESM (.mjs)
  const selfsigned = (await import("selfsigned")).default;

  // SAN: localhost + semua IP
  const altNames = [
    { type: 2, value: "localhost" }, // DNS
    { type: 7, ip: "127.0.0.1" }, // IP
  ];
  for (const ip of currentIPs) {
    if (ip !== "127.0.0.1") {
      altNames.push({ type: 7, ip });
    }
  }

  const pems = selfsigned.generate(
    [{ name: "commonName", value: "POS Dev Server" }],
    {
      keySize: 2048,
      days: 365,
      algorithm: "sha256",
      extensions: [
        { name: "keyUsage", keyCertSign: true, digitalSignature: true },
        { name: "extKeyUsage", serverAuth: true },
        { name: "subjectAltName", altNames },
      ],
    }
  );

  mkdirSync(certDir, { recursive: true });
  writeFileSync(certPath, pems.cert, { mode: 0o600 });
  writeFileSync(keyPath, pems.private, { mode: 0o600 });
  writeFileSync(
    metaPath,
    JSON.stringify(
      { ips: currentIPs, generatedAt: new Date().toISOString() },
      null,
      2
    )
  );

  const lanIPs = currentIPs.filter((ip) => ip !== "127.0.0.1");
  console.log(
    `[HTTPS] Sertifikat dibuat untuk: localhost, ${lanIPs.join(", ") || "127.0.0.1"}`
  );
  if (lanIPs.length > 0) {
    console.log(
      `[HTTPS] Akses dari HP: https://${lanIPs[0]}:3000  (terima peringatan sertifikat)`
    );
  }
}

generate().catch((err) => {
  console.error("[HTTPS] Gagal membuat sertifikat:", err.message);
  process.exit(1); // Hentikan — dev server butuh sertifikat untuk HTTPS
});
