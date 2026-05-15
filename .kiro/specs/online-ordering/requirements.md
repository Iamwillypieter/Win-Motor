# Requirements Document — Layanan Pemesanan Online (Online Ordering)

## Introduction

Fitur ini menambahkan kanal penjualan baru pada sistem POS yang sudah ada: pelanggan publik dapat mengakses katalog produk secara online, memilih produk, mengisi data pengiriman, memilih metode pembayaran (CASH/COD atau QRIS), dan mengirimkan pesanan — tanpa perlu login sebagai staf.

Pesanan yang masuk melalui kanal online (`orderType: ONLINE`) secara otomatis masuk ke antrean gudang yang sama dengan pesanan kasir (`orderType: OFFLINE`), sehingga Staf Gudang dapat menyiapkan barang tanpa alur kerja baru. Owner dapat melihat segmentasi pendapatan online vs offline di dashboard analitik.

Fitur ini dibangun di atas infrastruktur yang sudah ada: Next.js 14 App Router, MongoDB + Mongoose, SSE Manager singleton, dan Zustand — tanpa menambahkan framework atau database baru.

---

## Glossary

- **System**: Aplikasi POS berbasis web secara keseluruhan.
- **Pelanggan**: Pengguna publik yang mengakses halaman toko online tanpa autentikasi staf.
- **Kasir**: Pengguna dengan role `CASHIER` yang membuat pesanan offline di POS internal.
- **Staf_Gudang**: Pengguna dengan role `WAREHOUSE` yang menyiapkan barang dan mengelola inventori.
- **Owner**: Pengguna dengan role `OWNER` yang memiliki akses ke dashboard analitik.
- **Katalog_Publik**: Halaman toko online yang dapat diakses tanpa login, menampilkan produk aktif.
- **Keranjang_Online**: State sementara di sisi klien (localStorage/Zustand) yang menyimpan item yang dipilih Pelanggan sebelum checkout.
- **Pesanan_Online**: Entitas `Order` dengan `orderType: ONLINE`, dibuat oleh Pelanggan melalui halaman publik.
- **Pesanan_Offline**: Entitas `Order` dengan `orderType: OFFLINE`, dibuat oleh Kasir melalui POS internal.
- **Antrean_Gudang**: Tampilan real-time di sisi Staf_Gudang yang menampilkan pesanan aktif dari semua kanal.
- **Invoice**: Dokumen digital yang merangkum detail transaksi yang telah selesai.
- **QRIS**: Metode pembayaran berbasis QR Code standar Indonesia.
- **COD**: Cash on Delivery — pembayaran tunai saat barang diterima.
- **E-Wallet**: Dompet digital (DANA, OVO, GoPay) — pembayaran digital via aplikasi.
- **Bank_Transfer**: Pembayaran via transfer ke rekening bank (BCA, Mandiri, BNI, BRI).
- **Stok**: Jumlah unit produk yang tersedia, disimpan di entitas `Product`.
- **SSE**: Server-Sent Events — mekanisme push real-time dari server ke klien.
- **invoiceNumber**: Nomor unik pesanan dengan format `INV-YYYYMMDD-NNNN`.

---

## Requirements

### Requirement 1: Katalog Produk Publik

**User Story:** Sebagai Pelanggan, saya ingin melihat semua produk yang tersedia beserta harga dan gambarnya tanpa perlu login, sehingga saya dapat memilih produk yang ingin dibeli sebelum melakukan pemesanan.

#### Acceptance Criteria

