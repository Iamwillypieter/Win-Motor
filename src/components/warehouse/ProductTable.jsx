"use client";

import { useState, useCallback, useTransition, useRef, useEffect } from "react";
import { formatRupiah } from "@/lib/utils";
import { deleteProductAction } from "@/server/actions/product.actions";
import ProductFormModal from "./ProductFormModal";
import BarcodeLabel from "./BarcodeLabel";

/**
 * ProductTable — displays the product inventory with search, SKU filter,
 * and actions to add, edit, or soft-delete products.
 *
 * Also provides two ways to add stock (barang masuk):
 *  - Scan Barcode: scan via device camera → system finds product → input quantity
 *  - Manual: search by name/SKU → pick from list → input quantity
 *
 * @param {{ initialProducts: Object[] }} props
 */
export default function ProductTable({ initialProducts = [] }) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [skuFilter, setSkuFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [barcodeProduct, setBarcodeProduct] = useState(null);

  // --- Stock-in modal state ---
  const [stockInOpen, setStockInOpen] = useState(false);
  const [stockInMode, setStockInMode] = useState("scan"); // "scan" | "manual"
  const [stockInProduct, setStockInProduct] = useState(null);
  const [stockInQty, setStockInQty] = useState(1);
  const [stockInSearch, setStockInSearch] = useState("");
  const [stockInSubmitting, setStockInSubmitting] = useState(false);
  const [stockInError, setStockInError] = useState("");
  const [stockInSuccess, setStockInSuccess] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const scannerRef = useRef(null);
  const isProcessingRef = useRef(false);

  // Derived: filter products for manual search inside stock-in modal
  const stockInSearchResults = stockInSearch.trim()
    ? products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(stockInSearch.toLowerCase()) ||
            p.sku.toLowerCase().includes(stockInSearch.toLowerCase())
        )
        .slice(0, 15)
    : [];

  // ------------------------------------------------------------------
  // Scanner helpers
  // ------------------------------------------------------------------

  const stopScanner = useCallback(async () => {
    const instance = scannerRef.current;
    if (!instance) return;
    try {
      await instance.stop();
      instance.clear();
    } catch (_) {}
    scannerRef.current = null;
    setIsScanning(false);
  }, []);

  const handleScanResult = useCallback(
    async (decodedText) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      await stopScanner();

      try {
        const res = await fetch(
          `/api/products?sku=${encodeURIComponent(decodedText)}`
        );
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
            startScanner();
          }, 2000);
        }
      } catch (_) {
        setStockInError("Gagal mencari produk. Coba lagi.");
        setTimeout(() => {
          isProcessingRef.current = false;
          setStockInError("");
          startScanner();
        }, 2000);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopScanner]
  );

  const startScanner = useCallback(async () => {
    if (scannerRef.current) return;
    setCameraError("");
    setStockInError("");

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
        "html5-qrcode"
      );

      const instance = new Html5Qrcode("stock-in-barcode-reader", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
        ],
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });

      scannerRef.current = instance;

      await instance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 140 } },
        (text) => handleScanResult(text),
        () => {}
      );

      setIsScanning(true);
    } catch (err) {
      console.error("Scanner start error:", err);
      setCameraError(
        "Tidak dapat mengakses kamera. Pastikan izin kamera diberikan, atau gunakan mode Manual."
      );
      scannerRef.current = null;
    }
  }, [handleScanResult]);

  // Stop scanner when switching to manual mode or closing modal
  useEffect(() => {
    if (stockInMode === "manual" || !stockInOpen) {
      stopScanner();
      isProcessingRef.current = false;
    }
  }, [stockInMode, stockInOpen, stopScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const instance = scannerRef.current;
      if (instance) {
        instance.stop().then(() => instance.clear()).catch(() => {});
      }
    };
  }, []);

  // ------------------------------------------------------------------
  // Stock-in submit
  // ------------------------------------------------------------------

  async function handleStockInSubmit() {
    if (!stockInProduct || !Number.isInteger(stockInQty) || stockInQty <= 0)
      return;

    setStockInSubmitting(true);
    setStockInError("");

    try {
      const res = await fetch(
        `/api/products/${stockInProduct._id}/stock-in`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: stockInQty }),
        }
      );
      const json = await res.json();

      if (res.ok) {
        const updated = json.data.product;

        // Update local product list so stok di tabel langsung berubah
        setProducts((prev) =>
          prev.map((p) =>
            p._id.toString() === updated._id.toString()
              ? { ...p, stock: updated.stock }
              : p
          )
        );

        setStockInSuccess(
          `Stok "${stockInProduct.name}" bertambah ${stockInQty}. Stok sekarang: ${updated.stock}`
        );

        // Reset for next scan
        setStockInProduct(null);
        setStockInQty(1);
        isProcessingRef.current = false;

        if (stockInMode === "scan") {
          setTimeout(() => startScanner(), 400);
        }

        setTimeout(() => setStockInSuccess(""), 3000);
      } else {
        setStockInError(json.error?.message || "Gagal menambah stok.");
      }
    } catch (_) {
      setStockInError("Gagal menambah stok. Coba lagi.");
    } finally {
      setStockInSubmitting(false);
    }
  }

  function handleStockInCancel() {
    setStockInProduct(null);
    setStockInQty(1);
    setStockInError("");
    isProcessingRef.current = false;
    if (stockInMode === "scan") {
      setTimeout(() => startScanner(), 300);
    }
  }

  function handleStockInClose() {
    setStockInOpen(false);
    setStockInProduct(null);
    setStockInQty(1);
    setStockInSearch("");
    setStockInError("");
    setStockInSuccess("");
    setCameraError("");
    isProcessingRef.current = false;
  }

  // ------------------------------------------------------------------
  // Inventory CRUD helpers (unchanged)
  // ------------------------------------------------------------------

  const refreshProducts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (skuFilter) params.set("sku", skuFilter);
      const res = await fetch(`/api/products?${params.toString()}`);
      const json = await res.json();
      if (json.data) setProducts(json.data);
    } catch (err) {
      console.error("Failed to refresh products:", err);
    }
  }, [search, skuFilter]);

  function handleAddProduct() {
    setEditingProduct(null);
    setIsModalOpen(true);
  }

  function handleEditProduct(product) {
    setEditingProduct(product);
    setIsModalOpen(true);
  }

  function handleDeleteProduct(product) {
    if (
      !window.confirm(
        `Hapus produk "${product.name}"? Produk tidak akan muncul di katalog, namun data historis tetap terjaga.`
      )
    )
      return;

    setDeletingId(product._id);
    setError("");

    startTransition(async () => {
      const result = await deleteProductAction(product._id.toString());
      setDeletingId(null);
      if (result.success) {
        setProducts((prev) => prev.filter((p) => p._id !== product._id));
      } else {
        setError(result.error?.message || "Gagal menghapus produk");
      }
    });
  }

  function handleModalSuccess(savedProduct, isNew) {
    if (isNew) {
      setProducts((prev) => [savedProduct, ...prev]);
    } else {
      setProducts((prev) =>
        prev.map((p) =>
          p._id.toString() === savedProduct._id.toString() ? savedProduct : p
        )
      );
    }
    setIsModalOpen(false);
  }

  // ------------------------------------------------------------------
  // Filtered view
  // ------------------------------------------------------------------

  const filtered = products.filter((p) => {
    const matchesSearch =
      !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchesSku =
      !skuFilter || p.sku.toLowerCase().includes(skuFilter.toLowerCase());
    return matchesSearch && matchesSku;
  });

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1">
          <input
            type="text"
            placeholder="Cari nama produk..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-56"
            aria-label="Cari nama produk"
          />
          <input
            type="text"
            placeholder="Filter SKU..."
            value={skuFilter}
            onChange={(e) => setSkuFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-40"
            aria-label="Filter SKU"
          />
        </div>

        <div className="flex gap-2">
          {/* Scan / Barang Masuk button */}
          <button
            onClick={() => setStockInOpen(true)}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 whitespace-nowrap"
          >
            Scan Barang Masuk
          </button>
          <button
            onClick={handleAddProduct}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap"
          >
            + Tambah Produk
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Tabel produk">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Gambar</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Nama Produk</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Merk</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">SKU</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Harga</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Stok</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  {products.length === 0
                    ? "Belum ada produk. Klik \"+ Tambah Produk\" untuk memulai."
                    : "Tidak ada produk yang cocok dengan filter."}
                </td>
              </tr>
            ) : (
              filtered.map((product) => (
                <tr key={product._id} className="hover:bg-gray-50 transition-colors">
                  {/* Image */}
                  <td className="px-4 py-3">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-10 w-10 rounded-lg object-cover border border-gray-200"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 text-xs">
                        —
                      </div>
                    )}
                  </td>
                  {/* Name */}
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {product.name}
                    {product.aliases?.length > 0 && (
                      <p className="text-xs text-gray-400 font-normal mt-0.5">
                        Alias: {product.aliases.join(", ")}
                      </p>
                    )}
                  </td>
                  {/* Brand */}
                  <td className="px-4 py-3 text-gray-600 text-sm">
                    {product.brand || <span className="text-gray-300">—</span>}
                  </td>
                  {/* SKU */}
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{product.sku}</td>
                  {/* Price */}
                  <td className="px-4 py-3 text-right text-gray-900">
                    {formatRupiah(product.price)}
                  </td>
                  {/* Stock */}
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-medium ${
                        product.stock === 0
                          ? "text-red-600"
                          : product.stock <= 5
                          ? "text-yellow-600"
                          : "text-gray-900"
                      }`}
                    >
                      {product.stock}
                    </span>
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleEditProduct(product)}
                        className="rounded-md px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-label={`Edit produk ${product.name}`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setBarcodeProduct(product)}
                        className="rounded-md px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
                        aria-label={`Cetak barcode ${product.name}`}
                      >
                        Barcode
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product)}
                        disabled={deletingId === product._id || isPending}
                        className="rounded-md px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                        aria-label={`Hapus produk ${product.name}`}
                      >
                        {deletingId === product._id ? (
                          <span className="flex items-center gap-1">
                            <span className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                            Menghapus...
                          </span>
                        ) : (
                          "Hapus"
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer count */}
      {filtered.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
          Menampilkan {filtered.length} dari {products.length} produk
        </div>
      )}

      {/* ================================================================
          Stock-In Modal (Scan Barang Masuk)
          ================================================================ */}
      {stockInOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleStockInClose}
        >
          <div
            className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Barang Masuk</h2>
              <button
                onClick={handleStockInClose}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none focus:outline-none"
                aria-label="Tutup modal"
              >
                ×
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Success banner */}
              {stockInSuccess && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                  {stockInSuccess}
                </div>
              )}

              {/* Error banner */}
              {stockInError && (
                <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {stockInError}
                </div>
              )}

              {/* Mode tabs */}
              <div className="flex gap-0 rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => { setStockInMode("scan"); setStockInProduct(null); }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    stockInMode === "scan"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Scan Barcode
                </button>
                <button
                  onClick={() => { setStockInMode("manual"); setStockInProduct(null); }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    stockInMode === "manual"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Manual
                </button>
              </div>

              {/* ---- SCAN MODE ---- */}
              {stockInMode === "scan" && !stockInProduct && (
                <div className="space-y-3">
                  {/* Camera viewport */}
                  <div
                    id="stock-in-barcode-reader"
                    className="w-full rounded-lg overflow-hidden bg-gray-900 min-h-[180px] flex items-center justify-center"
                  >
                    {!isScanning && (
                      <p className="text-gray-400 text-sm text-center px-4 py-10">
                        Tekan &ldquo;Mulai Scan&rdquo; lalu arahkan kamera ke barcode produk
                      </p>
                    )}
                  </div>

                  {cameraError && (
                    <p className="text-sm text-red-600 text-center">{cameraError}</p>
                  )}

                  <div className="flex justify-center">
                    {!isScanning ? (
                      <button
                        onClick={startScanner}
                        className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        Mulai Scan
                      </button>
                    ) : (
                      <button
                        onClick={stopScanner}
                        className="rounded-lg bg-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
                      >
                        Stop
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ---- MANUAL MODE ---- */}
              {stockInMode === "manual" && !stockInProduct && (
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Cari nama atau SKU produk..."
                    value={stockInSearch}
                    onChange={(e) => setStockInSearch(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {stockInSearch.trim() === "" ? (
                      <p className="text-sm text-gray-400 text-center py-6">
                        Ketik nama atau SKU untuk mencari produk.
                      </p>
                    ) : stockInSearchResults.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-6">
                        Produk tidak ditemukan.
                      </p>
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
                            <p className="text-xs text-gray-500 font-mono">{p.sku}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-gray-500">Stok: {p.stock}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ---- PRODUCT SELECTED: input quantity ---- */}
              {stockInProduct && (
                <div className="space-y-4">
                  {/* Product card */}
                  <div className="flex items-center gap-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
                    {stockInProduct.imageUrl ? (
                      <img src={stockInProduct.imageUrl} alt={stockInProduct.name} className="h-12 w-12 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 flex-shrink-0">—</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{stockInProduct.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{stockInProduct.sku}</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Stok saat ini: <span className="font-medium">{stockInProduct.stock}</span>
                      </p>
                    </div>
                  </div>

                  {/* Quantity input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Jumlah barang masuk
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setStockInQty((q) => Math.max(1, q - 1))}
                        disabled={stockInSubmitting}
                        className="w-10 h-10 rounded-lg border border-gray-300 text-lg font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        aria-label="Kurangi"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="100000"
                        value={stockInQty}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          setStockInQty(Number.isNaN(v) ? 1 : Math.max(1, v));
                        }}
                        disabled={stockInSubmitting}
                        className="w-20 rounded-lg border border-gray-300 text-center py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => setStockInQty((q) => q + 1)}
                        disabled={stockInSubmitting}
                        className="w-10 h-10 rounded-lg border border-gray-300 text-lg font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        aria-label="Tambah"
                      >
                        +
                      </button>
                      <div className="flex gap-1 ml-1">
                        {[5, 10, 25].map((n) => (
                          <button
                            key={n}
                            onClick={() => setStockInQty(n)}
                            disabled={stockInSubmitting}
                            className="rounded-lg bg-gray-100 px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 focus:outline-none disabled:opacity-50"
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="mt-2 text-sm text-gray-600">
                      Stok setelah ini:{" "}
                      <span className="font-semibold text-blue-600">
                        {stockInProduct.stock + stockInQty}
                      </span>
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleStockInSubmit}
                      disabled={stockInSubmitting}
                      className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {stockInSubmitting ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Menyimpan...
                        </span>
                      ) : (
                        "Tambah Stok"
                      )}
                    </button>
                    <button
                      onClick={handleStockInCancel}
                      disabled={stockInSubmitting}
                      className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none disabled:opacity-50"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <ProductFormModal
          product={editingProduct}
          onSuccess={handleModalSuccess}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      {/* Barcode Label Modal */}
      {barcodeProduct && (
        <BarcodeLabel
          product={barcodeProduct}
          onClose={() => setBarcodeProduct(null)}
        />
      )}
    </div>
  );
}
