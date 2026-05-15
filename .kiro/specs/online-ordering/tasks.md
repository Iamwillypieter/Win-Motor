# Implementation Plan

## Overview

Implementasi fitur pemesanan online untuk pelanggan publik. Dibangun di atas infrastruktur POS yang sudah ada (Next.js 14, MongoDB, SSE, Zustand) dengan perubahan minimal pada kode yang ada.

---

## Tasks

- [x] 1. Modifikasi Data Model dan Infrastruktur Dasar
  - [x] 1.1 Tambahkan field `orderType`, `customerWhatsapp`, `shippingAddress`, `codConfirmedAt`, `codConfirmedBy`, dan `sseToken` ke `src/models/Order.js`
  - [x] 1.2 Tambahkan index baru `{ orderType: 1, orderStatus: 1 }` dan `{ orderType: 1, createdAt: -1 }` ke `OrderSchema`
  - [x] 1.3 Tambahkan field `customerName`, `customerWhatsapp`, `shippingAddress`, dan `orderType` ke `src/models/Invoice.js`
  - [x] 1.4 Buat fungsi `isValidWhatsapp(number)` di `src/lib/validators.js` yang memvalidasi format `08xx` atau `+62xx` dengan panjang 10–15 digit
  - [x] 1.5 Buat modul `src/lib/rateLimit.js` dengan fungsi `checkRateLimit(ip, maxRequests, windowMs)` menggunakan in-memory Map
  - [x] 1.6 Buat `src/lib/paymentMethods.js` — definisikan konstanta `DIGITAL_PAYMENT_METHODS` (`QRIS`, `EWALLET_DANA`, `EWALLET_OVO`, `EWALLET_GOPAY`) dan `MANUAL_PAYMENT_METHODS` (`CASH`, `BANK_TRANSFER`), serta fungsi helper `isDigitalPayment()` dan `requiresManualConfirmation()`
  - [x] 1.7 Tambahkan field `bankTransferBank`, `bankTransferAccount`, `bankTransferConfirmedAt`, `bankTransferConfirmedBy` ke `src/models/Order.js` untuk mendukung konfirmasi transfer bank manual

- [x] 2. Endpoint API Publik
  - [x] 2.1 Buat `src/app/api/store/products/route.js` — GET endpoint publik yang mengembalikan produk aktif tanpa field internal (`sku`, `createdBy`, `isActive`, `updatedAt`), dengan query param `?search=`
  - [x] 2.2 Buat `src/server/services/order.service.js` — tambahkan fungsi `createOnlineOrder({ items, customerName, customerWhatsapp, shippingAddress, paymentMethod })` yang membuat Order dengan `orderType: ONLINE`, `cashierId: null`, dan broadcast SSE ke WAREHOUSE
  - [x] 2.3 Buat `src/app/api/store/orders/route.js` — POST endpoint publik yang memanggil `createOnlineOrder()`, menerapkan rate limiting (10 req/menit per IP), memvalidasi semua field wajib, dan mengembalikan `sseToken` dalam response
  - [x] 2.4 Buat `src/app/api/sse/public/route.js` — GET endpoint SSE publik yang memvalidasi `?token=` query param terhadap `Order.sseToken`, mendaftarkan koneksi dengan `sseToken` sebagai key, dan mengirim heartbeat setiap 30 detik

- [x] 3. Modifikasi SSE Manager
  - [x] 3.1 Tambahkan method `broadcastToToken(event, sseToken)` ke class `SSEManager` di `src/lib/sse.js` yang mengirim event ke semua koneksi dengan `sseToken` yang cocok
  - [x] 3.2 Modifikasi method `register()` di `SSEManager` untuk menerima parameter opsional `sseToken` dan menyimpannya di objek client