1. THE System SHALL menyediakan halaman publik di rute `/store` yang dapat diakses tanpa autentikasi staf.
2. WHEN Pelanggan membuka halaman `/store`, THE System SHALL menampilkan semua produk dengan `isActive: true` beserta nama, harga, gambar, dan ketersediaan stok.
3. WHILE stok sebuah produk bernilai 0, THE System SHALL menampilkan label "Stok Habis" pada kartu produk tersebut dan menonaktifkan tombol "Tambah ke Keranjang".
4. WHEN Pelanggan mengetikkan kata kunci di kolom pencarian, THE System SHALL memfilter daftar produk yang ditampilkan berdasarkan kecocokan nama produk dalam waktu kurang dari 500ms.
5. THE System SHALL menampilkan halaman `/store` dengan waktu muat awal kurang dari 3 detik pada koneksi broadband standar.
6. IF tidak ada produk aktif yang tersedia, THEN THE System SHALL menampilkan pesan "Belum ada produk tersedia saat ini" pada halaman katalog.

---

### Requirement 2: Keranjang Belanja Online

**User Story:** Sebagai Pelanggan, saya ingin menambahkan, mengubah jumlah, dan menghapus produk dari keranjang belanja saya, sehingga saya dapat menyesuaikan pesanan sebelum checkout.

#### Acceptance Criteria

1. WHEN Pelanggan menekan tombol "Tambah ke Keranjang" pada sebuah produk, THE System SHALL menambahkan produk tersebut ke Keranjang_Online dan memperbarui tampilan keranjang secara langsung tanpa memuat ulang halaman.
2. WHEN Pelanggan menambahkan produk yang sudah ada di Keranjang_Online, THE System SHALL menambah kuantitas produk tersebut sebesar 1.
3. WHILE kuantitas sebuah item di Keranjang_Online melebihi stok yang tersedia, THE System SHALL menampilkan peringatan visual pada item tersebut dan menonaktifkan tombol penambah kuantitas.
4. WHEN Pelanggan menghapus sebuah item dari Keranjang_Online, THE System SHALL menghapus item tersebut dan memperbarui total harga secara langsung.
5. THE System SHALL menyimpan isi Keranjang_Online di localStorage sehingga keranjang tetap ada jika Pelanggan menutup dan membuka kembali browser.
6. THE System SHALL menampilkan total harga keseluruhan item di Keranjang_Online yang diperbarui secara otomatis setiap kali isi keranjang berubah.
7. WHEN Pelanggan menekan tombol "Kosongkan Keranjang", THE System SHALL menghapus semua item dari Keranjang_Online.

---

### Requirement 3: Formulir Checkout dan Data Pelanggan

**User Story:** Sebagai Pelanggan, saya ingin mengisi data diri dan alamat pengiriman saat checkout, sehingga toko dapat mengetahui kepada siapa dan ke mana pesanan harus dikirimkan.

#### Acceptance Criteria

1. WHEN Pelanggan menekan tombol "Checkout" dengan Keranjang_Online yang tidak kosong, THE System SHALL menampilkan formulir checkout yang meminta: nama lengkap, nomor WhatsApp aktif, dan alamat pengiriman lengkap.
2. WHEN Pelanggan menekan tombol "Checkout" dengan Keranjang_Online yang kosong, THE System SHALL menampilkan pesan "Keranjang belanja kosong" dan tidak menampilkan formulir checkout.
3. IF Pelanggan mengirimkan formulir checkout dengan kolom nama lengkap kosong, THEN THE System SHALL menampilkan pesan validasi "Nama lengkap wajib diisi" dan tidak memproses pesanan.
4. IF Pelanggan mengirimkan formulir checkout dengan nomor WhatsApp yang tidak valid (bukan 10–15 digit angka, tidak diawali 08 atau +62), THEN THE System SHALL menampilkan pesan validasi "Nomor WhatsApp tidak valid" dan tidak memproses pesanan.
5. IF Pelanggan mengirimkan formulir checkout dengan kolom alamat pengiriman kosong, THEN THE System SHALL menampilkan pesan validasi "Alamat pengiriman wajib diisi" dan tidak memproses pesanan.
6. THE System SHALL menyediakan pilihan metode pembayaran pada halaman checkout:
   - `CASH` — bayar saat pengiriman (COD)
   - `QRIS` — bayar sekarang via QR Code standar Indonesia
   - `EWALLET_DANA` — bayar via e-wallet DANA
   - `EWALLET_OVO` — bayar via e-wallet OVO
   - `EWALLET_GOPAY` — bayar via e-wallet GoPay
   - `BANK_TRANSFER` — bayar via transfer bank (BCA, Mandiri, BNI, BRI)
