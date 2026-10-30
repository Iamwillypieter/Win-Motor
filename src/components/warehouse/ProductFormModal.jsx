"use client";

import { useState, useRef, useEffect } from "react";
import { MAX_IMAGE_SIZE_MB } from "@/types/product.types";

/**
 * ProductFormModal — modal form for creating or editing a product.
 * Handles text fields, image upload, and supplier/purchase info.
 *
 * @param {{
 *   product: Object|null,
 *   onSuccess: (product: Object, isNew: boolean) => void,
 *   onClose: () => void,
 *   prefillSku?: string,   // SKU hasil scan untuk produk baru (mode tambah)
 *   prefillStock?: string  // Jumlah barang masuk untuk produk baru (mode tambah)
 * }} props
 */
export default function ProductFormModal({ product, onSuccess, onClose, prefillSku = "", prefillStock = "" }) {
  const isNew = !product;

  const [form, setForm] = useState({
    name: product?.name || "",
    sku: product?.sku || prefillSku || "",
    price: product?.price !== undefined ? String(product.price) : "",
    stock:
      product?.stock !== undefined
        ? String(product.stock)
        : prefillStock !== ""
        ? String(prefillStock)
        : "",
    brand: product?.brand || "",
    category: product?.category || "",
    aliasInput: "",
    purchasePrice: "",
  });
  const [aliases, setAliases] = useState(
    Array.isArray(product?.aliases) ? product.aliases : []
  );

  // Supplier state
  const [suppliers, setSuppliers] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [manualSupplierName, setManualSupplierName] = useState("");

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(product?.imageUrl || null);
  const [imageConverting, setImageConverting] = useState(false);
  const [imageInfo, setImageInfo] = useState("");
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fileInputRef = useRef(null);
  const firstInputRef = useRef(null);

  // Fetch daftar supplier saat modal dibuka
  useEffect(() => {
    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((json) => { if (json.data) setSuppliers(json.data); })
      .catch(() => {})
      .finally(() => setSuppliersLoading(false));
  }, []);

  // Focus first input on open
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  }

  function handleAddAlias() {
    const val = form.aliasInput.trim();
    if (!val) return;
    if (aliases.includes(val)) return; // jangan duplikat
    setAliases((prev) => [...prev, val]);
    setForm((prev) => ({ ...prev, aliasInput: "" }));
  }

  function handleRemoveAlias(idx) {
    setAliases((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleAliasKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddAlias();
    }
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation — terima semua format gambar umum
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff"];
    if (!file.type.startsWith("image/")) {
      setErrors((prev) => ({
        ...prev,
        image: "File harus berupa gambar (JPG, PNG, WEBP, dll)",
      }));
      e.target.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      setErrors((prev) => ({
        ...prev,
        image: `Ukuran gambar melebihi batas ${MAX_IMAGE_SIZE_MB}MB`,
      }));
      e.target.value = "";
      return;
    }

    setErrors((prev) => ({ ...prev, image: "" }));
    setImageConverting(true);

    // Konversi ke WebP di browser menggunakan Canvas API
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        // Hitung dimensi — maksimal 800px di sisi terpanjang
        const MAX_SIDE = 800;
        let { width, height } = img;
        if (width > MAX_SIDE || height > MAX_SIDE) {
          if (width > height) {
            height = Math.round((height * MAX_SIDE) / width);
            width = MAX_SIDE;
          } else {
            width = Math.round((width * MAX_SIDE) / height);
            height = MAX_SIDE;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Export sebagai WebP kualitas 80%
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              // Fallback: pakai file asli jika browser tidak support WebP
              setImageFile(file);
              setImagePreview(URL.createObjectURL(file));
              setImageConverting(false);
              return;
            }
            const webpFile = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, ".webp"),
              { type: "image/webp" }
            );
            setImageFile(webpFile);
            setImagePreview(URL.createObjectURL(blob));
            setImageConverting(false);

            // Tampilkan info kompresi
            const savedKB = Math.round((file.size - blob.size) / 1024);
            const savedPct = Math.round((1 - blob.size / file.size) * 100);
            if (savedKB > 0) {
              setImageInfo(`WebP ${Math.round(blob.size / 1024)}KB (hemat ${savedKB}KB / ${savedPct}%)`);
            } else {
              setImageInfo(`WebP ${Math.round(blob.size / 1024)}KB`);
            }
          },
          "image/webp",
          0.8 // kualitas 80%
        );
      };
      img.onerror = () => {
        setErrors((prev) => ({ ...prev, image: "Gagal memproses gambar. Coba file lain." }));
        setImageConverting(false);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function validate() {
    const newErrors = {};

    if (!form.name.trim()) newErrors.name = "Nama produk wajib diisi";
    if (isNew && !form.sku.trim()) newErrors.sku = "SKU wajib diisi";

    const price = Number(form.price);
    if (form.price === "" || isNaN(price) || price < 0) {
      newErrors.price = "Harga harus berupa angka non-negatif";
    }

    const stock = Number(form.stock);
    if (form.stock === "" || isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
      newErrors.stock = "Stok harus berupa bilangan bulat non-negatif";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError("");

    if (!validate()) return;

    setIsLoading(true);

    try {
      let savedProduct;

      if (isNew) {
        // Resolusi supplier: dropdown → manual → kosong
        const resolvedSupplierId = selectedSupplierId || null;
        const resolvedSupplierName = selectedSupplierId
          ? (suppliers.find((s) => s._id === selectedSupplierId)?.name ?? null)
          : manualSupplierName.trim() || null;
        const resolvedPurchasePrice =
          form.purchasePrice !== "" ? parseInt(form.purchasePrice, 10) || null : null;

        // Create product
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            sku: form.sku.trim().toUpperCase(),
            price: Number(form.price),
            stock: Number(form.stock),
            brand: form.brand.trim() || null,
            category: form.category.trim() || null,
            aliases,
            supplierId: resolvedSupplierId,
            supplierName: resolvedSupplierName,
            purchasePrice: resolvedPurchasePrice,
          }),
        });

        const json = await res.json();

        if (!res.ok) {
          setSubmitError(json.error?.message || "Gagal membuat produk");
          setIsLoading(false);
          return;
        }

        savedProduct = json.data;
      } else {
        // Update product
        const updates = {
          name: form.name.trim(),
          price: Number(form.price),
          stock: Number(form.stock),
          brand: form.brand.trim() || null,
          category: form.category.trim() || null,
          aliases,
        };

        const res = await fetch(`/api/products/${product._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        const json = await res.json();

        if (!res.ok) {
          setSubmitError(json.error?.message || "Gagal memperbarui produk");
          setIsLoading(false);
          return;
        }

        savedProduct = json.data;
      }

      // Upload image if selected
      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);

        const imgRes = await fetch(`/api/products/${savedProduct._id}/image`, {
          method: "POST",
          body: formData,
        });

        const imgJson = await imgRes.json();

        if (!imgRes.ok) {
          setSubmitError(imgJson.error?.message || "Gagal mengunggah gambar");
          setIsLoading(false);
          return;
        }

        savedProduct = imgJson.data.product;
      }

      onSuccess(savedProduct, isNew);
    } catch (err) {
      console.error("ProductFormModal submit error:", err);
      setSubmitError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 id="modal-title" className="text-lg font-semibold text-gray-900">
            {isNew ? "Tambah Produk Baru" : "Edit Produk"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400"
            aria-label="Tutup modal"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="px-6 py-4 space-y-4">
          {/* Submit error */}
          {submitError && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            >
              {submitError}
            </div>
          )}

          {/* Name */}
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Nama Produk <span className="text-red-500">*</span>
            </label>
            <input
              ref={firstInputRef}
              id="name"
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              disabled={isLoading}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${
                errors.name ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
              placeholder="Contoh: Piston"
            />
            {errors.name && (
              <p id="name-error" className="mt-1 text-xs text-red-600">
                {errors.name}
              </p>
            )}
          </div>

          {/* SKU — only editable on create */}
          <div>
            <label
              htmlFor="sku"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              SKU <span className="text-red-500">*</span>
            </label>
            <input
              id="sku"
              name="sku"
              type="text"
              value={isNew ? form.sku : product.sku}
              onChange={isNew ? handleChange : undefined}
              disabled={!isNew || isLoading}
              aria-invalid={!!errors.sku}
              aria-describedby={errors.sku ? "sku-error" : undefined}
              className={`w-full rounded-lg border px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-50 ${
                errors.sku ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
              placeholder="Contoh: 13104-GN5-913"
            />
            {!isNew && (
              <p className="mt-1 text-xs text-gray-400">SKU tidak dapat diubah setelah produk dibuat</p>
            )}
            {errors.sku && (
              <p id="sku-error" className="mt-1 text-xs text-red-600">
                {errors.sku}
              </p>
            )}
          </div>

          {/* Price */}
          <div>
            <label
              htmlFor="price"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Harga (Rp) <span className="text-red-500">*</span>
            </label>
            <input
              id="price"
              name="price"
              type="number"
              min="0"
              step="1"
              value={form.price}
              onChange={handleChange}
              disabled={isLoading}
              aria-invalid={!!errors.price}
              aria-describedby={errors.price ? "price-error" : undefined}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${
                errors.price ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
              placeholder="Contoh: 25000"
            />
            {errors.price && (
              <p id="price-error" className="mt-1 text-xs text-red-600">
                {errors.price}
              </p>
            )}
          </div>

          {/* Stock */}
          <div>
            <label
              htmlFor="stock"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Stok Awal <span className="text-red-500">*</span>
            </label>
            <input
              id="stock"
              name="stock"
              type="number"
              min="0"
              step="1"
              value={form.stock}
              onChange={handleChange}
              disabled={isLoading}
              aria-invalid={!!errors.stock}
              aria-describedby={errors.stock ? "stock-error" : undefined}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${
                errors.stock ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
              placeholder="Contoh: 100"
            />
            {errors.stock && (
              <p id="stock-error" className="mt-1 text-xs text-red-600">
                {errors.stock}
              </p>
            )}
          </div>

          {/* Brand (Merk) */}
          <div>
            <label
              htmlFor="brand"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Merk <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <input
              id="brand"
              name="brand"
              type="text"
              value={form.brand}
              onChange={handleChange}
              disabled={isLoading}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              placeholder="Contoh: Honda, Yamaha, AHM"
            />
          </div>

          {/* Kategori */}
          <div>
            <label
              htmlFor="category"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Kategori <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <input
              id="category"
              name="category"
              type="text"
              list="category-suggestions"
              value={form.category}
              onChange={handleChange}
              disabled={isLoading}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              placeholder="Contoh: Oli & Pelumas, Filter, Busi"
            />
            <datalist id="category-suggestions">
              <option value="Oli & Pelumas" />
              <option value="Filter" />
              <option value="Busi" />
              <option value="Kampas Rem" />
              <option value="Rantai & Gear" />
              <option value="Ban" />
              <option value="Aki" />
              <option value="Seal & Packing" />
              <option value="Lampu" />
              <option value="Lain-lain" />
            </datalist>
          </div>

          {/* ── Asal Barang (hanya relevan saat tambah produk baru) ── */}
          {isNew && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">
                Asal Barang{" "}
                <span className="text-gray-400 font-normal">(opsional)</span>
              </p>

              {/* Dropdown supplier */}
              <div>
                <label htmlFor="supplierId" className="block text-xs font-medium text-gray-600 mb-1">
                  Supplier / Pemasok
                </label>
                {suppliersLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                    <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                    Memuat daftar supplier...
                  </div>
                ) : (
                  <select
                    id="supplierId"
                    value={selectedSupplierId}
                    onChange={(e) => {
                      setSelectedSupplierId(e.target.value);
                      if (e.target.value) setManualSupplierName("");
                    }}
                    disabled={isLoading}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50"
                  >
                    <option value="">— Pilih supplier —</option>
                    {suppliers.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}{s.contactName ? ` (${s.contactName})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Nama manual — muncul kalau tidak pilih dari dropdown */}
              {!selectedSupplierId && (
                <div>
                  <label htmlFor="manualSupplier" className="block text-xs font-medium text-gray-600 mb-1">
                    Atau ketik nama supplier
                  </label>
                  <input
                    id="manualSupplier"
                    type="text"
                    value={manualSupplierName}
                    onChange={(e) => setManualSupplierName(e.target.value)}
                    disabled={isLoading}
                    placeholder="Contoh: Toko Indoparts"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>
              )}

              {/* Harga beli per satuan */}
              <div>
                <label htmlFor="purchasePrice" className="block text-xs font-medium text-gray-600 mb-1">
                  Harga Beli per Satuan (Rp)
                </label>
                <input
                  id="purchasePrice"
                  name="purchasePrice"
                  type="number"
                  min="0"
                  step="1"
                  value={form.purchasePrice}
                  onChange={handleChange}
                  disabled={isLoading}
                  placeholder="Contoh: 15000"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Dicatat di riwayat stok sebagai referensi harga modal
                </p>
              </div>
            </div>
          )}

          {/* Aliases */}
          <div>            <label
              htmlFor="aliasInput"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Alias{" "}
              <span className="text-gray-400 font-normal">
                (opsional — nama lain yang sering disebut pelanggan)
              </span>
            </label>

            {/* Tag list */}
            {aliases.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {aliases.map((alias, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                  >
                    {alias}
                    <button
                      type="button"
                      onClick={() => handleRemoveAlias(idx)}
                      disabled={isLoading}
                      className="text-blue-500 hover:text-blue-800 leading-none focus:outline-none"
                      aria-label={`Hapus alias ${alias}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Alias input + tombol tambah */}
            <div className="flex gap-2">
              <input
                id="aliasInput"
                name="aliasInput"
                type="text"
                value={form.aliasInput}
                onChange={handleChange}
                onKeyDown={handleAliasKeyDown}
                disabled={isLoading}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                placeholder="Ketik alias lalu tekan Enter atau klik Tambah"
              />
              <button
                type="button"
                onClick={handleAddAlias}
                disabled={isLoading || !form.aliasInput.trim()}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-40 whitespace-nowrap"
              >
                + Tambah
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Contoh: &ldquo;ring piston&rdquo;, &ldquo;seher&rdquo;, &ldquo;klep&rdquo;
            </p>
          </div>

          {/* Image upload */}
          <div>
            <label
              htmlFor="image"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Gambar Produk
            </label>

            {/* Preview */}
            {imagePreview && (
              <div className="mb-2 relative inline-block">
                <img
                  src={imagePreview}
                  alt="Preview gambar produk"
                  className="h-24 w-24 rounded-lg object-cover border border-gray-200"
                />
                {imageConverting && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )}

            {/* Converting indicator */}
            {imageConverting && (
              <div className="mb-2 flex items-center gap-2 text-xs text-blue-600">
                <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Mengkonversi ke WebP...
              </div>
            )}

            {/* Compression info */}
            {imageInfo && !imageConverting && (
              <div className="mb-2 flex items-center gap-1.5 text-xs text-green-600">
                <span>✅</span>
                <span>{imageInfo}</span>
              </div>
            )}

            <input
              ref={fileInputRef}
              id="image"
              name="image"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              disabled={isLoading || imageConverting}
              aria-invalid={!!errors.image}
              aria-describedby={errors.image ? "image-error" : "image-hint"}
              className="w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
            />
            <p id="image-hint" className="mt-1 text-xs text-gray-400">
              Format apapun diterima — otomatis dikonversi ke WebP (maks. {MAX_IMAGE_SIZE_MB}MB)
            </p>
            {errors.image && (
              <p id="image-error" className="mt-1 text-xs text-red-600">
                {errors.image}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading || imageConverting}
              aria-busy={isLoading}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {imageConverting
                ? "Memproses gambar..."
                : isLoading
                ? "Menyimpan..."
                : isNew
                ? "Tambah Produk"
                : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