- [x] 4. Modifikasi Endpoint yang Ada
  - [x] 4.1 Modifikasi `src/app/api/orders/[id]/status/route.js` — tambahkan logika untuk pesanan `ONLINE + CASH`: ketika `orderStatus` diubah ke `completed` oleh WAREHOUSE, panggil `completePayment()` dan broadcast `order_completed`
  - [x] 4.2 Modifikasi `src/app/api/orders/route.js` — tambahkan query param `?orderType=ONLINE|OFFLINE` untuk filter di halaman gudang
  - [x] 4.3 Modifikasi `src/app/api/analytics/route.js` — tambahkan segmentasi `offlineRevenue`, `onlineRevenue`, `offlineOrders`, `onlineOrders` ke response summary
  - [x] 4.4 Modifikasi `src/app/api/reports/export/route.js` — tambahkan kolom `orderType`, `customerName`, `customerWhatsapp`, `shippingAddress` ke CSV export
  - [x] 4.5 Modifikasi `src/app/api/webhooks/payment/route.js` — setelah `completePayment()` berhasil untuk pesanan ONLINE, panggil `sseManager.broadcastToToken("payment_confirmed", order.sseToken)`
  - [x] 4.6 Modifikasi `middleware.js` — pastikan rute `/store/*` dan `/api/store/*` tidak masuk dalam matcher auth NextAuth

- [x] 5. Halaman Publik — Katalog (`/store`)
  - [x] 5.1 Buat `src/app/store/layout.jsx` — layout publik tanpa sidebar staf, dengan header sederhana berisi nama toko dan ikon keranjang
  - [x] 5.2 Buat `src/hooks/useOnlineCart.js` — Zustand store dengan `persist` ke localStorage (`name: "online-cart-storage"`), berisi `items`, `addItem`, `removeItem`, `updateQuantity`, `clearCart`, computed `totalAmount` dan `totalItems`
  - [x] 5.3 Buat `src/components/store/ProductCard.jsx` — kartu produk dengan gambar, nama, harga (format Rupiah), indikator stok, dan tombol "Tambah ke Keranjang" (disabled jika stok 0)
  - [x] 5.4 Buat `src/components/store/ProductGrid.jsx` — grid responsif produk dengan kolom pencarian yang memfilter produk secara client-side
  - [x] 5.5 Buat `src/components/store/CartDrawer.jsx` — drawer slide dari kanan yang menampilkan item keranjang, kuantitas (dengan validasi stok), total harga, tombol hapus item, dan tombol "Checkout"
  - [x] 5.6 Buat `src/app/store/page.jsx` — Server Component yang fetch produk dari `/api/store/products` dan render `ProductGrid` + `CartDrawer`

- [x] 6. Halaman Publik — Checkout (`/store/checkout`)
  - [x] 6.1 Buat `src/components/store/CheckoutForm.jsx` — form dengan field: nama lengkap, nomor WhatsApp (dengan validasi format), alamat pengiriman, dan pilihan metode pembayaran menggunakan shadcn/ui components. Metode pembayaran yang tersedia: **CASH** (COD), **QRIS**, **EWALLET_DANA**, **EWALLET_OVO**, **EWALLET_GOPAY**, **BANK_TRANSFER** (tampilkan dengan ikon dan label yang jelas untuk setiap metode)
  - [x] 6.2 Buat `src/app/store/checkout/page.jsx` — Client Component yang menampilkan ringkasan keranjang dan `CheckoutForm`, redirect ke `/store` jika keranjang kosong, dan submit ke `POST /api/store/orders`

- [x] 7. Halaman Publik — Konfirmasi Pesanan (`/store/order/[invoiceNumber]`)
  - [x] 7.1 Buat `src/hooks/useOrderStatus.js` — hook yang membuka koneksi SSE ke `/api/sse/public?token=<sseToken>` dan memanggil callback `onEvent` saat menerima event
  - [x] 7.2 Implementasikan `QrisPaymentDisplay` — komponen yang menampilkan QR Code, countdown timer 5 menit, dan tombol "Buat Ulang Kode QR" saat expired
    - Diimplementasikan sebagai sub-komponen di dalam `src/components/store/OrderConfirmation.jsx`
    - _Requirements: 5.3, 5.6, 5.7_
  - [x] 7.2a Implementasikan `EwalletPaymentDisplay` — komponen yang menampilkan instruksi pembayaran e-wallet (DANA/OVO/GoPay): nama e-wallet, nominal, dan countdown timer
    - Diimplementasikan sebagai sub-komponen di dalam `src/components/store/OrderConfirmation.jsx`
    - _Requirements: 4.5_
  - [x] 7.2b Buat `src/components/store/BankTransferDisplay.jsx` — komponen standalone yang menampilkan instruksi transfer bank: nama bank, nomor rekening, nama penerima, nominal yang harus ditransfer, dan tombol "Saya Sudah Transfer" untuk notifikasi konfirmasi manual kepada pelanggan
    - Saat ini hanya ada placeholder inline di `OrderConfirmation.jsx` — perlu dipisah menjadi file komponen tersendiri dan dilengkapi tombol konfirmasi
    - _Requirements: 4.6, 5.2_
  - [x] 7.3 Buat `src/components/store/OrderConfirmation.jsx` — komponen yang menampilkan detail pesanan, status pembayaran real-time (via `useOrderStatus`), dan instruksi sesuai metode pembayaran
  - [x] 7.4 Buat `src/app/store/order/[invoiceNumber]/page.jsx` — Server Component yang fetch data pesanan berdasarkan `invoiceNumber` dan render `OrderConfirmation`