7. IF Pelanggan mengirimkan formulir checkout tanpa memilih metode pembayaran, THEN THE System SHALL menampilkan pesan validasi "Pilih metode pembayaran" dan tidak memproses pesanan.

---

### Requirement 4: Pembuatan Pesanan Online

**User Story:** Sebagai Pelanggan, saya ingin pesanan saya tersimpan di sistem setelah mengisi formulir checkout, sehingga toko dapat memproses dan menyiapkan pesanan saya.

#### Acceptance Criteria

1. WHEN Pelanggan mengirimkan formulir checkout yang valid, THE System SHALL membuat entitas `Order` baru dengan `orderType: ONLINE`, `orderStatus: waiting_preparation`, `paymentStatus: pending`, dan `invoiceNumber` yang unik.
2. WHEN Pesanan_Online berhasil dibuat, THE System SHALL TIDAK mengurangi nilai stok produk pada saat pembuatan pesanan.
3. WHEN Pesanan_Online berhasil dibuat, THE System SHALL menyimpan data pelanggan (nama, nomor WhatsApp, alamat pengiriman) pada entitas `Order`.
4. IF stok salah satu produk dalam Keranjang_Online tidak mencukupi kuantitas yang diminta saat formulir checkout dikirimkan, THEN THE System SHALL menampilkan pesan "Stok [nama produk] tidak mencukupi" dan tidak membuat pesanan.
5. WHEN Pesanan_Online berhasil dibuat dengan metode pembayaran `QRIS`, `EWALLET_DANA`, `EWALLET_OVO`, atau `EWALLET_GOPAY`, THE System SHALL menghasilkan instruksi pembayaran (kode QR atau deep-link) dan menampilkannya kepada Pelanggan untuk diselesaikan dalam waktu 5 menit.
6. WHEN Pesanan_Online berhasil dibuat dengan metode pembayaran `BANK_TRANSFER`, THE System SHALL menampilkan nomor rekening tujuan, nama bank, dan nominal yang harus ditransfer kepada Pelanggan.
6a. WHEN Pesanan_Online berhasil dibuat dengan metode pembayaran `CASH`, THE System SHALL menampilkan halaman konfirmasi pesanan dengan `invoiceNumber` dan ringkasan pesanan kepada Pelanggan.
7. THE System SHALL menghasilkan `invoiceNumber` yang unik untuk setiap Pesanan_Online dengan format `INV-YYYYMMDD-NNNN`, konsisten dengan format pesanan kasir.

---

### Requirement 5: Konfirmasi dan Halaman Status Pesanan

**User Story:** Sebagai Pelanggan, saya ingin melihat konfirmasi dan status pesanan saya setelah checkout, sehingga saya tahu pesanan berhasil diterima dan dapat memantau perkembangannya.

#### Acceptance Criteria

1. WHEN Pesanan_Online berhasil dibuat, THE System SHALL mengarahkan Pelanggan ke halaman konfirmasi di rute `/store/order/[invoiceNumber]`.
2. THE System SHALL menampilkan pada halaman konfirmasi: `invoiceNumber`, ringkasan item yang dipesan, total harga, metode pembayaran, nama pelanggan, dan alamat pengiriman.
3. WHEN metode pembayaran adalah `QRIS`, THE System SHALL menampilkan kode QR yang dapat dipindai beserta batas waktu pembayaran (5 menit) pada halaman konfirmasi.
4. WHEN metode pembayaran adalah `CASH`, THE System SHALL menampilkan instruksi "Pembayaran akan dilakukan saat barang diterima (COD)" pada halaman konfirmasi.
5. WHEN `paymentStatus` Pesanan_Online berubah menjadi `paid`, THE System SHALL memperbarui tampilan halaman konfirmasi secara real-time untuk menampilkan status "Pembayaran Diterima".
6. IF kode QRIS kedaluwarsa (5 menit tanpa pembayaran), THEN THE System SHALL menampilkan pesan "Kode QR kedaluwarsa" dan menyediakan tombol "Buat Ulang Kode QR" pada halaman konfirmasi.
7. WHEN Pelanggan menekan tombol "Buat Ulang Kode QR", THE System SHALL menghasilkan kode QRIS baru dan memperbarui tampilan halaman konfirmasi.

