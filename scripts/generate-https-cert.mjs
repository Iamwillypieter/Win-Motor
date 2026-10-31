/**
 * generate-https-cert.mjs
 *
 * Membuat sertifikat self-signed untuk dev server HTTPS agar kamera
 * (getUserMedia) bisa diakses dari perangkat mobile via IP LAN maupun
 * hostname mDNS (HOSTNAME.local).
 *
 * Browser di HP memblokir akses kamera pada koneksi HTTP — wajib HTTPS.
 * Sertifikat ini mencakup:
 *   - localhost + 127.0.0.1
 *   - Semua IP LAN aktif (misal 192.168.x.x)
 *   - Hostname mesin (misal WILLY-PIETER)
 *   - Hostname mDNS  (misal WILLY-PIETER.local)
 *
 * Pada HP: buka https://WILLY-PIETER.local:3443 lalu pilih "Lanjutkan"
 * saat peringatan sertifikat muncul (sekali saja per browser per perangkat).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { networkInterfaces, hostname as osHostname } from "os";
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

// --- Kumpulkan hostname mesin untuk mDNS (.local) --------------------
function getHostnames() {
  const names = ["localhost"];
  try {
    const host = osHostname();
    if (host && host !== "localhost") {
      names.push(host.toLowerCase());
      names.push(`${host.toLowerCase()}.local`);
    }
  } catch {
    // Tidak fatal — localhost tetap tercakup
  }
  return [...new Set(names)];
}

// --- Cek apakah sertifikat perlu dibuat ulang ------------------------
function needsRegenerate(currentIPs, currentHostnames) {
  if (!existsSync(certPath) || !existsSync(keyPath)) return true;

  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      const oldIPs = [...(meta.ips || [])].sort().join(",");
      const nowIPs = [...currentIPs].sort().join(",");
      const oldHosts = [...(meta.hostnames || [])].sort().join(",");
      const nowHosts = [...currentHostnames].sort().join(",");
      if (oldIPs !== nowIPs || oldHosts !== nowHosts) return true;
    } catch {
      return true;
    }
  } else {
    return true;
  }

  // Cek kedaluwarsa (kurang dari 30 hari → regenerate)
  try {
    const cert = new X509Certificate(readFileSync(certPath, "utf8"));
    const expiry = new Date(cert.validTo);
    const daysLeft = (expiry.getTime() - Date.now()) / 86_400_000;
    if (daysLeft < 30) return true;
  } catch {
    return true;
  }

  return false;
}

// --- Generate sertifikat --------------------------------------------
async function generate() {
  const currentIPs = getLanIPs();
  const currentHostnames = getHostnames();

  if (!needsRegenerate(currentIPs, currentHostnames)) {
    // Sudah ada & valid — silent skip
    return;
  }

  // selfsigned adalah CJS; import dinamis aman dari ESM (.mjs)
  const selfsigned = (await import("selfsigned")).default;

  // SAN: semua hostname (DNS) + semua IP
  const altNames = [];

  // DNS entries
  for (const name of currentHostnames) {
    altNames.push({ type: 2, value: name }); // type 2 = DNS
  }

  // IP entries
  for (const ip of currentIPs) {
    altNames.push({ type: 7, ip }); // type 7 = IP
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
      {
        ips: currentIPs,
        hostnames: currentHostnames,
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  const lanIPs = currentIPs.filter((ip) => ip !== "127.0.0.1");
  const mdnsHost = currentHostnames.find((h) => h.endsWith(".local"));

  console.log(`[HTTPS] Sertifikat dibuat untuk:`);
  console.log(`[HTTPS]   Hostname : ${currentHostnames.join(", ")}`);
  console.log(`[HTTPS]   IP       : ${currentIPs.join(", ")}`);
  if (mdnsHost) {
    console.log(`[HTTPS] Akses dari HP: https://${mdnsHost}:3443`);
  } else if (lanIPs.length > 0) {
    console.log(`[HTTPS] Akses dari HP: https://${lanIPs[0]}:3443`);
  }
}

generate().catch((err) => {
  console.error("[HTTPS] Gagal membuat sertifikat:", err.message);
  process.exit(1);
});
