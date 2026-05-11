"use client";

import { useState, useCallback, useTransition } from "react";
import { formatRupiah } from "@/lib/utils";
import { deleteProductAction } from "@/server/actions/product.actions";
import ProductFormModal from "./ProductFormModal";

/**
 * ProductTable — displays the product inventory with search, SKU filter,
 * and actions to add, edit, or soft-delete products.
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

  // Client-side filtering (server already returns active products;
  // additional filtering is applied here for instant UX)
  const filtered = products.filter((p) => {
    const matchesSearch =
      !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchesSku =
      !skuFilter || p.sku.toLowerCase().includes(skuFilter.toLowerCase());
    return matchesSearch && matchesSku;
  });

  /** Refresh product list from the API */
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

  /** Open modal for creating a new product */
  function handleAddProduct() {
    setEditingProduct(null);
    setIsModalOpen(true);
  }

  /** Open modal for editing an existing product */
  function handleEditProduct(product) {
    setEditingProduct(product);
    setIsModalOpen(true);
  }

  /** Soft-delete a product after confirmation */
  function handleDeleteProduct(product) {
    if (
      !window.confirm(
        `Hapus produk "${product.name}"? Produk tidak akan muncul di katalog, namun data historis tetap terjaga.`
      )
    ) {
      return;
    }

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

  /** Called when modal saves successfully */
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

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1">
          {/* Name search */}
          <input
            type="text"
            placeholder="Cari nama produk..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-56"
            aria-label="Cari nama produk"
          />
          {/* SKU filter */}
          <input
            type="text"
            placeholder="Filter SKU..."
            value={skuFilter}
            onChange={(e) => setSkuFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-40"
            aria-label="Filter SKU"
          />
        </div>

        <button
          onClick={handleAddProduct}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap"
        >
          + Tambah Produk
        </button>
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
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Gambar
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Nama Produk
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                SKU
              </th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">
                Harga
              </th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">
                Stok
              </th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-gray-400"
                >
                  {products.length === 0
                    ? "Belum ada produk. Klik \"+ Tambah Produk\" untuk memulai."
                    : "Tidak ada produk yang cocok dengan filter."}
                </td>
              </tr>
            ) : (
              filtered.map((product) => (
                <tr
                  key={product._id}
                  className="hover:bg-gray-50 transition-colors"
                >
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
                  </td>

                  {/* SKU */}
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {product.sku}
                  </td>

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

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <ProductFormModal
          product={editingProduct}
          onSuccess={handleModalSuccess}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}
