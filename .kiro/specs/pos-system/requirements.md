# Requirements Document

## Introduction

Sistem Point of Sale (POS) berbasis web yang mendukung tiga peran pengguna: Kasir (Sales), Staf Gudang (Warehouse), dan Pemilik (Owner). Sistem mengelola alur transaksi dari pembuatan pesanan, persiapan barang di gudang, konfirmasi pembayaran, hingga pelaporan analitik. Pembaruan status pesanan dan stok dilakukan secara real-time dan atomik untuk menjaga konsistensi data.

## Glossary

- **System**: Aplikasi POS berbasis web secara keseluruhan.
- **Kasir**: Pengguna dengan role `CASHIER` yang bertugas membuat pesanan dan memproses pembayaran.
- **Staf_Gudang**: Pengguna dengan role `WAREHOUSE` yang bertugas menyiapkan barang dan mengelola inventori.
- **Owner**: Pengguna dengan role `OWNER` yang memiliki akses ke dashboard analitik dan laporan.
- **Pesanan**: Entitas yang merepresentasikan transaksi pembelian, memiliki `orderStatus` dan `paymentStatus`.
- **Katalog**: Daftar produk yang tersedia untuk dijual, ditampilkan di halaman POS Kasir.
- **Keranjang**: State sementara di sisi klien yang menyimpan item yang dipilih Kasir sebelum pesanan dibuat.
- **Antrean_Gudang**: Tampilan real-time di sisi Staf_Gudang yang menampilkan pesanan dengan status `waiting_preparation` atau `preparing`.
- **Stok**: Jumlah unit produk yang tersedia di gudang, disimpan di entitas `Product`.
- **Invoice**: Dokumen digital yang merangkum detail transaksi yang telah selesai.
- **QRIS**: Metode pembayaran berbasis QR Code standar Indonesia.
- **SKU**: Stock Keeping Unit, kode unik untuk mengidentifikasi setiap produk.

---

## Requirements

### Requirement 1: Autentikasi dan Otorisasi Berbasis Peran

**User Story:** Sebagai pengguna sistem, saya ingin masuk menggunakan kredensial saya dan hanya dapat mengakses fitur sesuai peran saya, sehingga keamanan dan integritas data terjaga.

#### Acceptance Criteria

1. THE System SHALL menyediakan halaman login yang menerima kombinasi email dan kata sandi.
2. WHEN pengguna mengirimkan kredensial yang valid, THE System SHALL membuat sesi autentikasi dan mengarahkan pengguna ke halaman utama sesuai perannya (`CASHIER` → halaman POS, `WAREHOUSE` → halaman Antrean_Gudang, `OWNER` → halaman Dashboard).
3. IF pengguna mengirimkan kredensial yang tidak valid, THEN THE System SHALL menampilkan pesan kesalahan "Email atau kata sandi salah" tanpa mengungkap informasi spesifik tentang akun.
4. WHILE pengguna tidak memiliki sesi autentikasi yang aktif, THE System SHALL mengalihkan setiap permintaan ke halaman yang dilindungi menuju halaman login.
5. WHEN pengguna dengan role `CASHIER` mencoba mengakses rute yang hanya diizinkan untuk `WAREHOUSE` atau `OWNER`, THE System SHALL mengembalikan respons HTTP 403 dan menampilkan halaman akses ditolak.
6. WHEN pengguna dengan role `WAREHOUSE` mencoba mengakses rute yang hanya diizinkan untuk `CASHIER` atau `OWNER`, THE System SHALL mengembalikan respons HTTP 403 dan menampilkan halaman akses ditolak.
7. WHEN pengguna memilih untuk keluar, THE System SHALL menghapus sesi autentikasi dan mengarahkan pengguna ke halaman login.

---

### Requirement 2: Manajemen Produk dan Inventori

**User Story:** Sebagai Staf_Gudang, saya ingin mengelola data produk dan stok, sehingga Katalog yang ditampilkan kepada Kasir selalu akurat dan terkini.

#### Acceptance Criteria

