/**
 * PM2 Ecosystem Config — POS System
 *
 * Jalankan sekali untuk mendaftarkan ke PM2:
 *   pm2 start ecosystem.config.cjs
 *
 * Setup autostart saat Windows boot (jalankan sekali sebagai admin):
 *   pm2 startup
 *   pm2 save
 *
 * Cek URL publik tunnel setelah semua running:
 *   pm2 logs pos-tunnel --lines 20
 */
module.exports = {
  apps: [
    {
      name: "pos-system",
      // Di Windows, PM2 harus pakai node + path ke script Next.js secara langsung
      // karena file .bin/next adalah bash shell script, bukan executable Windows
      script: "node_modules/next/dist/bin/next",
      args: "start --hostname 0.0.0.0 --port 3000",
      cwd: "d:\\Project Kiro",

      // Gunakan environment dari file .env.local
      env_file: ".env.local",

      // Restart otomatis jika crash
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",

      // Simpan log di folder logs/ yang sudah ada
      out_file: "logs/pm2-out.log",
      error_file: "logs/pm2-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",

      // Jangan restart terlalu cepat (min 5 detik antar restart)
      min_uptime: "5s",
      max_restarts: 10,
    },
    {
      name: "pos-https-proxy",
      // HTTPS reverse proxy: https://0.0.0.0:3443 → http://127.0.0.1:3000
      // Memungkinkan akses kamera dari HP via https://WILLY-PIETER.local:3443
      script: "scripts/https-proxy.mjs",
      cwd: "d:\\Project Kiro",

      env_file: ".env.local",

      autorestart: true,
      watch: false,
      max_memory_restart: "128M",

      out_file: "logs/pm2-proxy-out.log",
      error_file: "logs/pm2-proxy-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",

      min_uptime: "5s",
      max_restarts: 10,
    },
    {
      name: "pos-tunnel",
      // Cloudflare Quick Tunnel — ekspos Next.js ke internet tanpa akun/domain
      // URL publik (https://xxxx.trycloudflare.com) tercetak di log saat pertama start.
      // Cek dengan: pm2 logs pos-tunnel --lines 20
      //
      // CATATAN: URL berubah setiap kali tunnel di-restart karena ini quick tunnel.
      // Untuk URL permanen, buat akun Cloudflare gratis dan pakai "named tunnel".
      script: "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
      args: "tunnel --url http://localhost:3000 --logfile logs/cloudflared.log",
      cwd: "d:\\Project Kiro",

      // Interpreter "none" karena cloudflared adalah executable native, bukan JS
      interpreter: "none",

      autorestart: true,
      watch: false,
      max_memory_restart: "128M",

      out_file: "logs/pm2-tunnel-out.log",
      error_file: "logs/pm2-tunnel-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",

      min_uptime: "5s",
      max_restarts: 10,
    },
  ],
};
