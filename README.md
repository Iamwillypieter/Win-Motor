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

## Deploy ke Vercel

### Langkah 1 — Siapkan Database MongoDB Atlas

1. Daftar di [cloud.mongodb.com](https://cloud.mongodb.com) (gratis)
2. Buat cluster baru (pilih **M0 Free**)
3. Buat database user: **Database Access** → Add New Database User
4. Whitelist semua IP: **Network Access** → Add IP Address → `0.0.0.0/0`
5. Salin connection string dari **Connect** → **Drivers**

### Langkah 2 — Deploy ke Vercel

**Opsi A — Via Vercel Dashboard (Direkomendasikan)**

1. Push kode ke GitHub/GitLab/Bitbucket
2. Buka [vercel.com](https://vercel.com) → **New Project**
3. Import repository
4. Vercel otomatis deteksi Next.js — klik **Deploy**

**Opsi B — Via Vercel CLI**

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy ke production
vercel --prod
```

### Langkah 3 — Set Environment Variables di Vercel

Buka **Project → Settings → Environment Variables** dan tambahkan:

| Variable | Value | Environment |
|---|---|---|
| `MONGODB_URI` | `mongodb+srv://...` | Production, Preview, Development |
| `NEXTAUTH_SECRET` | String acak 32+ karakter | Production, Preview, Development |
| `NEXTAUTH_URL` | `https://nama-project.vercel.app` | Production |
| `FONNTE_TOKEN` | Token dari fonnte.com (opsional) | Production |
| `PAYMENT_WEBHOOK_SECRET` | String acak (opsional) | Production |
| `CRON_SECRET` | String acak — generate otomatis oleh Vercel | Production |

> **Generate NEXTAUTH_SECRET:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
> ```

### Langkah 4 — Seed Database Production

Setelah deploy, jalankan seed dari lokal dengan MONGODB_URI production:

```bash
# Windows CMD
set MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/pos-system
npm run seed

# Windows PowerShell
$env:MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/pos-system"
npm run seed
```

### Langkah 5 — Update NEXTAUTH_URL

Setelah deploy pertama, salin URL Vercel (contoh: `https://pos-system-abc.vercel.app`) dan update environment variable `NEXTAUTH_URL` di Vercel Dashboard, lalu **Redeploy**.

---

## Tetap Bisa Development Lokal Setelah Deploy

Tidak ada konflik antara local dan production karena:

- **`.env.local`** — hanya dibaca di local, tidak pernah di-commit ke Git (sudah ada di `.gitignore`)
- **Vercel** — membaca environment variables dari dashboard, bukan dari file
- **Database** — gunakan database berbeda: local pakai MongoDB lokal, production pakai MongoDB Atlas

### Workflow yang Direkomendasikan

```
Local Development (.env.local)          Production (Vercel Dashboard)
─────────────────────────────           ──────────────────────────────
MONGODB_URI=localhost:27017/pos-dev     MONGODB_URI=atlas.../pos-prod
NEXTAUTH_URL=http://localhost:3000      NEXTAUTH_URL=https://app.vercel.app
NEXTAUTH_SECRET=local-secret            NEXTAUTH_SECRET=strong-random-secret
```

### Menggunakan Database Atlas untuk Local (Opsional)

Jika ingin test dengan data production di local:

```bash
# .env.local
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/pos-system-dev
```

Gunakan database name berbeda (`pos-system-dev`) agar tidak tercampur dengan data production.

---

## Struktur Folder

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

**Build gagal di Vercel**
- Pastikan semua environment variables sudah diset
- Cek build log di Vercel Dashboard

**Login tidak bisa di production**
- Pastikan `NEXTAUTH_URL` sudah diisi dengan URL Vercel yang benar
- Pastikan `NEXTAUTH_SECRET` sudah diset

**Database connection error**
- Pastikan IP `0.0.0.0/0` sudah di-whitelist di MongoDB Atlas Network Access
- Cek format connection string MongoDB Atlas

**SSE tidak berfungsi di Vercel**
- Vercel Serverless Functions memiliki timeout 10 detik untuk Hobby plan
- SSE memerlukan koneksi yang tetap terbuka — gunakan **Vercel Pro** atau deploy ke platform yang mendukung long-running connections (Railway, Render, dll)
- Alternatif: upgrade ke Vercel Pro atau gunakan Vercel Edge Runtime untuk SSE

---

## Catatan Penting: SSE di Vercel

Fitur real-time (notifikasi pesanan, update stok) menggunakan **Server-Sent Events (SSE)** yang memerlukan koneksi HTTP yang tetap terbuka.

### Opsi 1 — Vercel Pro (Direkomendasikan)
Vercel Pro mendukung streaming response hingga 25 detik (bisa diperpanjang). SSE akan berfungsi normal.

### Opsi 2 — Vercel Hobby (Gratis) dengan Polling Fallback
Pada Vercel Hobby, SSE akan timeout setelah 10 detik. Fitur real-time akan terdegradasi — halaman perlu di-refresh manual untuk melihat update.

### Opsi 3 — Platform Alternatif
Deploy ke platform yang mendukung long-running connections:
- **Railway** — [railway.app](https://railway.app) (gratis tier tersedia)
- **Render** — [render.com](https://render.com) (gratis tier tersedia)
- **Fly.io** — [fly.io](https://fly.io)

Untuk Railway/Render, tidak perlu `vercel.json` — cukup set environment variables dan deploy langsung dari GitHub.