1. THE System SHALL menyediakan antarmuka bagi Staf_Gudang untuk membuat produk baru dengan atribut: nama, SKU, harga, stok awal, dan gambar produk.
2. WHEN Staf_Gudang mengirimkan data produk baru dengan SKU yang sudah ada, THE System SHALL menolak permintaan dan menampilkan pesan kesalahan "SKU sudah digunakan".
3. WHEN Staf_Gudang memperbarui data produk (nama, harga, atau gambar), THE System SHALL menyimpan perubahan dan memperbarui Katalog di sisi Kasir dalam waktu kurang dari 2 detik.
4. WHEN Staf_Gudang memperbarui jumlah Stok sebuah produk, THE System SHALL menyimpan nilai Stok baru dan memperbarui tampilan Katalog di sisi Kasir dalam waktu kurang dari 2 detik.
5. THE System SHALL menyediakan tabel inventori yang dapat dicari berdasarkan nama produk dan difilter berdasarkan SKU.
6. IF Staf_Gudang mengunggah gambar produk dengan format selain JPG, PNG, atau WEBP, THEN THE System SHALL menolak unggahan dan menampilkan pesan kesalahan "Format gambar tidak didukung. Gunakan JPG, PNG, atau WEBP".
7. IF Staf_Gudang mengunggah gambar produk dengan ukuran lebih dari 2MB, THEN THE System SHALL menolak unggahan dan menampilkan pesan kesalahan "Ukuran gambar melebihi batas 2MB".
8. WHEN Staf_Gudang menghapus sebuah produk, THE System SHALL menonaktifkan produk tersebut (soft delete) sehingga tidak muncul di Katalog, namun data historis pada Pesanan yang sudah ada tetap terjaga.

---

### Requirement 3: Pembuatan Pesanan oleh Kasir

**User Story:** Sebagai Kasir, saya ingin membuat pesanan dari Katalog produk, sehingga proses transaksi dapat dimulai dengan cepat dan akurat.

#### Acceptance Criteria

1. THE System SHALL menampilkan Katalog produk aktif beserta nama, harga, gambar, dan ketersediaan Stok kepada Kasir.
2. WHEN Kasir menambahkan produk ke Keranjang, THE System SHALL memperbarui tampilan Keranjang secara langsung di sisi klien tanpa memerlukan pemuatan ulang halaman.
3. WHEN Kasir menekan tombol "Buat Pesanan" dengan Keranjang yang tidak kosong, THE System SHALL membuat entitas Pesanan baru dengan `orderStatus: waiting_preparation` dan `paymentStatus: pending`, serta menghasilkan `invoiceNumber` yang unik.
4. WHEN Pesanan berhasil dibuat, THE System SHALL TIDAK mengurangi nilai Stok produk pada saat pembuatan pesanan.
5. WHEN Kasir menekan tombol "Buat Pesanan" dengan Keranjang yang kosong, THE System SHALL menampilkan pesan kesalahan "Keranjang belanja kosong" dan tidak membuat Pesanan.
6. IF produk dalam Keranjang memiliki Stok yang tersedia kurang dari kuantitas yang diminta saat tombol "Buat Pesanan" ditekan, THEN THE System SHALL menampilkan peringatan kepada Kasir dan tidak membuat Pesanan.

---

### Requirement 4: Antrean Real-Time di Gudang

**User Story:** Sebagai Staf_Gudang, saya ingin melihat pesanan masuk secara real-time, sehingga saya dapat segera menyiapkan barang tanpa penundaan.

#### Acceptance Criteria

1. WHEN sebuah Pesanan baru dibuat oleh Kasir, THE System SHALL menampilkan Pesanan tersebut di Antrean_Gudang dalam waktu kurang dari 3 detik tanpa memerlukan pemuatan ulang halaman oleh Staf_Gudang.
2. THE System SHALL menampilkan setiap entri di Antrean_Gudang dengan informasi: `invoiceNumber`, daftar item beserta kuantitasnya, dan waktu pembuatan pesanan.
3. WHEN Staf_Gudang menekan tombol "Tandai Siap" pada sebuah Pesanan, THE System SHALL mengubah `orderStatus` Pesanan tersebut menjadi `ready`.
4. WHEN `orderStatus` sebuah Pesanan berubah menjadi `ready`, THE System SHALL menampilkan notifikasi kepada Kasir yang menangani Pesanan tersebut dalam waktu kurang dari 3 detik.
5. THE System SHALL menampilkan Pesanan di Antrean_Gudang hanya dengan `orderStatus` `waiting_preparation` atau `preparing`, dan menyembunyikan Pesanan dengan status `ready`, `completed`, atau `cancelled`.

---

