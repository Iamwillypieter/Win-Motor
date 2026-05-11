"use client";

import { useState, useRef, useEffect } from "react";
import { MAX_IMAGE_SIZE_MB, ALLOWED_IMAGE_EXTENSIONS } from "@/types/product.types";

/**
 * ProductFormModal — modal form for creating or editing a product.
 * Handles text fields and image upload with client-side validation.
 *
 * @param {{
 *   product: Object|null,
 *   onSuccess: (product: Object, isNew: boolean) => void,
 *   onClose: () => void
 * }} props
 */
export default function ProductFormModal({ product, onSuccess, onClose }) {
  const isNew = !product;

  const [form, setForm] = useState({
    name: product?.name || "",
    sku: product?.sku || "",
    price: product?.price !== undefined ? String(product.price) : "",
    stock: product?.stock !== undefined ? String(product.stock) : "",
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(product?.imageUrl || null);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fileInputRef = useRef(null);
  const firstInputRef = useRef(null);

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

  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedMimes.includes(file.type)) {
      setErrors((prev) => ({
        ...prev,
        image: `Format gambar tidak didukung. Gunakan JPG, PNG, atau WEBP`,
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
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
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
        // Create product
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            sku: form.sku.trim().toUpperCase(),
            price: Number(form.price),
            stock: Number(form.stock),
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
              placeholder="Contoh: Kopi Arabika"
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
              placeholder="Contoh: KOP-001"
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
              <div className="mb-2">
                <img
                  src={imagePreview}
                  alt="Preview gambar produk"
                  className="h-24 w-24 rounded-lg object-cover border border-gray-200"
                />
              </div>
            )}

            <input
              ref={fileInputRef}
              id="image"
              name="image"
              type="file"
              accept={ALLOWED_IMAGE_EXTENSIONS.join(",")}
              onChange={handleImageChange}
              disabled={isLoading}
              aria-invalid={!!errors.image}
              aria-describedby={errors.image ? "image-error" : "image-hint"}
              className="w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
            />
            <p id="image-hint" className="mt-1 text-xs text-gray-400">
              Format: JPG, PNG, WEBP — Maks. {MAX_IMAGE_SIZE_MB}MB
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
              disabled={isLoading}
              aria-busy={isLoading}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isLoading
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
