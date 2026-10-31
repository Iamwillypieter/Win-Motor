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

  // Bulk stock-in state
  const [bulkItems, setBulkItems] = useState([]);
  const [bulkScanning, setBulkScanning] = useState(false);
  const bulkScannerStopRef = useRef(null);
  const bulkProcessingRef = useRef(false);
  const [bulkScannerKey, setBulkScannerKey] = useState(0);
  const [bulkCameraError, setBulkCameraError] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

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
        setStockInProduct(json.data[0]);
        setStockInQty(1);
        setStockInError("");
      } else {
        setStockInError(`Produk dengan kode "${decodedText}" tidak ditemukan.`);
        setTimeout(() => {
          isProcessingRef.current = false;
          setStockInError("");
          setScannerKey((k) => k + 1);
        }, 2000);
      }
    } catch (_) {
      setStockInError("Gagal mencari produk. Coba lagi.");
      setTimeout(() => {
        isProcessingRef.current = false;
        setStockInError("");
        setScannerKey((k) => k + 1);
      }, 2000);
    }
  }, []);

  useEffect(() => {
    if (stockInMode === "manual" || !stockInOpen) {
      isProcessingRef.current = false;
      setScannerKey((k) => k + 1);
    }
  }, [stockInMode, stockInOpen]);

  // ── Stock-in submit ──────────────────────────────────────────────────────────

  async function handleStockInSubmit() {
    if (!stockInProduct || !Number.isInteger(stockInQty) || stockInQty <= 0) return;
    setStockInSubmitting(true); setStockInError("");

    try {
      const res = await fetch(`/api/products/${stockInProduct._id}/stock-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: stockInQty }),
      });
      const json = await res.json();

      if (res.ok) {
        const updated = json.data.product;
        setProducts((prev) => prev.map((p) =>
          p._id.toString() === updated._id.toString()
            ? { ...p, stock: updated.stock }
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
    isProcessingRef.current = false;
    if (stockInMode === "scan") setScannerKey((k) => k + 1);
  }

  function handleStockInClose() {
    setStockInOpen(false); setStockInProduct(null); setStockInQty(1);
    setStockInSearch(""); setStockInError(""); setStockInSuccess(""); setCameraError("");
    isProcessingRef.current = false;
    if (bulkScannerStopRef.current) bulkScannerStopRef.current();
    setBulkItems([]); setBulkResult(null); setBulkCameraError("");
    bulkProcessingRef.current = false;
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
          }];
        });
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
  }, []);

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
    try {
      if (bulkScannerStopRef.current) bulkScannerStopRef.current();
      const res = await fetch("/api/products/batch-stock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: bulkItems }),
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
              onClick={() => setStockInOpen(true)}
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
              onClick={() => { setEditingProduct(null); setIsFormModalOpen(true); }}
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
                  Harga <SortIcon col="price" />
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
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
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

                      {/* Harga */}
                      <td className="px-4 py-3 text-right text-gray-900">{formatRupiah(product.price)}</td>

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
                            onClick={() => { setEditingProduct(product); setIsFormModalOpen(true); }}
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

              {/* Scan mode — BarcodeScanner component */}
              <div style={{ display: stockInMode === "scan" && !stockInProduct ? "block" : "none" }} className="space-y-3">
                <BarcodeScanner
                  key={scannerKey}
                  onScan={handleScanResult}
                  autoStart={stockInMode === "scan" && !stockInProduct}
                />
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
                  <div className="flex items-center gap-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
                    {stockInProduct.imageUrl ? (
                      <img src={stockInProduct.imageUrl} alt={stockInProduct.name} className="h-12 w-12 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 flex-shrink-0">—</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{stockInProduct.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{stockInProduct.sku}{stockInProduct.brand ? ` · ${stockInProduct.brand}` : ""}</p>
                      <p className="text-xs text-gray-600 mt-0.5">Stok saat ini: <span className="font-medium">{stockInProduct.stock}</span></p>
                    </div>
                  </div>

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
          onClose={() => { setIsFormModalOpen(false); setEditingProduct(null); }}
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