---

### Requirement 6: Notifikasi Real-Time ke Gudang

**User Story:** Sebagai Staf_Gudang, saya ingin menerima notifikasi real-time ketika ada Pesanan_Online masuk, sehingga saya dapat segera menyiapkan barang tanpa penundaan.

#### Acceptance Criteria

1. WHEN Pesanan_Online berhasil dibuat, THE System SHALL mengirimkan event SSE `new_order` ke semua klien Staf_Gudang yang terhubung dalam waktu kurang dari 3 detik.
2. THE System SHALL menampilkan Pesanan_Online di Antrean_Gudang dengan label visual "ONLINE" yang membedakannya dari Pesanan_Offline berlabel "KASIR".
3. THE System SHALL menampilkan pada kartu Pesanan_Online di Antrean_Gudang: `invoiceNumber`, label "ONLINE", nama pelanggan, alamat pengiriman, daftar item beserta kuantitas, total harga, dan waktu pembuatan pesanan.
4. THE System SHALL menyediakan filter di halaman Antrean_Gudang untuk menampilkan: semua pesanan, hanya Pesanan_Online, atau hanya Pesanan_Offline.
5. WHEN Staf_Gudang menekan tombol "Tandai Siap" pada Pesanan_Online, THE System SHALL mengubah `orderStatus` menjadi `ready` dan menghapus pesanan dari Antrean_Gudang.
6. WHILE Pesanan_Online memiliki `orderStatus` `waiting_preparation` atau `preparing`, THE System SHALL menampilkan pesanan tersebut di Antrean_Gudang.

---

### Requirement 7: Penyelesaian Pembayaran QRIS Online

**User Story:** Sebagai Pelanggan, saya ingin pembayaran QRIS saya dikonfirmasi secara otomatis, sehingga pesanan saya langsung diproses tanpa perlu konfirmasi manual dari staf.

#### Acceptance Criteria

1. WHEN payment gateway mengirimkan webhook konfirmasi pembayaran QRIS yang valid untuk Pesanan_Online, THE System SHALL memverifikasi signature webhook dan memproses penyelesaian pembayaran.
2. WHEN pembayaran QRIS Pesanan_Online dikonfirmasi, THE System SHALL dalam satu operasi sekuensial yang aman: mengubah `paymentStatus` menjadi `paid`, mengubah `orderStatus` menjadi `completed`, mengurangi stok setiap produk sesuai kuantitas yang dipesan, dan membuat dokumen `Invoice`.
3. IF operasi penyelesaian pembayaran gagal pada langkah manapun, THEN THE System SHALL melakukan rollback manual ke status sebelumnya dan mencatat detail kegagalan di log sistem.
4. WHEN pembayaran QRIS Pesanan_Online berhasil dikonfirmasi, THE System SHALL mengirimkan event SSE `order_completed` ke semua klien Staf_Gudang dan memperbarui halaman konfirmasi Pelanggan secara real-time.
5. IF webhook pembayaran yang sama dikirimkan lebih dari satu kali (duplikat), THEN THE System SHALL mengembalikan respons HTTP 200 tanpa memproses ulang pembayaran (idempoten).

---

### Requirement 8: Penyelesaian Pesanan COD

**User Story:** Sebagai Staf_Gudang, saya ingin menandai pesanan COD sebagai selesai setelah barang diterima pelanggan, sehingga status pesanan di sistem mencerminkan kondisi aktual.