### Requirement 5: Pemrosesan Pembayaran

**User Story:** Sebagai Kasir, saya ingin memproses pembayaran tunai maupun QRIS, sehingga transaksi dapat diselesaikan dengan metode yang fleksibel.

#### Acceptance Criteria

1. THE System SHALL menyediakan dua pilihan metode pembayaran untuk setiap Pesanan: `CASH` dan `QRIS`.
2. WHEN Kasir memilih metode `CASH` dan mengkonfirmasi jumlah uang yang diterima lebih besar atau sama dengan `totalAmount` Pesanan, THE System SHALL memproses pembayaran dan menampilkan jumlah kembalian kepada Kasir.
3. WHEN Kasir memilih metode `QRIS`, THE System SHALL menghasilkan kode QR yang unik untuk Pesanan tersebut dan menampilkannya kepada Kasir.
4. WHEN pembayaran QRIS berhasil dikonfirmasi oleh penyedia layanan, THE System SHALL menerima notifikasi dan memproses penyelesaian Pesanan secara otomatis.
5. IF pembayaran QRIS tidak dikonfirmasi dalam waktu 5 menit, THEN THE System SHALL menandai kode QR sebagai kedaluwarsa dan menampilkan opsi untuk membuat ulang kode QR kepada Kasir.

---

### Requirement 6: Penyelesaian Transaksi dan Pembaruan Stok Atomik

**User Story:** Sebagai sistem, saya ingin memastikan bahwa penyelesaian pembayaran dan pengurangan stok terjadi secara atomik, sehingga tidak ada inkonsistensi data antara status pesanan dan jumlah stok.

#### Acceptance Criteria

1. WHEN pembayaran sebuah Pesanan berhasil dikonfirmasi (baik `CASH` maupun `QRIS`), THE System SHALL dalam satu operasi database yang atomik: mengubah `paymentStatus` menjadi `paid`, mengubah `orderStatus` menjadi `completed`, dan mengurangi nilai `Stok` setiap produk dalam Pesanan sesuai kuantitas yang dipesan.
2. IF operasi atomik pada kriteria 1 gagal karena alasan apapun, THEN THE System SHALL membatalkan seluruh operasi (rollback), mempertahankan `paymentStatus` dan `orderStatus` pada nilai sebelumnya, dan mencatat detail kegagalan di log sistem.
3. WHEN `orderStatus` sebuah Pesanan berubah menjadi `completed`, THE System SHALL menghasilkan Invoice digital yang dapat dilihat dan dicetak oleh Kasir.
4. THE Invoice SHALL memuat informasi: `invoiceNumber`, tanggal dan waktu transaksi, daftar item beserta harga satuan dan kuantitas, `totalAmount`, metode pembayaran, dan nama Kasir yang memproses transaksi.

---

### Requirement 7: Dashboard Analitik Owner

**User Story:** Sebagai Owner, saya ingin melihat ringkasan performa bisnis dan grafik pendapatan, sehingga saya dapat membuat keputusan berdasarkan data yang akurat.

#### Acceptance Criteria

1. WHEN Owner membuka halaman Dashboard, THE System SHALL menampilkan ringkasan metrik: total pendapatan, total jumlah Pesanan selesai, dan nilai rata-rata per Pesanan untuk rentang waktu yang aktif.
2. WHEN Owner memilih rentang waktu (harian, mingguan, atau bulanan), THE System SHALL memperbarui seluruh data dan grafik di Dashboard untuk mencerminkan rentang waktu yang dipilih dalam waktu kurang dari 3 detik.
3. THE System SHALL menampilkan grafik pendapatan yang memvisualisasikan total pendapatan per hari dalam rentang waktu yang dipilih.
4. WHEN Owner menekan tombol "Ekspor Laporan", THE System SHALL menghasilkan dan mengunduh file CSV yang memuat seluruh data Pesanan dengan `orderStatus: completed` dalam rentang waktu yang dipilih.
5. THE CSV yang dihasilkan SHALL memuat kolom: `invoiceNumber`, tanggal transaksi, nama Kasir, daftar item, `totalAmount`, dan metode pembayaran.
6. IF tidak ada Pesanan selesai dalam rentang waktu yang dipilih, THEN THE System SHALL menampilkan pesan "Tidak ada data transaksi untuk periode ini" dan menonaktifkan tombol "Ekspor Laporan".
