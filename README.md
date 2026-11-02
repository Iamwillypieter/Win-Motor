# POS System — Toko Sparepart

Sistem Point of Sale berbasis web untuk toko sparepart. Mendukung tiga role: **Kasir**, **Staf Gudang**, dan **Owner**.

## Fitur Utama

- **Kasir** — POS dengan katalog produk, keranjang belanja, pembayaran Cash & QRIS
- **Gudang** — Antrean pesanan real-time, manajemen inventori
- **Owner** — Dashboard analitik, laporan CSV, manajemen karyawan
- **Real-time** — Update status pesanan dan stok via Server-Sent Events (SSE)
- **Online Ordering** — Halaman publik `/store` untuk pemesanan online

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | MongoDB (Mongoose) |
| Auth | NextAuth.js v5 (JWT) |
| Styling | Tailwind CSS |
| State | Zustand |
| Charts | Recharts |
| Testing | Vitest |

---

## Development Lokal

### Prasyarat

- Node.js 18+
- MongoDB (lokal atau [MongoDB Atlas](https://cloud.mongodb.com))

### Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd pos-system

# 2. Install dependencies
npm install

# 3. Buat file environment
copy .env.local.example .env.local
# Edit .env.local dan isi MONGODB_URI, NEXTAUTH_SECRET

# 4. Seed database (buat user dan produk awal)
npm run seed

# 5. Jalankan development server
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

### Akun Default (setelah seed)

| Role | Email | Password |
|---|---|---|
| Kasir | kasir@pos.local | kasir123 |
| Staf Gudang | gudang@pos.local | gudang123 |
| Owner | owner@pos.local | owner123 |

> **Penting:** Ganti password default setelah pertama kali login di production.

### Perintah Tersedia

```bash
npm run dev          # Development server (http://localhost:3000)
npm run build        # Build untuk production
npm run start        # Jalankan production build secara lokal
npm run lint         # Cek kode dengan ESLint
npm run test         # Jalankan semua test
npm run seed         # Seed database dengan data awal
```

---

## Akses dari Perangkat di LAN (Wi-Fi)

Aplikasi sudah di-bind ke semua interface (`--hostname 0.0.0.0`) dan NextAuth
menggunakan `trustHost: true`, sehingga **login & session berfungsi di IP mana
pun** tanpa harus meng-hardcode IP. Cocok untuk dipakai Kasir, Gudang, dan
Owner dari HP, tablet, atau laptop lain di jaringan yang sama.

### Cara mengakses

1. Di laptop yang menjalankan server, cek IP lokal:
   ```powershell
   ipconfig | findstr /i "IPv4"
   ```
   Catat alamat IPv4, mis. `192.168.1.93`.
2. Dari perangkat lain (HP/tablet/laptop) yang terhubung ke Wi-Fi/LAN yang sama,
   buka browser ke:
   ```
   http://192.168.1.93:3000
   ```
3. Login seperti biasa. Real-time (antrean, notifikasi, stok) ikut jalan karena
   semua koneksi memakai URL relatif.

> Bila perangkat lain tidak bisa membuka halaman, kemungkinan Windows Firewall
> memblokir port 3000. Buka sebagai admin sekali:
> ```powershell
> New-NetFirewallRule -DisplayName "POS System (port 3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
> ```

---

## Auto-start saat Laptop Dinyalakan

Agar aplikasi (dan koneksi ke database) jalan otomatis tanpa mengetik
`npm run dev` setiap kali laptop dinyalakan, gunakan tiga script di `scripts/`:

| Script | Fungsi |
|---|---|
| `scripts\start-pos.ps1` | Launcher: tunggu MongoDB → jalankan `npm run dev` → restart otomatis bila crash → catat log ke `logs\pos.log` |
| `scripts\setup-autostart.ps1` | Daftarkan tugas terjadwal "POS-System-AutoStart" yang menjalankan launcher (tersembunyi) setiap **log on** |
| `scripts\remove-autostart.ps1` | Hapus auto-start dan hentikan server project ini |

### Setup (jalankan sekali)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-autostart.ps1
```

Setelah itu, setiap kali Anda log on, aplikasi otomatis berjalan di latar
belakang. Mulai segera tanpa logon ulang:

```powershell
Start-ScheduledTask -TaskName 'POS-System-AutoStart'
```

### Prasyarat & catatan

- **MongoDB** harus terinstall sebagai Windows service dengan startup
  *Automatic* (default installer MongoDB). Cek:
  ```powershell
  Get-Service MongoDB
  ```
  Launcher juga menunggu port 27017 hingga 60 detik sebelum start server.
- **Log aplikasi**: `logs\pos.log` — periksa di sini bila perlu melihat output server.
- Launcher memakai `npm run dev` (sama seperti sebelumnya) agar tidak perlu
  build ulang setiap ada perubahan kode. Untuk pemakaian produksi yang lebih
  ringan, jalankan `npm run build` lalu ubah perintah di `start-pos.ps1`
  menjadi `npm run start`.
- Bila ingin benar-benar start saat **boot** (sebelum login), ubah trigger di
  `setup-autostart.ps1` dari `-AtLogon` ke `-AtStartup` (butuh akun dengan
  hak simpan password di Task Scheduler).

---

## Akses dari Internet via Cloudflare Tunnel

Aplikasi berjalan sepenuhnya di PC lokal (Next.js + MongoDB). Cloudflare Tunnel
membuat "terowongan" dari PC ke internet sehingga pengguna bisa membuka
aplikasi dari URL publik tanpa memindahkan apapun ke cloud.

```
Pengguna (HP/laptop mana saja)
        ↓
https://xxxx.trycloudflare.com  ← URL publik dari Cloudflare
        ↓ tunnel terenkripsi
PC kamu: PM2 → Next.js :3000 → MongoDB :27017
```

### Setup Pertama

Cloudflare Tunnel sudah dikonfigurasi di `ecosystem.config.cjs` sebagai app
`pos-tunnel`. Tidak perlu akun Cloudflare — langsung jalan dengan Quick Tunnel.

Jalankan semua sekaligus dengan PM2:

```powershell
pm2 start ecosystem.config.cjs
pm2 save
```

### Cek URL Publik

Setelah PM2 start, tunggu 10-15 detik lalu jalankan:

```powershell
npm run tunnel:url
```

Atau lihat log langsung:

```powershell
npm run tunnel:logs
```

URL akan terlihat seperti: `https://abc-xyz-123.trycloudflare.com`

Bagikan URL tersebut ke pengguna. Mereka langsung bisa buka dan login.

### ⚠️ Catatan Penting

- **URL berubah** setiap kali tunnel di-restart (karena Quick Tunnel). Kalau
  perlu URL permanen, daftar akun Cloudflare gratis dan buat Named Tunnel
  dengan domain sendiri.
- **PC harus nyala** agar aplikasi bisa diakses. Kalau PC mati, URL tidak bisa
  dibuka.
- **Auto-start** — jika PM2 sudah di-setup autostart (`pm2 startup && pm2 save`),
  tunnel ikut jalan otomatis saat Windows login.

### PM2 — Semua Perintah

```powershell
pm2 start ecosystem.config.cjs   # Start semua (Next.js + proxy HTTPS + tunnel)
pm2 list                          # Lihat status semua app
pm2 logs pos-system               # Log Next.js
pm2 logs pos-tunnel               # Log tunnel (termasuk URL publik)
npm run tunnel:url                # Tampilkan URL tunnel saat ini
pm2 stop pos-tunnel               # Hentikan tunnel saja
pm2 restart pos-tunnel            # Restart tunnel (URL akan berubah)
pm2 stop all                      # Hentikan semua
```

---

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/login/       # Halaman login
│   ├── cashier/            # Halaman kasir
│   ├── warehouse/          # Halaman gudang
│   ├── owner/              # Halaman owner
│   ├── store/              # Halaman publik online ordering
│   └── api/                # API routes
├── components/             # Komponen React
├── hooks/                  # Custom hooks
├── lib/                    # Utilities (auth, db, sse, dll)
├── models/                 # Mongoose models
├── server/                 # Server-side logic (services, actions)
└── types/                  # Type definitions
scripts/
└── seed.mjs                # Database seeder
tests/
├── unit/                   # Unit tests
├── property/               # Property-based tests
└── integration/            # Integration tests
```

---

## Troubleshooting

**Tunnel tidak mau start**
- Pastikan `cloudflared` sudah terinstall: `cloudflared --version`
- Cek log: `pm2 logs pos-tunnel --lines 50`
- Restart tunnel: `pm2 restart pos-tunnel`

**URL tunnel tidak ketemu**
- Tunggu 15-20 detik setelah PM2 start, lalu jalankan `npm run tunnel:url`
- Atau cek langsung: `pm2 logs pos-tunnel --lines 30`
- URL ada di baris yang mengandung `trycloudflare.com`

**Login tidak bisa via URL publik**
- NextAuth sudah pakai `trustHost: true` — tidak perlu set `NEXTAUTH_URL`
- Pastikan Next.js jalan: `pm2 list` (status `pos-system` harus `online`)

**Halaman tidak bisa dibuka via URL publik tapi lokal bisa**
- Cek status tunnel: `pm2 list` (status `pos-tunnel` harus `online`)
- Restart: `pm2 restart pos-tunnel` — tunggu 15 detik — cek URL baru

**Database connection error**
- Pastikan MongoDB service jalan: `Get-Service MongoDB`
- Cek `MONGODB_URI` di `.env.local` sudah benar
