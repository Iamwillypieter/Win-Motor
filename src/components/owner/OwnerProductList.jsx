"use client";

import { useState, useMemo } from "react";
import { formatRupiah } from "@/lib/utils";

const STOCK_THRESHOLD_LOW = 5;

/**
 * OwnerProductList — tabel produk toko untuk Owner.
 * Fitur: search nama, filter SKU, filter status stok, sort kolom.
 */
export default function OwnerProductList({ initialProducts = [] }) {
  const [search, setSearch] = useState("");
  const [skuFilter, setSkuFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("all"); // all | out | low | ok
  const [sortBy, setSortBy] = useState("name"); // name | stock | price
  const [sortDir, setSortDir] = useState("asc");

  const filtered = useMemo(() => {
    let list = [...initialProducts];

    // Filter nama
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    // Filter SKU
    if (skuFilter.trim()) {
      const q = skuFilter.trim().toLowerCase();
      list = list.filter((p) => p.sku.toLowerCase().includes(q));
    }

    // Filter stok
    if (stockFilter === "out") list = list.filter((p) => p.stock === 0);
    else if (stockFilter === "low") list = list.filter((p) => p.stock > 0 && p.stock <= STOCK_THRESHOLD_LOW);
    else if (stockFilter === "ok") list = list.filter((p) => p.stock > STOCK_THRESHOLD_LOW);

    // Sort
    list.sort((a, b) => {
      let va = a[sortBy];
      let vb = b[sortBy];
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [initialProducts, search, skuFilter, stockFilter, sortBy, sortDir]);

  function toggleSort(col) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }) {
    if (sortBy !== col) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-600 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  // Ringkasan stok
  const outOfStock = initialProducts.filter((p) => p.stock === 0).length;
  const lowStock = initialProducts.filter((p) => p.stock > 0 && p.stock <= STOCK_THRESHOLD_LOW).length;
  const totalStock = initialProducts.reduce((sum, p) => sum + p.stock, 0);

  return (
    <div className="space-y-4">
      {/* Ringkasan stok */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Produk</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{initialProducts.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Stok</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalStock.toLocaleString("id-ID")}</p>
        </div>
        <div
          className={`rounded-xl border p-4 cursor-pointer transition-colors ${
            outOfStock > 0
              ? "bg-red-50 border-red-200 hover:bg-red-100"
              : "bg-white border-gray-200"
          }`}
          onClick={() => setStockFilter(stockFilter === "out" ? "all" : "out")}
        >
          <p className="text-xs text-gray-500">Stok Habis</p>
          <p className={`text-2xl font-bold mt-1 ${outOfStock > 0 ? "text-red-600" : "text-gray-900"}`}>
            {outOfStock}
          </p>
          {outOfStock > 0 && <p className="text-xs text-red-500 mt-0.5">Klik untuk filter</p>}
        </div>
        <div
          className={`rounded-xl border p-4 cursor-pointer transition-colors ${
            lowStock > 0
              ? "bg-yellow-50 border-yellow-200 hover:bg-yellow-100"
              : "bg-white border-gray-200"
          }`}
          onClick={() => setStockFilter(stockFilter === "low" ? "all" : "low")}
        >
          <p className="text-xs text-gray-500">Hampir Habis (≤{STOCK_THRESHOLD_LOW})</p>
          <p className={`text-2xl font-bold mt-1 ${lowStock > 0 ? "text-yellow-600" : "text-gray-900"}`}>
            {lowStock}
          </p>
          {lowStock > 0 && <p className="text-xs text-yellow-600 mt-0.5">Klik untuk filter</p>}
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center">
        {/* Search nama */}
        <div className="relative flex-1 min-w-40">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama produk..."
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

        {/* Reset */}
        {(search || skuFilter || stockFilter !== "all") && (
          <button
            onClick={() => { setSearch(""); setSkuFilter(""); setStockFilter("all"); }}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Reset filter
          </button>
        )}

        <span className="text-xs text-gray-400 ml-auto">
          {filtered.length} dari {initialProducts.length} produk
        </span>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                  Sisa Stok <SortIcon col="stock" />
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
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

                      {/* Nama */}
                      <td className="px-4 py-3 font-medium text-gray-900">{product.name}</td>

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
                          isOut
                            ? "bg-red-100 text-red-700"
                            : isLow
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-green-100 text-green-700"
                        }`}>
                          {isOut ? "Habis" : isLow ? "Hampir Habis" : "Aman"}
                        </span>
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
            Menampilkan {filtered.length} dari {initialProducts.length} produk aktif
          </div>
        )}
      </div>
    </div>
  );
}
