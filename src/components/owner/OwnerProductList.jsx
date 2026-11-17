"use client";

import { useState, useMemo, useCallback, useRef, useEffect, useTransition } from "react";
import { formatRupiah } from "@/lib/utils";
import ProductFormModal from "@/components/warehouse/ProductFormModal";
import BarcodeLabel from "@/components/warehouse/BarcodeLabel";
import BarcodeScanner from "@/components/ui/BarcodeScanner";
import ImportExcelModal from "@/components/warehouse/ImportExcelModal";

const STOCK_THRESHOLD_LOW = 5;

/**
 * OwnerProductList — tabel produk toko untuk Owner.
 *
 * Fitur:
 *  - Lihat semua produk aktif dengan filter & sort
 *  - Tambah produk baru (modal form — sama seperti gudang)
 *  - Edit produk
 *  - Hapus produk (soft delete)
 *  - Scan Barang Masuk — scan barcode atau cari manual → tambah stok
 *  - Cetak barcode label
 *  - Kolom Merk dan Alias ditampilkan
 */
export default function OwnerProductList({ initialProducts = [] }) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [skuFilter, setSkuFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [barcodeProduct, setBarcodeProduct] = useState(null);
  const [importExcelOpen, setImportExcelOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  // Stock-in modal state
  const [stockInOpen, setStockInOpen] = useState(false);
  const [stockInMode, setStockInMode] = useState("scan");
  const [stockInProduct, setStockInProduct] = useState(null);
  const [stockInQty, setStockInQty] = useState(1);
  const [stockInSearch, setStockInSearch] = useState("");
  const [stockInSubmitting, setStockInSubmitting] = useState(false);
  const [stockInError, setStockInError] = useState("");
  const [stockInSuccess, setStockInSuccess] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const isProcessingRef = useRef(false);
  const [scannerKey, setScannerKey] = useState(0);

  // --- Supplier state (dipakai oleh semua mode stock-in) ---
  const [suppliers, setSuppliers] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [manualSupplierName, setManualSupplierName] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");

  // Bulk stock-in state
  const [bulkItems, setBulkItems] = useState([]);
  const [bulkScanning, setBulkScanning] = useState(false);
  const bulkScannerStopRef = useRef(null);
  const bulkProcessingRef = useRef(false);
  const [bulkScannerKey, setBulkScannerKey] = useState(0);
  const [bulkCameraError, setBulkCameraError] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // --- Produk baru dari hasil scan (kode tidak ditemukan di DB) ---
  const [scanNotFoundSku, setScanNotFoundSku] = useState(null);
  const [newProductQty, setNewProductQty] = useState(1);
  // Prefill untuk ProductFormModal saat tambah produk dari hasil scan
  const [prefill, setPrefill] = useState({ sku: "", stock: "" });

  // Derived: search results for manual stock-in
  const stockInSearchResults = stockInSearch.trim()
    ? products
        .filter((p) => {
          const q = stockInSearch.toLowerCase();
          return (
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            p.brand?.toLowerCase().includes(q) ||
            p.aliases?.some((a) => a.toLowerCase().includes(q))
          );
        })
        .slice(0, 15)
    : [];

  // ── Scanner — menggunakan BarcodeScanner component + useBarcodeScanner hook ──

  const handleScanResult = useCallback(async (decodedText) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const res = await fetch(`/api/products?sku=${encodeURIComponent(decodedText)}`);
      const json = await res.json();
      if (json.data && json.data.length > 0) {
        const found = json.data[0];
        setStockInProduct(found);
        setStockInQty(1);
        setStockInError("");
        setScanNotFoundSku(null);
      } else {
        // Produk belum terdaftar → tawarkan tambah produk baru
        setScanNotFoundSku(decodedText);
        setNewProductQty(1);
        setStockInError("");
        isProcessingRef.current = false;
      }
    } catch (_) {
      setStockInError("Gagal mencari produk. Coba lagi.");
      isProcessingRef.current = false;
    }
  }, []);

  // ------------------------------------------------------------------
  // Fetch suppliers saat modal stock-in dibuka
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!stockInOpen) return;
    setSuppliersLoading(true);
    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setSuppliers(json.data);
      })
      .catch(() => {})
      .finally(() => setSuppliersLoading(false));
  }, [stockInOpen]);

  // Auto-prefill info pembelian (supplier & harga beli) saat produk ditemukan.
  // Berlaku untuk mode scan dan manual — dipicu saat stockInProduct berubah.
  // Hanya mengisi jika field belum diisi user agar tidak menimpa input yang sudah ada.
  useEffect(() => {
    if (!stockInProduct) return;
    if (!purchasePrice && stockInProduct.lastPurchasePrice != null) {
      setPurchasePrice(String(stockInProduct.lastPurchasePrice));
    }
    if (!selectedSupplierId && !manualSupplierName && stockInProduct.lastSupplierName) {
      const matched = suppliers.find(
        (s) => s.name.toLowerCase() === stockInProduct.lastSupplierName.toLowerCase()
      );
      if (matched) {
        setSelectedSupplierId(matched._id);
      } else {
        setManualSupplierName(stockInProduct.lastSupplierName);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockInProduct]);

  useEffect(() => {
    if (stockInMode === "manual" || !stockInOpen) {
      isProcessingRef.current = false;
      setScanNotFoundSku(null);
      setScannerKey((k) => k + 1);
    }
  }, [stockInMode, stockInOpen]);

  // ── Stock-in submit ──────────────────────────────────────────────────────────

  async function handleStockInSubmit() {
    if (!stockInProduct || !Number.isInteger(stockInQty) || stockInQty <= 0) return;
    setStockInSubmitting(true); setStockInError("");

    // Resolusi supplier: pilih dari dropdown (id) atau ketik manual (nama)
    const resolvedSupplierId = selectedSupplierId || null;
    const resolvedSupplierName = selectedSupplierId
      ? suppliers.find((s) => s._id === selectedSupplierId)?.name ?? null
      : manualSupplierName.trim() || null;
    const resolvedPurchasePrice = purchasePrice !== "" ? parseInt(purchasePrice, 10) || null : null;

    try {
      const res = await fetch(`/api/products/${stockInProduct._id}/stock-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: stockInQty,
          supplierId: resolvedSupplierId,
          supplierName: resolvedSupplierName,
          purchasePrice: resolvedPurchasePrice,
        }),
      });
      const json = await res.json();

      if (res.ok) {
        const updated = json.data.product;
        // Update local product list — pakai data terbaru dari server (stok,
        // asal barang, & harga beli terakhir ikut tersinkron)
        setProducts((prev) => prev.map((p) =>
          p._id.toString() === updated._id.toString()
            ? { ...p, ...serialize(updated) }
            : p
        ));
        setStockInSuccess(`Stok "${stockInProduct.name}" bertambah ${stockInQty}. Stok: ${updated.stock}`);
        setStockInProduct(null); setStockInQty(1); isProcessingRef.current = false;
        if (stockInMode === "scan") setScannerKey((k) => k + 1);
        setTimeout(() => setStockInSuccess(""), 3000);
      } else {
        setStockInError(json.error?.message || "Gagal menambah stok.");
      }
    } catch (_) {
      setStockInError("Gagal terhubung ke server.");
    } finally {
      setStockInSubmitting(false);
    }
  }

  function handleStockInCancel() {
    setStockInProduct(null); setStockInQty(1); setStockInError("");
    setScanNotFoundSku(null);
    isProcessingRef.current = false;
    if (stockInMode === "scan") setScannerKey((k) => k + 1);
  }

  function handleStockInClose() {
    setStockInOpen(false); setStockInProduct(null); setStockInQty(1);
    setStockInSearch(""); setStockInError(""); setStockInSuccess(""); setCameraError("");
    setScanNotFoundSku(null); setNewProductQty(1);
    isProcessingRef.current = false;
    // Reset supplier state
    setSelectedSupplierId(""); setManualSupplierName(""); setPurchasePrice("");
    if (bulkScannerStopRef.current) bulkScannerStopRef.current();
    setBulkItems([]); setBulkResult(null); setBulkCameraError("");
    bulkProcessingRef.current = false;
  }

  // Buka modal Barang Masuk (reset state scan-not-found & lainnya)
  function openStockIn() {
    setScanNotFoundSku(null);
    setNewProductQty(1);
    setStockInProduct(null);
    setStockInQty(1);
    setStockInError("");
    setStockInSuccess("");
    setCameraError("");
    isProcessingRef.current = false;
    setStockInOpen(true);
  }

  // Dari hasil scan yang tidak ditemukan → buka form tambah produk baru
  function handleCreateFromScan() {
    const sku = scanNotFoundSku || "";
    const qty = Number.isInteger(newProductQty) && newProductQty > 0 ? newProductQty : 1;
    setPrefill({ sku, stock: String(qty) });
    setEditingProduct(null);
    setStockInOpen(false); // tutup modal barang masuk, form akan tampil di atas
    setIsFormModalOpen(true);
  }

  // Scan ulang setelah produk tidak ditemukan
  function handleScanRetry() {
    setScanNotFoundSku(null);
    setNewProductQty(1);
    isProcessingRef.current = false;
    setScannerKey((k) => k + 1); // re-mount scanner
  }

  // ── Bulk stock-in helpers ────────────────────────────────────────────────────

  const handleBulkScanResult = useCallback(async (decodedText) => {
    if (bulkProcessingRef.current) return;
    bulkProcessingRef.current = true;
    try {
      const res = await fetch(`/api/products?sku=${encodeURIComponent(decodedText)}`);
      const json = await res.json();
      if (json.data && json.data.length > 0) {
        const found = json.data[0];
        setBulkItems((prev) => {
          const existing = prev.find((i) => i.productId === found._id.toString());
          if (existing) {
            return prev.map((i) =>
              i.productId === found._id.toString() ? { ...i, quantity: i.quantity + 1 } : i
            );
          }
          return [...prev, {
            productId: found._id.toString(),
            sku: found.sku,
            name: found.name,
            imageUrl: found.imageUrl ?? null,
            currentStock: found.stock,
            quantity: 1,
            lastSupplierName: found.lastSupplierName ?? null,
            lastPurchasePrice: found.lastPurchasePrice ?? null,
          }];
        });
        // Auto-prefill supplier & harga beli dari produk pertama yang di-scan
        // (hanya jika field belum diisi user)
        if (!selectedSupplierId && !manualSupplierName && found.lastSupplierName) {
          const matched = suppliers.find(
            (s) => s.name.toLowerCase() === found.lastSupplierName.toLowerCase()
          );
          if (matched) {
            setSelectedSupplierId(matched._id);
          } else {
            setManualSupplierName(found.lastSupplierName);
          }
        }
        if (!purchasePrice && found.lastPurchasePrice != null) {
          setPurchasePrice(String(found.lastPurchasePrice));
        }
      } else {
        setBulkCameraError(`SKU "${decodedText}" tidak ditemukan. Scan ulang.`);
        setTimeout(() => setBulkCameraError(""), 2000);
      }
    } catch {
      setBulkCameraError("Gagal mencari produk. Coba lagi.");
      setTimeout(() => setBulkCameraError(""), 2000);
    } finally {
      setTimeout(() => {
        bulkProcessingRef.current = false;
        setBulkScannerKey((k) => k + 1);
      }, 800);
    }
  }, [suppliers, selectedSupplierId, manualSupplierName, purchasePrice]);

  useEffect(() => {
    if (stockInMode !== "bulk" || !stockInOpen) {
      if (bulkScannerStopRef.current) bulkScannerStopRef.current();
      bulkProcessingRef.current = false;
    }
  }, [stockInMode, stockInOpen]);

  function handleBulkQtyChange(productId, value) {
    const qty = parseInt(value, 10);
    if (isNaN(qty) || qty < 1) return;
    setBulkItems((prev) =>
      prev.map((i) => i.productId === productId ? { ...i, quantity: qty } : i)
    );
  }

  function handleBulkRemove(productId) {
    setBulkItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  async function handleBulkSubmit() {
    if (bulkItems.length === 0) return;
    setBulkSubmitting(true);
    setBulkResult(null);

    const resolvedSupplierId = selectedSupplierId || null;
    const resolvedSupplierName = selectedSupplierId
      ? suppliers.find((s) => s._id === selectedSupplierId)?.name ?? null
      : manualSupplierName.trim() || null;
    const resolvedPurchasePrice = purchasePrice !== "" ? parseInt(purchasePrice, 10) || null : null;

    try {
      if (bulkScannerStopRef.current) bulkScannerStopRef.current();
      const res = await fetch("/api/products/batch-stock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: bulkItems,
          supplierId: resolvedSupplierId,
          supplierName: resolvedSupplierName,
          purchasePrice: resolvedPurchasePrice,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        json.data.results
          .filter((r) => r.status === "success")
          .forEach((r) => {
            setProducts((prev) =>
              prev.map((p) =>
                p._id.toString() === r.productId ? { ...p, stock: r.newStock } : p
              )
            );
          });
        setBulkResult(json.data);
      } else {
        setBulkCameraError(json.error?.message || "Gagal memproses stok masuk.");
      }
    } catch {
      setBulkCameraError("Gagal terhubung ke server. Coba lagi.");
    } finally {
      setBulkSubmitting(false);
    }
  }

  // ── CRUD helpers ─────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/products");
      const body = await res.json();
      if (res.ok && body.data) setProducts(body.data.map(serialize));
    } catch (_) {}
    finally { setIsRefreshing(false); }
  }, []);

  function serialize(p) {
    return {
      _id: p._id?.toString(),
      name: p.name,
      sku: p.sku,
      brand: p.brand ?? null,
      aliases: p.aliases ?? [],
      price: p.price,
      stock: p.stock,
      imageUrl: p.imageUrl ?? null,
      lastPurchasePrice: p.lastPurchasePrice ?? null,
      lastSupplierName: p.lastSupplierName ?? null,
      createdAt: p.createdAt ?? null,
      updatedAt: p.updatedAt ?? null,
    };
  }

  function handleFormSuccess(savedProduct, isNew) {
    const s = serialize(savedProduct);
    if (isNew) {
      setProducts((prev) => [s, ...prev]);
    } else {
      setProducts((prev) => prev.map((p) => p._id.toString() === s._id ? s : p));
    }
    setIsFormModalOpen(false);
    setEditingProduct(null);
  }

  function handleDelete(product) {
    if (!window.confirm(`Hapus produk "${product.name}"? Produk tidak akan muncul di katalog, namun data historis tetap terjaga.`)) return;
    setDeletingId(product._id); setDeleteError("");

    startTransition(async () => {
      try {
        const res = await fetch(`/api/products/${product._id}`, { method: "DELETE" });
        if (res.ok) {
          setProducts((prev) => prev.filter((p) => p._id !== product._id));
        } else {
          const json = await res.json();
          setDeleteError(json.error?.message || "Gagal menghapus produk");
        }
      } catch (_) {
        setDeleteError("Gagal terhubung ke server");
      } finally {
        setDeletingId(null);
      }
    });
  }

  // ── Filtering & sorting ──────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...products];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.aliases?.some((a) => a.toLowerCase().includes(q))
      );
    }
    if (skuFilter.trim()) {
      const q = skuFilter.trim().toLowerCase();
      list = list.filter((p) => p.sku.toLowerCase().includes(q));
    }
    if (stockFilter === "out") list = list.filter((p) => p.stock === 0);
    else if (stockFilter === "low") list = list.filter((p) => p.stock > 0 && p.stock <= STOCK_THRESHOLD_LOW);
    else if (stockFilter === "ok") list = list.filter((p) => p.stock > STOCK_THRESHOLD_LOW);

    list.sort((a, b) => {
      let va = a[sortBy]; let vb = b[sortBy];
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [products, search, skuFilter, stockFilter, sortBy, sortDir]);

  function toggleSort(col) {
    if (sortBy === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  }

  function SortIcon({ col }) {
    if (sortBy !== col) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-600 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const outOfStock = products.filter((p) => p.stock === 0).length;
  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= STOCK_THRESHOLD_LOW).length;
  const totalStock = products.reduce((sum, p) => sum + p.stock, 0);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Produk</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{products.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Stok</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalStock.toLocaleString("id-ID")}</p>
        </div>
        <div
          className={`rounded-xl border p-4 cursor-pointer transition-colors ${outOfStock > 0 ? "bg-red-50 border-red-200 hover:bg-red-100" : "bg-white border-gray-200"}`}
          onClick={() => setStockFilter(stockFilter === "out" ? "all" : "out")}
        >
          <p className="text-xs text-gray-500">Stok Habis</p>
          <p className={`text-2xl font-bold mt-1 ${outOfStock > 0 ? "text-red-600" : "text-gray-900"}`}>{outOfStock}</p>
          {outOfStock > 0 && <p className="text-xs text-red-500 mt-0.5">Klik untuk filter</p>}
        </div>
        <div
          className={`rounded-xl border p-4 cursor-pointer transition-colors ${lowStock > 0 ? "bg-yellow-50 border-yellow-200 hover:bg-yellow-100" : "bg-white border-gray-200"}`}
          onClick={() => setStockFilter(stockFilter === "low" ? "all" : "low")}
        >
          <p className="text-xs text-gray-500">Hampir Habis (≤{STOCK_THRESHOLD_LOW})</p>
          <p className={`text-2xl font-bold mt-1 ${lowStock > 0 ? "text-yellow-600" : "text-gray-900"}`}>{lowStock}</p>
          {lowStock > 0 && <p className="text-xs text-yellow-600 mt-0.5">Klik untuk filter</p>}
        </div>
      </div>

      {/* Error banner */}
      {deleteError && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      {/* Toolbar + tabel */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-200 flex flex-col gap-3">
          {/* Baris 1: filter pencarian */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-40">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama, merk, atau alias..."
                className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filter SKU */}
            <div className="relative w-36">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none font-mono">SKU</span>
              <input
                type="text"
                value={skuFilter}
                onChange={(e) => setSkuFilter(e.target.value.toUpperCase())}
                placeholder="Filter SKU..."
                className="w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filter stok */}
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Semua Stok</option>
              <option value="out">Stok Habis</option>
              <option value="low">Hampir Habis</option>
              <option value="ok">Stok Aman</option>
            </select>

            {(search || skuFilter || stockFilter !== "all") && (
              <button
                onClick={() => { setSearch(""); setSkuFilter(""); setStockFilter("all"); }}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Reset
              </button>
            )}
          </div>

          {/* Baris 2: jumlah produk + tombol aksi */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 mr-auto">{filtered.length} / {products.length}</span>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              <span className={isRefreshing ? "animate-spin inline-block" : "inline-block"}>🔄</span>
              {isRefreshing ? "Memuat..." : "Refresh"}
            </button>

            {/* Scan Barang Masuk */}
            <button
              onClick={openStockIn}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 whitespace-nowrap"
            >
              Scan Barang Masuk
            </button>

            {/* Import Excel */}
            <button
              onClick={() => setImportExcelOpen(true)}
              className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 whitespace-nowrap"
            >
              Import Excel
            </button>

            {/* Tambah Produk */}
            <button
              onClick={() => { setEditingProduct(null); setPrefill({ sku: "", stock: "" }); setIsFormModalOpen(true); }}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap"
            >
              + Tambah Produk
            </button>
          </div>
        </div>

        {/* Tabel */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-12">Foto</th>
                <th
                  className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                  onClick={() => toggleSort("name")}
                >
                  Nama Produk <SortIcon col="name" />
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Merk</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">SKU</th>
                <th
                  className="px-4 py-3 text-right font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                  onClick={() => toggleSort("price")}
                >
                  Harga Jual <SortIcon col="price" />
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  Harga Beli Satuan
                </th>
                <th
                  className="px-4 py-3 text-right font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                  onClick={() => toggleSort("stock")}
                >
                  Stok <SortIcon col="stock" />
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    Tidak ada produk yang cocok dengan filter
                  </td>
                </tr>
              ) : (
                filtered.map((product) => {
                  const isOut = product.stock === 0;
                  const isLow = product.stock > 0 && product.stock <= STOCK_THRESHOLD_LOW;

                  return (
                    <tr key={product._id} className="hover:bg-gray-50 transition-colors">
                      {/* Foto */}
                      <td className="px-4 py-3">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-10 h-10 rounded-lg object-cover border border-gray-200"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300 text-lg">
                            📦
                          </div>
                        )}
                      </td>

                      {/* Nama + Alias */}
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {product.name}
                        {product.aliases?.length > 0 && (
                          <p className="text-xs text-gray-400 font-normal mt-0.5">
                            {product.aliases.join(", ")}
                          </p>
                        )}
                      </td>

                      {/* Merk */}
                      <td className="px-4 py-3 text-gray-600 text-sm">
                        {product.brand || <span className="text-gray-300">—</span>}
                      </td>

                      {/* SKU */}
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{product.sku}</td>

                      {/* Harga Jual */}
                      <td className="px-4 py-3 text-right text-gray-900">{formatRupiah(product.price)}</td>

                      {/* Harga Beli Satuan */}
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                        {product.lastPurchasePrice != null
                          ? formatRupiah(product.lastPurchasePrice)
                          : <span className="text-gray-300">—</span>}
                      </td>

                      {/* Stok */}
                      <td className="px-4 py-3 text-right">
                        <span className={`text-lg font-bold ${isOut ? "text-red-600" : isLow ? "text-yellow-600" : "text-gray-900"}`}>
                          {product.stock}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">unit</span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isOut ? "bg-red-100 text-red-700" : isLow ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
                        }`}>
                          {isOut ? "Habis" : isLow ? "Hampir Habis" : "Aman"}
                        </span>
                      </td>

                      {/* Aksi */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => { setEditingProduct(product); setPrefill({ sku: "", stock: "" }); setIsFormModalOpen(true); }}
                            className="rounded-md px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setBarcodeProduct(product)}
                            className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
                          >
                            Barcode
                          </button>
                          <button
                            onClick={() => handleDelete(product)}
                            disabled={deletingId === product._id || isPending}
                            className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                          >
                            {deletingId === product._id ? "..." : "Hapus"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
            Menampilkan {filtered.length} dari {products.length} produk aktif
          </div>
        )}
      </div>

      {/* ── Stock-In Modal ─────────────────────────────────────────────────────── */}
      {stockInOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleStockInClose}
        >
          <div
            className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Barang Masuk</h2>
              <button onClick={handleStockInClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none focus:outline-none">×</button>
            </div>

            <div className="p-5 space-y-4">
              {stockInSuccess && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{stockInSuccess}</div>
              )}
              {stockInError && (
                <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{stockInError}</div>
              )}

              {/* Mode tabs */}
              <div className="flex gap-0 rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => { setStockInMode("scan"); setStockInProduct(null); }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${stockInMode === "scan" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  Scan Barcode
                </button>
                <button
                  onClick={() => { setStockInMode("manual"); setStockInProduct(null); }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${stockInMode === "manual" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  Manual
                </button>
                <button
                  onClick={() => { setStockInMode("bulk"); setStockInProduct(null); setBulkResult(null); }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${stockInMode === "bulk" ? "bg-green-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  Massal
                </button>
              </div>

              {/* ---- INFO SUPPLIER & HARGA BELI (berlaku semua mode) ---- */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Info Pembelian <span className="font-normal normal-case text-gray-400">(opsional)</span>
                </p>

                {/* Dropdown supplier */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Supplier
                  </label>
                  {suppliersLoading ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
                      <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                      Memuat daftar supplier...
                    </div>
                  ) : (
                    <select
                      value={selectedSupplierId}
                      onChange={(e) => {
                        setSelectedSupplierId(e.target.value);
                        if (e.target.value) setManualSupplierName("");
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">— Pilih Supplier —</option>
                      {suppliers.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name}{s.contactName ? ` (${s.contactName})` : ""}
                        </option>
                      ))}
                      <option value="__manual__" disabled>── atau ketik nama di bawah ──</option>
                    </select>
                  )}
                </div>

                {/* Input nama manual (jika tidak ada di daftar) */}
                {!selectedSupplierId && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Nama Supplier (jika tidak ada di daftar)
                    </label>
                    <input
                      type="text"
                      value={manualSupplierName}
                      onChange={(e) => setManualSupplierName(e.target.value)}
                      placeholder="Ketik nama supplier..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                {/* Harga beli */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Harga Beli per Satuan (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    placeholder="Contoh: 15000"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Scan mode — BarcodeScanner component */}
              <div style={{ display: stockInMode === "scan" && !stockInProduct ? "block" : "none" }} className="space-y-3">
                {scanNotFoundSku ? (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-3">
                    <p className="text-sm text-amber-800">
                      Produk dengan kode{" "}
                      <span className="font-mono font-semibold break-all">{scanNotFoundSku}</span>{" "}
                      belum terdaftar.
                    </p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Jumlah barang masuk
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setNewProductQty((q) => Math.max(1, q - 1))}
                          className="w-10 h-10 rounded-lg border border-gray-300 text-lg font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          aria-label="Kurangi"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="100000"
                          value={newProductQty}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            setNewProductQty(Number.isNaN(v) ? 1 : Math.max(1, v));
                          }}
                          className="w-20 rounded-lg border border-gray-300 text-center py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => setNewProductQty((q) => q + 1)}
                          className="w-10 h-10 rounded-lg border border-gray-300 text-lg font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          aria-label="Tambah"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        onClick={handleCreateFromScan}
                        className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        + Tambah Produk Baru
                      </button>
                      <button
                        onClick={handleScanRetry}
                        className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
                      >
                        Scan Ulang
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      SKU hasil scan akan otomatis terisi. Lengkapi nama, harga, dan foto produk
                      pada form berikutnya.
                    </p>
                  </div>
                ) : (
                  <BarcodeScanner
                    key={scannerKey}
                    onScan={handleScanResult}
                    autoStart
                  />
                )}
              </div>

              {/* Manual mode */}
              {stockInMode === "manual" && !stockInProduct && (
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Cari nama, merk, alias, atau SKU..."
                    value={stockInSearch}
                    onChange={(e) => setStockInSearch(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {stockInSearch.trim() === "" ? (
                      <p className="text-sm text-gray-400 text-center py-6">Ketik untuk mencari produk.</p>
                    ) : stockInSearchResults.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-6">Produk tidak ditemukan.</p>
                    ) : (
                      stockInSearchResults.map((p) => (
                        <button
                          key={p._id}
                          onClick={() => { setStockInProduct(p); setStockInQty(1); }}
                          className="w-full flex items-center gap-3 rounded-lg border border-gray-200 p-3 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                        >
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.name} className="h-9 w-9 rounded object-cover border border-gray-200 flex-shrink-0" />
                          ) : (
                            <div className="h-9 w-9 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 text-xs flex-shrink-0">—</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate">{p.name}</p>
                            <p className="text-xs text-gray-500 font-mono">{p.sku}{p.brand ? ` · ${p.brand}` : ""}</p>
                          </div>
                          <p className="text-xs text-gray-500 flex-shrink-0">Stok: {p.stock}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Product selected — input qty */}
              {stockInProduct && (
                <div className="space-y-4">
                  {/* Product card — tampilkan info lengkap hasil scan/pencarian */}
                  <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-3">
                    <div className="flex items-start gap-3">
                      {stockInProduct.imageUrl ? (
                        <img src={stockInProduct.imageUrl} alt={stockInProduct.name} className="h-16 w-16 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                      ) : (
                        <div className="h-16 w-16 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 flex-shrink-0">—</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{stockInProduct.name}</p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">{stockInProduct.sku}</p>
                        {stockInProduct.aliases?.length > 0 && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            Alias: {stockInProduct.aliases.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Info grid — responsif 2 kolom di layar lebar, 1 kolom di HP */}
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div>
                        <dt className="text-gray-400">Harga Jual</dt>
                        <dd className="text-gray-900 font-medium">{formatRupiah(stockInProduct.price)}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">Stok Saat Ini</dt>
                        <dd className="text-gray-900 font-medium">{stockInProduct.stock}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">Merk</dt>
                        <dd className="text-gray-900">{stockInProduct.brand || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">Kategori</dt>
                        <dd className="text-gray-900">{stockInProduct.category || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">Asal Barang</dt>
                        <dd className="text-gray-900">{stockInProduct.lastSupplierName || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">Harga Beli Satuan</dt>
                        <dd className="text-gray-900">
                          {stockInProduct.lastPurchasePrice != null
                            ? formatRupiah(stockInProduct.lastPurchasePrice)
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Quantity input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Jumlah barang masuk</label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setStockInQty((q) => Math.max(1, q - 1))} disabled={stockInSubmitting} className="w-10 h-10 rounded-lg border border-gray-300 text-lg font-medium hover:bg-gray-50 disabled:opacity-50">−</button>
                      <input
                        type="number" min="1" max="100000" value={stockInQty}
                        onChange={(e) => { const v = parseInt(e.target.value, 10); setStockInQty(Number.isNaN(v) ? 1 : Math.max(1, v)); }}
                        disabled={stockInSubmitting}
                        className="w-20 rounded-lg border border-gray-300 text-center py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button onClick={() => setStockInQty((q) => q + 1)} disabled={stockInSubmitting} className="w-10 h-10 rounded-lg border border-gray-300 text-lg font-medium hover:bg-gray-50 disabled:opacity-50">+</button>
                      <div className="flex gap-1 ml-1">
                        {[5, 10, 25].map((n) => (
                          <button key={n} onClick={() => setStockInQty(n)} disabled={stockInSubmitting} className="rounded-lg bg-gray-100 px-2.5 py-2 text-xs font-medium hover:bg-gray-200 disabled:opacity-50">{n}</button>
                        ))}
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">
                      Stok setelah ini: <span className="font-semibold text-blue-600">{stockInProduct.stock + stockInQty}</span>
                    </p>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleStockInSubmit}
                      disabled={stockInSubmitting}
                      className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {stockInSubmitting ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Menyimpan...
                        </span>
                      ) : "Tambah Stok"}
                    </button>
                    <button onClick={handleStockInCancel} disabled={stockInSubmitting} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      Batal
                    </button>
                  </div>
                </div>
              )}

              {/* ---- BULK MODE ---- */}
              {stockInMode === "bulk" && (
                <div className="space-y-3">
                  {bulkResult ? (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <div className="flex-1 rounded-lg bg-green-50 border border-green-200 p-3 text-center">
                          <p className="text-xl font-bold text-green-700">{bulkResult.success}</p>
                          <p className="text-xs text-green-600">Berhasil</p>
                        </div>
                        <div className="flex-1 rounded-lg bg-red-50 border border-red-200 p-3 text-center">
                          <p className="text-xl font-bold text-red-700">{bulkResult.failed}</p>
                          <p className="text-xs text-red-600">Gagal</p>
                        </div>
                      </div>
                      {bulkResult.failed > 0 && (
                        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs space-y-1">
                          {bulkResult.results.filter(r => r.status === "failed").map((r, i) => (
                            <p key={i} className="text-red-700"><span className="font-mono">{r.sku}</span> — {r.error}</p>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => { setBulkItems([]); setBulkResult(null); }}
                        className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
                      >
                        Sesi Baru
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* BarcodeScanner bulk — auto-restart setelah tiap scan */}
                      <div style={{ display: bulkResult ? "none" : "block" }}>
                        <BarcodeScanner
                          key={bulkScannerKey}
                          onScan={handleBulkScanResult}
                          onStop={() => setBulkScanning(false)}
                          autoStart
                        />
                      </div>
                      {bulkCameraError && (
                        <p className="text-xs text-red-600 text-center">{bulkCameraError}</p>
                      )}
                      {bulkItems.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            Antrian ({bulkItems.length} produk)
                          </p>
                          <div className="space-y-1.5 max-h-52 overflow-y-auto">
                            {bulkItems.map((item) => (
                              <div key={item.productId} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
                                {item.imageUrl ? (
                                  <img src={item.imageUrl} alt={item.name} className="h-8 w-8 rounded object-cover border border-gray-200 flex-shrink-0" />
                                ) : (
                                  <div className="h-8 w-8 rounded bg-gray-200 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-900 truncate">{item.name}</p>
                                  <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button onClick={() => handleBulkQtyChange(item.productId, item.quantity - 1)} disabled={item.quantity <= 1} className="w-6 h-6 rounded border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-30">−</button>
                                  <input
                                    type="number" min="1" value={item.quantity}
                                    onChange={(e) => handleBulkQtyChange(item.productId, e.target.value)}
                                    className="w-12 text-center text-xs rounded border border-gray-300 py-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                                  />
                                  <button onClick={() => handleBulkQtyChange(item.productId, item.quantity + 1)} className="w-6 h-6 rounded border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100">+</button>
                                  <button onClick={() => handleBulkRemove(item.productId)} className="ml-1 text-red-400 hover:text-red-600 text-xs" aria-label="Hapus">✕</button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={handleBulkSubmit}
                            disabled={bulkSubmitting}
                            className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {bulkSubmitting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                            {bulkSubmitting ? "Menyimpan..." : `Simpan Semua (${bulkItems.length} produk)`}
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 text-center py-2">
                          Belum ada produk. Scan barcode untuk menambahkan ke antrian.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Product Modal */}
      {isFormModalOpen && (
        <ProductFormModal
          product={editingProduct}
          onSuccess={handleFormSuccess}
          onClose={() => {
            setPrefill({ sku: "", stock: "" });
            setIsFormModalOpen(false);
            setEditingProduct(null);
          }}
          prefillSku={prefill.sku}
          prefillStock={prefill.stock}
        />
      )}

      {/* Barcode Label Modal */}
      {barcodeProduct && (
        <BarcodeLabel
          product={barcodeProduct}
          onClose={() => setBarcodeProduct(null)}
        />
      )}

      {/* Import Excel Modal */}
      {importExcelOpen && (
        <ImportExcelModal
          existingSkus={products.map((p) => p.sku)}
          onSuccess={() => handleRefresh()}
          onClose={() => setImportExcelOpen(false)}
        />
      )}
    </div>
  );
}