- [x] 8. Modifikasi Komponen Gudang
  - [x] 8.1 Modifikasi `src/components/warehouse/OrderQueueCard.jsx` — tambahkan badge label "ONLINE" (hijau) atau "KASIR" (biru) di header kartu, tampilkan nama pelanggan dan alamat pengiriman untuk pesanan ONLINE, dan tampilkan badge metode pembayaran ("COD", "QRIS — Lunas", "Transfer Bank") sesuai `paymentMethod` dan `paymentStatus`
    - _Requirements: 6.2, 6.3_
  - [x] 8.2 Modifikasi `src/components/warehouse/OrderQueueList.jsx` — tambahkan dropdown filter "Semua / Hanya Online / Hanya Kasir" yang memfilter daftar pesanan berdasarkan `orderType`; teruskan parameter filter ke `useOrderQueue` atau filter secara client-side
    - _Requirements: 6.4_
  - [x] 8.3 Modifikasi `src/components/warehouse/OrderQueueCard.jsx` — tambahkan tombol "Konfirmasi COD" pada kartu Pesanan_Online dengan `paymentMethod: "CASH"` dan `orderStatus: "ready"`, yang memanggil `PATCH /api/orders/[id]/status` dengan `{ orderStatus: "completed" }`
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 8.4 Modifikasi `src/components/warehouse/OrderQueueCard.jsx` — tambahkan tombol "Konfirmasi Transfer" pada kartu Pesanan_Online dengan `paymentMethod: "BANK_TRANSFER"` dan `orderStatus: "ready"`, yang memanggil endpoint konfirmasi pembayaran manual dan menyelesaikan pesanan
    - _Requirements: 8.1_

- [x] 9. Modifikasi Dashboard Owner
  - [x] 9.1 Modifikasi `src/components/owner/MetricCards.jsx` — tambahkan dua kartu metrik baru: "Pendapatan Online" (menggunakan `onlineRevenue`) dan "Pendapatan Toko" (menggunakan `offlineRevenue`) di samping kartu total pendapatan yang sudah ada; perbarui props komponen untuk menerima `onlineRevenue` dan `offlineRevenue`
    - Data sudah tersedia dari `GET /api/analytics` (field `onlineRevenue`, `offlineRevenue` sudah ada di service)
    - _Requirements: 9.1, 9.2_
  - [x] 9.2 Modifikasi halaman atau komponen owner yang memanggil `MetricCards` — teruskan `onlineRevenue` dan `offlineRevenue` dari response analytics API ke props `MetricCards`
    - _Requirements: 9.1, 9.2_

