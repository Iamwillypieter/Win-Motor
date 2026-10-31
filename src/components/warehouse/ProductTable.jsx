"use client";

import { useState, useCallback, useTransition, useRef, useEffect } from "react";
import { formatRupiah } from "@/lib/utils";
import { deleteProductAction } from "@/server/actions/product.actions";
import ProductFormModal from "./ProductFormModal";
import BarcodeLabel from "./BarcodeLabel";
import ImportExcelModal from "./ImportExcelModal";
import BarcodeScanner from "@/components/ui/BarcodeScanner";

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [barcodeProduct, setBarcodeProduct] = useState(null);
  const [importExcelOpen, setImportExcelOpen] = useState(false);

  // --- Stock-in modal state ---
  const [stockInOpen, setStockInOpen] = useState(false);
  const [stockInMode, setStockInMode] = useState("scan"); // "scan" | "manual" | "bulk"
  const [stockInProduct, setStockInProduct] = useState(null);
  const [stockInQty, setStockInQty] = useState(1);
  const [stockInSearch, setStockInSearch] = useState("");
  const [stockInSubmitting, setStockInSubmitting] = useState(false);
  const [stockInError, setStockInError] = useState("");
  const [stockInSuccess, setStockInSuccess] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const isProcessingRef = useRef(false);
  // scannerKey dipakai untuk re-mount BarcodeScanner component saat scan ulang
  const [scannerKey, setScannerKey] = useState(0);

  // --- Supplier state (dipakai oleh semua mode stock-in) ---
  const [suppliers, setSuppliers] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [manualSupplierName, setManualSupplierName] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");

  // --- Bulk stock-in state ---
  // bulkItems: Array<{ productId, sku, name, imageUrl, currentStock, quantity }>
  const [bulkItems, setBulkItems] = useState([]);
  const [bulkScanning, setBulkScanning] = useState(false);
  const bulkScannerStopRef = useRef(null); // ref ke fungsi stop dari useBarcodeScanner
  const bulkProcessingRef = useRef(false);
  const [bulkScannerKey, setBulkScannerKey] = useState(0);
  const [bulkCameraError, setBulkCameraError] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState(null); // hasil setelah submit

  // --- Produk baru dari hasil scan (kode tidak ditemukan di DB) ---
  const [scanNotFoundSku, setScanNotFoundSku] = useState(null);
  const [newProductQty, setNewProductQty] = useState(1);
  // Prefill untuk ProductFormModal saat tambah produk dari hasil scan
  const [prefill, setPrefill] = useState({ sku: "", stock: "" });

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

  // ------------------------------------------------------------------
  // Scanner helpers — menggunakan BarcodeScanner component + useBarcodeScanner hook
  // Tidak ada html5-qrcode, tidak ada manipulasi DOM langsung
  // ------------------------------------------------------------------

  const handleScanResult = useCallback(
    async (decodedText) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      // Scanner sudah di-stop oleh hook sebelum callback ini dipanggil

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
    },
    []
  );

  // Reset scanner saat pindah mode atau tutup modal
  useEffect(() => {
    if (stockInMode === "manual" || !stockInOpen) {
      isProcessingRef.current = false;
      setScannerKey((k) => k + 1); // force re-mount BarcodeScanner
    }
  }, [stockInMode, stockInOpen]);

  // ------------------------------------------------------------------
  // Stock-in submit
  // ------------------------------------------------------------------

  async function handleStockInSubmit() {
    if (!stockInProduct || !Number.isInteger(stockInQty) || stockInQty <= 0)
      return;

    setStockInSubmitting(true);
    setStockInError("");

    // Resolusi supplier: pilih dari dropdown (id) atau ketik manual (nama)
    const resolvedSupplierId = selectedSupplierId || null;
    const resolvedSupplierName = selectedSupplierId
      ? suppliers.find((s) => s._id === selectedSupplierId)?.name ?? null
      : manualSupplierName.trim() || null;
    const resolvedPurchasePrice = purchasePrice !== "" ? parseInt(purchasePrice, 10) || null : null;

    try {
      const res = await fetch(
        `/api/products/${stockInProduct._id}/stock-in`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity: stockInQty,
            supplierId: resolvedSupplierId,
            supplierName: resolvedSupplierName,
            purchasePrice: resolvedPurchasePrice,
          }),
        }
      );
      const json = await res.json();

      if (res.ok) {
        const updated = json.data.product;

        // Update local product list — pakai data terbaru dari server (stok,
        // asal barang, & harga beli terakhir ikut tersinkron)
        setProducts((prev) =>
          prev.map((p) =>
            p._id.toString() === updated._id.toString()
              ? { ...p, ...updated }
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
          // Re-mount BarcodeScanner untuk scan berikutnya
          setScannerKey((k) => k + 1);
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
      setScannerKey((k) => k + 1); // re-mount scanner
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
    // Reset supplier state
    setSelectedSupplierId("");
    setManualSupplierName("");
    setPurchasePrice("");
    // Reset bulk state
    if (bulkScannerStopRef.current) bulkScannerStopRef.current();
    setBulkItems([]);
    setBulkResult(null);
    setBulkCameraError("");
    bulkProcessingRef.current = false;
    // Reset state produk baru dari scan
    setScanNotFoundSku(null);
    setNewProductQty(1);
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
    setIsModalOpen(true);
  }

  // Scan ulang setelah produk tidak ditemukan
  function handleScanRetry() {
    setScanNotFoundSku(null);
    setNewProductQty(1);
    isProcessingRef.current = false;
    setScannerKey((k) => k + 1); // re-mount scanner
  }

  // ------------------------------------------------------------------
  // Bulk stock-in helpers — pakai BarcodeScanner component
  // ------------------------------------------------------------------

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
              i.productId === found._id.toString()
                ? { ...i, quantity: i.quantity + 1 }
                : i
            );
          }
          return [
            ...prev,
            {
              productId: found._id.toString(),
              sku: found.sku,
              name: found.name,
              imageUrl: found.imageUrl ?? null,
              currentStock: found.stock,
              quantity: 1,
            },
          ];
        });
      } else {
        setBulkCameraError(`SKU "${decodedText}" tidak ditemukan. Scan ulang.`);
        setTimeout(() => setBulkCameraError(""), 2000);
      }
    } catch {
      setBulkCameraError("Gagal mencari produk. Coba lagi.");
      setTimeout(() => setBulkCameraError(""), 2000);
    } finally {
      // Setelah hasil diproses, restart scanner untuk scan berikutnya
      setTimeout(() => {
        bulkProcessingRef.current = false;
        setBulkScannerKey((k) => k + 1);
      }, 800);
    }
  }, []);

  // Reset bulk scanner saat pindah mode atau tutup modal
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
        const { results } = json.data;
        // Update stok di tabel lokal untuk semua yang sukses
        results
          .filter((r) => r.status === "success")
          .forEach((r) => {
            setProducts((prev) =>
              prev.map((p) =>
                p._id.toString() === r.productId
                  ? { ...p, stock: r.newStock }
                  : p
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

  const refreshProducts = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (skuFilter) params.set("sku", skuFilter);
      const res = await fetch(`/api/products?${params.toString()}`);
      const json = await res.json();
      if (json.data) setProducts(json.data);
    } catch (err) {
      console.error("Failed to refresh products:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [search, skuFilter]);

  function handleAddProduct() {
    setEditingProduct(null);
    setPrefill({ sku: "", stock: "" });
    setIsModalOpen(true);
  }

  function handleEditProduct(product) {
    setEditingProduct(product);
    setPrefill({ sku: "", stock: "" });
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

        <div className="flex flex-wrap gap-2">
          {/* Refresh */}
          <button
            onClick={refreshProducts}
            disabled={isRefreshing}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 whitespace-nowrap"
          >
            <span className={isRefreshing ? "animate-spin inline-block" : "inline-block"}>🔄</span>
            {isRefreshing ? "Memuat..." : "Refresh"}
          </button>
          {/* Scan / Barang Masuk button */}
          <button
            onClick={openStockIn}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 whitespace-nowrap"
          >
            Scan Barang Masuk
          </button>
          <button
            onClick={() => setImportExcelOpen(true)}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 whitespace-nowrap"
          >
            Import Excel
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
              <th className="px-4 py-3 text-left font-medium text-gray-600">Kategori</th>
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
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
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
                  {/* Kategori */}
                  <td className="px-4 py-3 text-gray-600 text-sm">
                    {product.category || <span className="text-gray-300">—</span>}
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
                <button
                  onClick={() => { setStockInMode("bulk"); setStockInProduct(null); setBulkResult(null); }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    stockInMode === "bulk"
                      ? "bg-green-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
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
                        // Bersihkan nama manual jika pilih dari dropdown
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

              {/* ---- SCAN MODE ---- */}
              {stockInMode === "scan" && !stockInProduct && (
                <div className="space-y-3">
                  {scanNotFoundSku ? (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-3">
                      <p className="text-sm text-amber-800">
                        Produk dengan kode{" "}
                        <span className="font-mono font-semibold">{scanNotFoundSku}</span>{" "}
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
                    <>
                      {/* BarcodeScanner menggunakan native BarcodeDetector API */}
                      <BarcodeScanner
                        key={scannerKey}
                        onScan={handleScanResult}
                        autoStart
                      />
                    </>
                  )}
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

              {/* ---- BULK MODE ---- */}
              {stockInMode === "bulk" && (
                <div className="space-y-3">
                  {/* Hasil submit */}
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
                      <BarcodeScanner
                        key={bulkScannerKey}
                        onScan={handleBulkScanResult}
                        onStop={() => setBulkScanning(false)}
                        autoStart
                      />

                      {bulkCameraError && (
                        <p className="text-xs text-red-600 text-center">{bulkCameraError}</p>
                      )}

                      {/* Antrian item */}
                      {bulkItems.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            Antrian ({bulkItems.length} produk)
                          </p>
                          <div className="space-y-1.5 max-h-52 overflow-y-auto">
                            {bulkItems.map((item) => (
                              <div
                                key={item.productId}
                                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2"
                              >
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
                                  <button
                                    onClick={() => handleBulkQtyChange(item.productId, item.quantity - 1)}
                                    disabled={item.quantity <= 1}
                                    className="w-6 h-6 rounded border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                                  >−</button>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) => handleBulkQtyChange(item.productId, e.target.value)}
                                    className="w-12 text-center text-xs rounded border border-gray-300 py-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                                  />
                                  <button
                                    onClick={() => handleBulkQtyChange(item.productId, item.quantity + 1)}
                                    className="w-6 h-6 rounded border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100"
                                  >+</button>
                                  <button
                                    onClick={() => handleBulkRemove(item.productId)}
                                    className="ml-1 text-red-400 hover:text-red-600 text-xs"
                                    aria-label="Hapus dari antrian"
                                  >✕</button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <button
                            onClick={handleBulkSubmit}
                            disabled={bulkSubmitting}
                            className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {bulkSubmitting && (
                              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            )}
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

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <ProductFormModal
          product={editingProduct}
          onSuccess={handleModalSuccess}
          onClose={() => {
            setPrefill({ sku: "", stock: "" });
            setIsModalOpen(false);
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
          onSuccess={(count) => {
            // Refresh daftar produk setelah import berhasil
            refreshProducts();
          }}
          onClose={() => setImportExcelOpen(false)}
        />
      )}
    </div>
  );
}
