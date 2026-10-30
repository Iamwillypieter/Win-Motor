/**
 * Generate file Excel contoh "Barang Masuk" berisi 50 produk sparepart motor
 * yang berbeda-beda (nama, merk, kategori, alias, harga, jumlah).
 *
 * Jalankan: node scripts/generate-sample-excel.mjs
 * Output: 50-barang-masuk.xlsx (di root project)
 */
import { utils, writeFile } from "xlsx";

// 50 produk beragam — nama, merk, kategori, asal barang, harga beli, harga jual,
// alias, dan jumlah barang masuk.
const products = [
  { "Barcode/SKU": "OLI-YM-800", "Nama Produk": "Oli Mesin Yamalube 800ml", Merk: "Yamalube", Kategori: "Oli & Pelumas", "Asal Barang": "PT Yamaha Indonesia", "Harga Beli Satuan": 38000, "Harga Jual": 52000, Alias: "oli mesin;oli yamalube", "Jumlah Barang Masuk": 24 },
  { "Barcode/SKU": "OLI-AHM-1L", "Nama Produk": "Oli Mesin Honda 1L", Merk: "AHM", Kategori: "Oli & Pelumas", "Asal Barang": "PT Astra Honda Motor", "Harga Beli Satuan": 42000, "Harga Jual": 58000, Alias: "oli honda;oli ahm", "Jumlah Barang Masuk": 18 },
  { "Barcode/SKU": "OLI-FED-1L", "Nama Produk": "Oli Mesin Federal 1L", Merk: "Federal", Kategori: "Oli & Pelumas", "Asal Barang": "Toko Pelumas Sentosa", "Harga Beli Satuan": 32000, "Harga Jual": 45000, Alias: "oli federal", "Jumlah Barang Masuk": 30 },
  { "Barcode/SKU": "OLI-CAST-ACT", "Nama Produk": "Oli Castrol Power1 4T 1L", Merk: "Castrol", Kategori: "Oli & Pelumas", "Asal Barang": "PT Castrol Indonesia", "Harga Beli Satuan": 55000, "Harga Jual": 75000, Alias: "oli castrol;power1", "Jumlah Barang Masuk": 12 },
  { "Barcode/SKU": "OLI-SH-MT", "Nama Produk": "Oli Gardan Shell Spirax 1L", Merk: "Shell", Kategori: "Oli & Pelumas", "Asal Barang": "Distributor Shell Jakarta", "Harga Beli Satuan": 48000, "Harga Jual": 65000, Alias: "oli gardan;oli shell", "Jumlah Barang Masuk": 8 },
  { "Barcode/SKU": "BAN-FDR-7014", "Nama Produk": "Ban Luar FDR 70/90-14", Merk: "FDR", Kategori: "Ban", "Asal Barang": "PT FDR Bandung", "Harga Beli Satuan": 120000, "Harga Jual": 165000, Alias: "ban luar;ban motor", "Jumlah Barang Masuk": 20 },
  { "Barcode/SKU": "BAN-IRC-7017", "Nama Produk": "Ban Luar IRC 70/90-17", Merk: "IRC", Kategori: "Ban", "Asal Barang": "PT IRC Indonesia", "Harga Beli Satuan": 145000, "Harga Jual": 195000, Alias: "ban luar;ban irc", "Jumlah Barang Masuk": 15 },
  { "Barcode/SKU": "BAN-PIRELLI-9017", "Nama Produk": "Ban Pirelli Angel 90/80-17", Merk: "Pirelli", Kategori: "Ban", "Asal Barang": "Toko Ban Maju Jaya", "Harga Beli Satuan": 280000, "Harga Jual": 360000, Alias: "ban pirelli;ban sport", "Jumlah Barang Masuk": 10 },
  { "Barcode/SKU": "BAN-BAT-8014", "Nama Produk": "Ban Dalam Battex 80/90-14", Merk: "Battex", Kategori: "Ban", "Asal Barang": "Toko Ban Maju Jaya", "Harga Beli Satuan": 18000, "Harga Jual": 28000, Alias: "ban dalam;ban dalem", "Jumlah Barang Masuk": 50 },
  { "Barcode/SKU": "BAN-CHENG-6017", "Nama Produk": "Ban Luar Cheng Shin 60/90-17", Merk: "Cheng Shin", Kategori: "Ban", "Asal Barang": "PT Cheng Shin Tire", "Harga Beli Satuan": 95000, "Harga Jual": 130000, Alias: "ban csc;ban cheng shin", "Jumlah Barang Masuk": 16 },
  { "Barcode/SKU": "BUSI-NGK-CR9", "Nama Produk": "Busi NGK CR9EIX Iridium", Merk: "NGK", Kategori: "Busi", "Asal Barang": "PT NGK Spark Plug", "Harga Beli Satuan": 65000, "Harga Jual": 89000, Alias: "busi iridium;busi ngk", "Jumlah Barang Masuk": 40 },
  { "Barcode/SKU": "BUSI-DENSO-U24", "Nama Produk": "Busi Denso Iridium IU24D", Merk: "Denso", Kategori: "Busi", "Asal Barang": "Distributor Denso ID", "Harga Beli Satuan": 72000, "Harga Jual": 98000, Alias: "busi denso;busi iridium", "Jumlah Barang Masuk": 25 },
  { "Barcode/SKU": "BUSI-NGK-C8", "Nama Produk": "Busi NGK Standard C8HSA", Merk: "NGK", Kategori: "Busi", "Asal Barang": "PT NGK Spark Plug", "Harga Beli Satuan": 15000, "Harga Jual": 23000, Alias: "busi standar;busi ngk", "Jumlah Barang Masuk": 60 },
  { "Barcode/SKU": "FILTER-AHM-PCX", "Nama Produk": "Filter Udara Honda PCX", Merk: "AHM", Kategori: "Filter", "Asal Barang": "PT Astra Honda Motor", "Harga Beli Satuan": 38000, "Harga Jual": 55000, Alias: "filter udara;saringan udara", "Jumlah Barang Masuk": 14 },
  { "Barcode/SKU": "FILTER-YM-VIX", "Nama Produk": "Filter Udara Yamaha Vixion", Merk: "Yamaha", Kategori: "Filter", "Asal Barang": "PT Yamaha Indonesia", "Harga Beli Satuan": 42000, "Harga Jual": 60000, Alias: "filter udara;saringan", "Jumlah Barang Masuk": 12 },
  { "Barcode/SKU": "FILTER-OLI-HON", "Nama Produk": "Filter Oli Honda CB150", Merk: "Honda", Kategori: "Filter", "Asal Barang": "Toko Sparepart Sejahtera", "Harga Beli Satuan": 28000, "Harga Jual": 42000, Alias: "filter oli;saringan oli", "Jumlah Barang Masuk": 22 },
  { "Barcode/SKU": "KAMPAS-AHM-BEAT", "Nama Produk": "Kampas Rem Depan Honda Beat", Merk: "AHM", Kategori: "Kampas Rem", "Asal Barang": "PT Astra Honda Motor", "Harga Beli Satuan": 32000, "Harga Jual": 48000, Alias: "kampas rem;brake pad", "Jumlah Barang Masuk": 30 },
  { "Barcode/SKU": "KAMPAS-YM-MIO", "Nama Produk": "Kampas Rem Belakang Yamaha Mio", Merk: "Yamaha", Kategori: "Kampas Rem", "Asal Barang": "PT Yamaha Indonesia", "Harga Beli Satuan": 30000, "Harga Jual": 45000, Alias: "kampas rem;pad belakang", "Jumlah Barang Masuk": 28 },
  { "Barcode/SKU": "KAMPAS-BANDO-SEP", "Nama Produk": "Kampas Rem Sepeda Motor Bando", Merk: "Bando", Kategori: "Kampas Rem", "Asal Barang": "Distributor Bando ID", "Harga Beli Satuan": 25000, "Harga Jual": 38000, Alias: "kampas rem;bando", "Jumlah Barang Masuk": 35 },
  { "Barcode/SKU": "RANTAI-DID-420", "Nama Produk": "Rantai DID 420CV Standard", Merk: "DID", Kategori: "Rantai & Gear", "Asal Barang": "Toko Rantai Mas", "Harga Beli Satuan": 85000, "Harga Jual": 120000, Alias: "rantai;chain did", "Jumlah Barang Masuk": 18 },
  { "Barcode/SKU": "RANTAI-RK-520", "Nama Produk": "Rantai RK 520XW2 Gold", Merk: "RK", Kategori: "Rantai & Gear", "Asal Barang": "Toko Rantai Mas", "Harga Beli Satuan": 320000, "Harga Jual": 420000, Alias: "rantai rk;chain gold", "Jumlah Barang Masuk": 8 },
  { "Barcode/SKU": "GEAR-AHM-15T", "Nama Produk": "Gear Depan 15T Honda", Merk: "AHM", Kategori: "Rantai & Gear", "Asal Barang": "PT Astra Honda Motor", "Harga Beli Satuan": 35000, "Harga Jual": 52000, Alias: "gear depan;spocket", "Jumlah Barang Masuk": 20 },
  { "Barcode/SKU": "AKI-GS-MF7", "Nama Produk": "Aki Kering GS MF 5Ah", Merk: "GS Astra", Kategori: "Aki", "Asal Barang": "PT GS Astra", "Harga Beli Satuan": 145000, "Harga Jual": 195000, Alias: "aki;aki kering;aki gs", "Jumlah Barang Masuk": 14 },
  { "Barcode/SKU": "AKI-EXIDE-9", "Nama Produk": "Aki Basah Exide 9Ah", Merk: "Exide", Kategori: "Aki", "Asal Barang": "Distributor Exide ID", "Harga Beli Satuan": 165000, "Harga Jual": 220000, Alias: "aki;aki basah;aki exide", "Jumlah Barang Masuk": 10 },
  { "Barcode/SKU": "AKI-YT-4L", "Nama Produk": "Aki Yuasa YT4L-B 12V", Merk: "Yuasa", Kategori: "Aki", "Asal Barang": "Toko Aki Sentral", "Harga Beli Satuan": 185000, "Harga Jual": 245000, Alias: "aki;aki yuasa", "Jumlah Barang Masuk": 9 },
  { "Barcode/SKU": "SEAL-OIL-AHM-90", "Nama Produk": "Oil Seal Karet 90mm Honda", Merk: "AHM", Kategori: "Seal & Packing", "Asal Barang": "Toko Sparepart Sejahtera", "Harga Beli Satuan": 12000, "Harga Jual": 20000, Alias: "oil seal;karet", "Jumlah Barang Masuk": 45 },
  { "Barcode/SKU": "SEAL-SHC-25", "Nama Produk": "Seal Shockbreaker 25mm", Merk: "Showa", Kategori: "Seal & Packing", "Asal Barang": "Toko Sparepart Sejahtera", "Harga Beli Satuan": 18000, "Harga Jual": 30000, Alias: "seal shock;karet shock", "Jumlah Barang Masuk": 24 },
  { "Barcode/SKU": "LAMPU-PHIL-H4", "Nama Produk": "Bohlam Philips H4 12V 35/35W", Merk: "Philips", Kategori: "Lampu", "Asal Barang": "Distributor Philips ID", "Harga Beli Satuan": 22000, "Harga Jual": 35000, Alias: "bohlam;lampu depan", "Jumlah Barang Masuk": 40 },
  { "Barcode/SKU": "LAMPU-OSRAM-LED", "Nama Produk": "Lampu LED Osram H4", Merk: "Osram", Kategori: "Lampu", "Asal Barang": "Distributor Osram ID", "Harga Beli Satuan": 95000, "Harga Jual": 135000, Alias: "lampu led;led h4", "Jumlah Barang Masuk": 15 },
  { "Barcode/SKU": "LAMPU-PILOT-12", "Nama Produk": "Lampu Pilot 12V 5W (isi 10)", Merk: "Pilot", Kategori: "Lampu", "Asal Barang": "Toko Lampu Bersinar", "Harga Beli Satuan": 8000, "Harga Jual": 15000, Alias: "lampu pilot;lampu kecil", "Jumlah Barang Masuk": 50 },
  { "Barcode/SKU": "REG-YM-R15", "Nama Produk": "Regulator Yamaha R15", Merk: "Yamaha", Kategori: "Kelistrikan", "Asal Barang": "PT Yamaha Indonesia", "Harga Beli Satuan": 95000, "Harga Jual": 135000, Alias: "regulator;rectifier", "Jumlah Barang Masuk": 11 },
  { "Barcode/SKU": "CDI-BRT-CL2", "Nama Produk": "CDI BRT CL2 Racing", Merk: "BRT", Kategori: "Kelistrikan", "Asal Barang": "Toko Racing Kita", "Harga Beli Satuan": 215000, "Harga Jual": 295000, Alias: "cdi;cdi racing", "Jumlah Barang Masuk": 7 },
  { "Barcode/SKU": "KABEL-AHM-SET", "Nama Produk": "Set Kabel Body Honda Beat", Merk: "AHM", Kategori: "Kelistrikan", "Asal Barang": "Toko Sparepart Sejahtera", "Harga Beli Satuan": 65000, "Harga Jual": 92000, Alias: "kabel body;harness", "Jumlah Barang Masuk": 13 },
  { "Barcode/SKU": "KARB-KEI-PE", "Nama Produk": "Karburator Keihin PE28", Merk: "Keihin", Kategori: "Karburator/Injeksi", "Asal Barang": "Toko Racing Kita", "Harga Beli Satuan": 480000, "Harga Jual": 620000, Alias: "karburator;karbu", "Jumlah Barang Masuk": 6 },
  { "Barcode/SKU": "INJ-YM-FI", "Nama Produk": "Injektor Yamaha FI", Merk: "Yamaha", Kategori: "Karburator/Injeksi", "Asal Barang": "PT Yamaha Indonesia", "Harga Beli Satuan": 285000, "Harga Jual": 380000, Alias: "injektor;injector", "Jumlah Barang Masuk": 9 },
  { "Barcode/SKU": "MAINJET-KEI-100", "Nama Produk": "Main Jet Keihin #100 (isi 5)", Merk: "Keihin", Kategori: "Karburator/Injeksi", "Asal Barang": "Toko Racing Kita", "Harga Beli Satuan": 18000, "Harga Jual": 32000, Alias: "main jet;spuyer", "Jumlah Barang Masuk": 30 },
  { "Barcode/SKU": "SHOCK-YM-MONO", "Nama Produk": "Shockbreaker Belakang Yamaha Mono", Merk: "Yamaha", Kategori: "Shockbreaker", "Asal Barang": "PT Yamaha Indonesia", "Harga Beli Satuan": 320000, "Harga Jual": 430000, Alias: "shock;per belakang", "Jumlah Barang Masuk": 8 },
  { "Barcode/SKU": "SHOCK-RS-YSS", "Nama Produk": "Shockbreaker YSS G-Series", Merk: "YSS", Kategori: "Shockbreaker", "Asal Barang": "Distributor YSS ID", "Harga Beli Satuan": 850000, "Harga Jual": 1100000, Alias: "shock yss;shock racing", "Jumlah Barang Masuk": 5 },
  { "Barcode/SKU": "SHOCK-AHM-DEP", "Nama Produk": "Shockbreaker Depan Honda Vario", Merk: "AHM", Kategori: "Shockbreaker", "Asal Barang": "PT Astra Honda Motor", "Harga Beli Satuan": 275000, "Harga Jual": 370000, Alias: "shock depan;up side down", "Jumlah Barang Masuk": 10 },
  { "Barcode/SKU": "SPION-AHM-BEAT", "Nama Produk": "Spion Honda Beat", Merk: "AHM", Kategori: "Lain-lain", "Asal Barang": "PT Astra Honda Motor", "Harga Beli Satuan": 45000, "Harga Jual": 68000, Alias: "spion;cermin", "Jumlah Barang Masuk": 16 },
  { "Barcode/SKU": "SPION-YM-XSR", "Nama Produk": "Spion Yamaha XSR Barled", Merk: "Yamaha", Kategori: "Lain-lain", "Asal Barang": "PT Yamaha Indonesia", "Harga Beli Satuan": 85000, "Harga Jual": 125000, Alias: "spion led;cermin", "Jumlah Barang Masuk": 10 },
  { "Barcode/SKU": "KALI-R9-SURE", "Nama Produk": "Knalpot R9 Sureto Racing", Merk: "R9", Kategori: "Lain-lain", "Asal Barang": "Toko Racing Kita", "Harga Beli Satuan": 320000, "Harga Jual": 450000, Alias: "knalpot;knalpot racing", "Jumlah Barang Masuk": 6 },
  { "Barcode/SKU": "KALI-YM-STD", "Nama Produk": "Knalpot Standar Yamaha NMAX", Merk: "Yamaha", Kategori: "Lain-lain", "Asal Barang": "PT Yamaha Indonesia", "Harga Beli Satuan": 285000, "Harga Jual": 395000, Alias: "knalpot;knalpot std", "Jumlah Barang Masuk": 8 },
  { "Barcode/SKU": "KLEP-AHM-IN", "Nama Produk": "Klep In Honda Supra X 125", Merk: "AHM", Kategori: "Lain-lain", "Asal Barang": "Toko Sparepart Sejahtera", "Harga Beli Satuan": 28000, "Harga Jual": 45000, Alias: "klep;valve in", "Jumlah Barang Masuk": 20 },
  { "Barcode/SKU": "PISTON-AHM-125", "Nama Produk": "Piston Set Honda 125cc", Merk: "AHM", Kategori: "Lain-lain", "Asal Barang": "PT Astra Honda Motor", "Harga Beli Satuan": 145000, "Harga Jual": 198000, Alias: "piston;seher", "Jumlah Barang Masuk": 12 },
  { "Barcode/SKU": "RING-AHM-125", "Nama Produk": "Ring Piston Honda 125cc", Merk: "AHM", Kategori: "Lain-lain", "Asal Barang": "Toko Sparepart Sejahtera", "Harga Beli Satuan": 38000, "Harga Jual": 58000, Alias: "ring piston;ring seher", "Jumlah Barang Masuk": 18 },
  { "Barcode/SKU": "CLUTCH-EXED-C", "Nama Produk": "Kopling Manual Exedy CBR150", Merk: "Exedy", Kategori: "Lain-lain", "Asal Barang": "Distributor Exedy ID", "Harga Beli Satuan": 195000, "Harga Jual": 265000, Alias: "kopling;clutch", "Jumlah Barang Masuk": 9 },
  { "Barcode/SKU": "MIRROR-BOSCH-M", "Nama Produk": "Kaca Spion Round Bosch 10cm", Merk: "Bosch", Kategori: "Lain-lain", "Asal Barang": "Toko Aksesoris Jaya", "Harga Beli Satuan": 22000, "Harga Jual": 36000, Alias: "kaca spion;mirror", "Jumlah Barang Masuk": 25 },
  { "Barcode/SKU": "SARUNG-TANGAN-AGV", "Nama Produk": "Sarung Tangan Riding AGV", Merk: "AGV", Kategori: "Lain-lain", "Asal Barang": "Toko Aksesoris Jaya", "Harga Beli Satuan": 85000, "Harga Jual": 125000, Alias: "sarung tangan;glove", "Jumlah Barang Masuk": 14 },
  { "Barcode/SKU": "HELM-INK-MTR2", "Nama Produk": "Helm Ink MTR2 Full Face", Merk: "INK", Kategori: "Lain-lain", "Asal Barang": "Distributor Helm Nusantara", "Harga Beli Satuan": 320000, "Harga Jual": 425000, Alias: "helm;helm full face", "Jumlah Barang Masuk": 10 },
];

const headerOrder = [
  "Barcode/SKU",
  "Nama Produk",
  "Merk",
  "Kategori",
  "Asal Barang",
  "Harga Beli Satuan",
  "Harga Jual",
  "Alias",
  "Jumlah Barang Masuk",
];

const ws = utils.json_to_sheet(products, { header: headerOrder });

// Lebar kolom biar rapi saat dibuka
ws["!cols"] = [
  { wch: 18 }, // Barcode/SKU
  { wch: 32 }, // Nama Produk
  { wch: 14 }, // Merk
  { wch: 18 }, // Kategori
  { wch: 26 }, // Asal Barang
  { wch: 18 }, // Harga Beli Satuan
  { wch: 14 }, // Harga Jual
  { wch: 28 }, // Alias
  { wch: 18 }, // Jumlah Barang Masuk
];

const wb = utils.book_new();
utils.book_append_sheet(wb, ws, "Barang Masuk");
writeFile(wb, "50-barang-masuk.xlsx");

console.log(`✓ Berhasil membuat 50-barang-masuk.xlsx dengan ${products.length} produk`);
console.log("Kolom:", headerOrder.join(", "));