- [ ] 10. Testing
  - [x] 10.1 Tulis unit test untuk `isValidWhatsapp()` di `src/lib/validators.js` — uji semua format valid (`08xx`, `+62xx`) dan format tidak valid (terlalu pendek, karakter non-digit, format lain)
    - _Requirements: 3.4, 10.2_
  - [x] 10.2 Tulis property-based test untuk `isValidWhatsapp()` — **Property 3: Validasi Format WhatsApp** — verifikasi bahwa fungsi menerima semua format valid dan menolak semua format tidak valid secara konsisten untuk input arbitrer
    - **Property 3: Validasi Format WhatsApp**
    - **Validates: Requirements 3.4**
  - [x] 10.3 Tulis unit test untuk `checkRateLimit()` di `src/lib/rateLimit.js` — uji batas 10 req/menit, reset setelah window, dan multiple IP berbeda
    - _Requirements: 10.4_
  - [x] 10.4 Tulis unit test untuk `createOnlineOrder()` — uji validasi stok, pembuatan order dengan `orderType: ONLINE`, dan broadcast SSE
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 10.5 Tulis property-based test untuk idempoten `completePayment()` — **Property 2: Idempoten Webhook Pembayaran** — panggil dua kali dengan orderId yang sama, verifikasi stok tidak berkurang dua kali dan tidak ada duplicate Invoice
    - **Property 2: Idempoten Webhook Pembayaran**
    - **Validates: Requirements 7.5**
  - [x] 10.6 Tulis property-based test untuk konsistensi stok — **Property 1: Konsistensi Stok pada Penyelesaian Pembayaran Online** — untuk berbagai kombinasi item dan kuantitas, verifikasi `stok_setelah === stok_sebelum - quantity` setelah `completePayment()`
    - **Property 1: Konsistensi Stok pada Penyelesaian Pembayaran Online**
    - **Validates: Requirements 7.2, 8.1**
  - [x] 10.7 Tulis integration test untuk alur lengkap pesanan QRIS online: buat pesanan → terima webhook → verifikasi status `completed` + stok berkurang + Invoice terbuat
    - _Requirements: 7.1, 7.2, 7.4_
  - [x] 10.8 Tulis integration test untuk alur pesanan COD: buat pesanan → WAREHOUSE tandai ready → WAREHOUSE konfirmasi COD → verifikasi status `completed`
    - _Requirements: 8.1, 8.2, 8.3_

- [~] 11. Checkpoint Akhir
  - Pastikan semua test lulus. Verifikasi alur end-to-end: katalog → keranjang → checkout → konfirmasi → antrean gudang → penyelesaian pesanan. Tanyakan kepada user jika ada pertanyaan.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["7.2b"] },
    { "id": 1, "tasks": ["8.1", "8.2", "9.1"] },
    { "id": 2, "tasks": ["8.3", "8.4", "9.2"] },
    { "id": 3, "tasks": ["10.1", "10.3", "10.4"] },
    { "id": 4, "tasks": ["10.2", "10.5", "10.6", "10.7", "10.8"] }
  ]
}
```

---

## Notes

- **Perubahan minimal pada kode yang ada**: Semua modifikasi bersifat additive — field baru di-default ke nilai yang kompatibel mundur (`orderType: "OFFLINE"` sebagai default) sehingga pesanan kasir yang sudah ada tidak terpengaruh.
- **SSE Token**: `sseToken` disimpan sebagai plain UUID di `Order` (bukan di-hash) karena sensitivitasnya rendah — token hanya digunakan untuk memantau status pesanan milik sendiri dan expired setelah 24 jam.
- **Rate Limiting**: Implementasi in-memory Map cocok untuk single-instance deployment. Jika di-scale ke multi-instance, perlu diganti dengan Redis-based rate limiter.
- **Stok tidak dikurangi saat pesanan dibuat**: Pengurangan stok hanya terjadi saat `completePayment()` dipanggil (webhook QRIS, konfirmasi COD, atau konfirmasi transfer bank) — konsisten dengan alur pesanan kasir yang sudah ada.
- **Task 7.2 dan 7.2a**: `QrisPaymentDisplay` dan `EwalletPaymentDisplay` diimplementasikan sebagai sub-komponen inline di dalam `OrderConfirmation.jsx`, bukan sebagai file terpisah. Ini dianggap selesai karena fungsionalitasnya sudah lengkap.
- **Task 7.2b**: `BankTransferDisplay` saat ini hanya placeholder inline di `OrderConfirmation.jsx`. Perlu dipisah menjadi komponen standalone dan dilengkapi tombol "Saya Sudah Transfer".
- **Task 9**: Data segmentasi online/offline sudah tersedia dari `analytics.service.js` (`getMetrics()` sudah mengembalikan `onlineRevenue`, `offlineRevenue`, dll.) — yang tersisa hanya menampilkannya di UI `MetricCards`.
- **Testing (task 10)**: Property-based test untuk idempoten `completePayment()` (10.5) dan konsistensi stok (10.6) adalah yang paling kritis — keduanya memvalidasi invariant bisnis utama yang tidak boleh dilanggar.