#### Acceptance Criteria

1. WHEN Staf_Gudang menekan tombol "Konfirmasi Pembayaran COD" pada Pesanan_Online dengan metode `CASH`, THE System SHALL mengubah `paymentStatus` menjadi `paid`, `orderStatus` menjadi `completed`, mengurangi stok produk, dan membuat dokumen `Invoice`.
2. IF operasi penyelesaian COD gagal, THEN THE System SHALL melakukan rollback manual dan menampilkan pesan kesalahan kepada Staf_Gudang.
3. WHEN Pesanan_Online COD berhasil diselesaikan, THE System SHALL mengirimkan event SSE `order_completed` ke semua klien Staf_Gudang.
4. THE Invoice yang dibuat untuk Pesanan_Online SHALL memuat: `invoiceNumber`, tanggal dan waktu transaksi, nama pelanggan, alamat pengiriman, daftar item beserta harga satuan dan kuantitas, `totalAmount`, dan metode pembayaran.

---

### Requirement 9: Integrasi Dashboard Owner

**User Story:** Sebagai Owner, saya ingin melihat data penjualan online terpisah dari penjualan offline di dashboard, sehingga saya dapat menganalisis performa masing-masing kanal penjualan.

#### Acceptance Criteria

1. WHEN Owner membuka halaman Dashboard, THE System SHALL menampilkan metrik pendapatan yang tersegmentasi: total pendapatan keseluruhan, pendapatan dari Pesanan_Offline, dan pendapatan dari Pesanan_Online.
2. WHEN Owner memilih rentang waktu pada Dashboard, THE System SHALL memperbarui semua metrik termasuk segmentasi online/offline untuk mencerminkan rentang waktu yang dipilih.
3. THE System SHALL menampilkan grafik pendapatan yang memvisualisasikan total pendapatan per hari, dengan kemampuan membedakan kontribusi kanal online dan offline.
4. WHEN Owner menekan tombol "Ekspor Laporan", THE System SHALL menghasilkan file CSV yang memuat kolom `orderType` untuk membedakan asal transaksi (ONLINE/OFFLINE) pada setiap baris data.
5. THE CSV yang dihasilkan untuk laporan yang mencakup Pesanan_Online SHALL memuat kolom tambahan: `customerName`, `whatsappNumber`, dan `shippingAddress`.

---

### Requirement 10: Keamanan dan Validasi API Publik

**User Story:** Sebagai sistem, saya ingin memastikan endpoint publik untuk pemesanan online terlindungi dari penyalahgunaan, sehingga integritas data dan ketersediaan layanan tetap terjaga.

#### Acceptance Criteria

1. THE System SHALL menyediakan endpoint `POST /api/store/orders` yang dapat diakses tanpa autentikasi staf untuk membuat Pesanan_Online.
2. WHEN endpoint `POST /api/store/orders` menerima permintaan, THE System SHALL memvalidasi semua field wajib (items, customerName, whatsappNumber, shippingAddress, paymentMethod) sebelum memproses pesanan.
3. IF endpoint `POST /api/store/orders` menerima permintaan dengan field yang tidak valid atau tidak lengkap, THEN THE System SHALL mengembalikan respons HTTP 400 dengan pesan kesalahan yang deskriptif.
4. THE System SHALL membatasi jumlah permintaan ke endpoint `POST /api/store/orders` dari satu alamat IP menjadi maksimal 10 permintaan per menit untuk mencegah penyalahgunaan.
5. THE System SHALL memastikan data sensitif pelanggan (nomor WhatsApp, alamat) tidak pernah dikirimkan ke sisi klien melalui SSE broadcast ke staf lain selain Staf_Gudang.
6. WHEN endpoint publik `/api/store/products` dipanggil, THE System SHALL hanya mengembalikan produk dengan `isActive: true` dan tidak mengekspos field internal seperti `createdBy` atau `sku`.
