/**
 * https-proxy.mjs
 *
 * HTTPS reverse proxy untuk dev — forward semua request dari
 * https://0.0.0.0:3443  →  http://127.0.0.1:3000
 *
 * Port 3443 (bukan 443) agar tidak butuh hak admin Windows.
 * HP mengakses: https://<IP-LAN>:3443
 *
 * Dijalankan bersamaan dengan npm run dev oleh start-pos.ps1.
 */

import https from "https";
import http from "http";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { networkInterfaces } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const certPath = join(projectRoot, ".cert", "cert.pem");
const keyPath = join(projectRoot, ".cert", "key.pem");

const HTTPS_PORT = 3443;
const HTTP_PORT = 3000;

// Tunggu sampai dev server HTTP siap (polling)
function waitForDevServer(maxWaitMs = 90_000) {
  return new Promise((resolve) => {
    const start = Date.now();
    function attempt() {
      const req = http.request(
        { hostname: "127.0.0.1", port: HTTP_PORT, path: "/", method: "HEAD" },
        (res) => {
          res.resume();
          resolve(true);
        }
      );
      req.setTimeout(1500, () => req.destroy());
      req.on("error", () => {
        if (Date.now() - start < maxWaitMs) {
          setTimeout(attempt, 1000);
        } else {
          resolve(false);
        }
      });
      req.end();
    }
    attempt();
  });
}

function getLanIPs() {
  const ifaces = networkInterfaces();
  const ips = [];
  for (const list of Object.values(ifaces)) {
    for (const addr of list || []) {
      if (addr.family === "IPv4" && !addr.internal) ips.push(addr.address);
    }
  }
  return ips;
}

async function start() {
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    console.error("[proxy] Sertifikat tidak ditemukan. Jalankan: node scripts/generate-https-cert.mjs");
    process.exit(1);
  }

  console.log(`[proxy] Menunggu dev server di port ${HTTP_PORT}...`);
  const ready = await waitForDevServer(90_000);
  if (!ready) {
    console.error(`[proxy] Dev server tidak siap setelah 90 detik.`);
    process.exit(1);
  }
  console.log(`[proxy] Dev server siap.`);

  const tlsOptions = {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
  };

  const server = https.createServer(tlsOptions, (req, res) => {
    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port: HTTP_PORT,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${HTTP_PORT}` },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );

    proxyReq.on("error", (err) => {
      console.error("[proxy] Error forward:", err.message);
      if (!res.headersSent) {
        res.writeHead(502);
        res.end("Dev server tidak tersedia.");
      }
    });

    req.pipe(proxyReq, { end: true });
  });

  // Forward WebSocket upgrade (HMR Next.js)
  server.on("upgrade", (req, socket, head) => {
    const proxyReq = http.request({
      hostname: "127.0.0.1",
      port: HTTP_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    });
    proxyReq.on("upgrade", (_res, proxySocket, proxyHead) => {
      socket.write("HTTP/1.1 101 Switching Protocols\r\n\r\n");
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
      if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);
    });
    proxyReq.on("error", () => socket.destroy());
    proxyReq.end();
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`[proxy] Port ${HTTPS_PORT} sudah dipakai — proxy tidak dijalankan.`);
      process.exit(0);
    }
    console.error("[proxy] Server error:", err.message);
  });

  server.listen(HTTPS_PORT, "0.0.0.0", () => {
    const ips = getLanIPs();
    console.log(`[proxy] HTTPS proxy aktif: https://localhost:${HTTPS_PORT}`);
    for (const ip of ips) {
      console.log(`[proxy] Akses dari HP   : https://${ip}:${HTTPS_PORT}`);
    }
    console.log(`[proxy] (Buka di browser HP → terima peringatan sertifikat sekali)`);
  });
}

start().catch((err) => {
  console.error("[proxy] Fatal:", err);
  process.exit(1);
});
