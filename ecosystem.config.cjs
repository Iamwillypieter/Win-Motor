/**
 * PM2 Ecosystem Config — POS System
 *
 * Jalankan sekali untuk mendaftarkan ke PM2:
 *   pm2 start ecosystem.config.cjs
 *
 * Setup autostart saat Windows boot (jalankan sekali sebagai admin):
 *   pm2 startup
 *   pm2 save
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
  ],
};
