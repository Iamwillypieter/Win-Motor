"use client";

import { useState } from "react";
import { isValidWhatsapp } from "@/lib/validators";

/**
 * Daftar metode pembayaran yang tersedia untuk pesanan online.
 * Setiap entri memiliki kode, ikon emoji, dan label yang ditampilkan ke pelanggan.
 *
 * Requirements:
 * - 3.6: Tampilkan 6 metode pembayaran dengan ikon dan label yang jelas
 */
const PAYMENT_METHODS = [
  {
    value: "CASH",
    icon: "💵",
    label: "Bayar di Tempat (COD)",
    description: "Bayar tunai saat barang diterima",
  },
  {
    value: "QRIS",
    icon: "📱",
    label: "QRIS",
    description: "Bayar via QR Code standar Indonesia",
  },
  {
    value: "EWALLET_DANA",
    icon: "💙",
    label: "DANA",
    description: "Bayar via e-wallet DANA",
  },
  {
    value: "EWALLET_OVO",
    icon: "💜",
    label: "OVO",
    description: "Bayar via e-wallet OVO",
  },
  {
    value: "EWALLET_GOPAY",
    icon: "💚",
    label: "GoPay",
    description: "Bayar via e-wallet GoPay",
  },
  {
    value: "BANK_TRANSFER",
    icon: "🏦",
    label: "Transfer Bank",
    description: "Transfer ke rekening BCA / Mandiri / BNI / BRI",
  },
];

/**
 * CheckoutForm — formulir checkout untuk pesanan online.
 *
 * Menampilkan field: nama lengkap, nomor WhatsApp, alamat pengiriman,
 * dan pilihan metode pembayaran. Semua field divalidasi sebelum submit.
 *
 * Requirements:
 * - 3.1: Field nama lengkap, nomor WhatsApp aktif, alamat pengiriman lengkap
 * - 3.3: Validasi nama lengkap — tampilkan "Nama lengkap wajib diisi" jika kosong
 * - 3.4: Validasi WhatsApp — tampilkan "Nomor WhatsApp tidak valid" jika format salah
 * - 3.5: Validasi alamat — tampilkan "Alamat pengiriman wajib diisi" jika kosong
 * - 3.6: Tampilkan 6 metode pembayaran dengan ikon dan label yang jelas
 * - 3.7: Validasi metode pembayaran — tampilkan "Pilih metode pembayaran" jika belum dipilih
 *
 * @param {{ onSubmit: (formData: { customerName: string, customerWhatsapp: string, shippingAddress: string, paymentMethod: string }) => void, isLoading: boolean }} props
 */
export default function CheckoutForm({ onSubmit, isLoading }) {
  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  const [errors, setErrors] = useState({
    customerName: "",
    customerWhatsapp: "",
    shippingAddress: "",
    paymentMethod: "",
  });

  function validate() {
    const newErrors = {
      customerName: "",
      customerWhatsapp: "",
      shippingAddress: "",
      paymentMethod: "",
    };

    let isValid = true;

    if (!customerName.trim()) {
      newErrors.customerName = "Nama lengkap wajib diisi";
      isValid = false;
    }

    if (!isValidWhatsapp(customerWhatsapp)) {
      newErrors.customerWhatsapp = "Nomor WhatsApp tidak valid";
      isValid = false;
    }

    if (!shippingAddress.trim()) {
      newErrors.shippingAddress = "Alamat pengiriman wajib diisi";
      isValid = false;
    }

    if (!paymentMethod) {
      newErrors.paymentMethod = "Pilih metode pembayaran";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    onSubmit({
      customerName: customerName.trim(),
      customerWhatsapp: customerWhatsapp.trim(),
      shippingAddress: shippingAddress.trim(),
      paymentMethod,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Formulir checkout"
      className="space-y-6"
    >
      {/* ── Nama Lengkap ── */}
      <div className="space-y-1.5">
        <label
          htmlFor="customerName"
          className="block text-sm font-medium text-gray-700"
        >
          Nama Lengkap <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="customerName"
          type="text"
          value={customerName}
          onChange={(e) => {
            setCustomerName(e.target.value);
            if (errors.customerName) {
              setErrors((prev) => ({ ...prev, customerName: "" }));
            }
          }}
          placeholder="Contoh: Budi Santoso"
          autoComplete="name"
          aria-required="true"
          aria-invalid={!!errors.customerName}
          aria-describedby={errors.customerName ? "customerName-error" : undefined}
          disabled={isLoading}
          className={`w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed ${
            errors.customerName
              ? "border-red-400 bg-red-50 focus-visible:ring-red-400"
              : "border-gray-300 bg-white hover:border-gray-400"
          }`}
        />
        {errors.customerName && (
          <p id="customerName-error" role="alert" className="text-xs font-medium text-red-600">
            {errors.customerName}
          </p>
        )}
      </div>

      {/* ── Nomor WhatsApp ── */}
      <div className="space-y-1.5">
        <label
          htmlFor="customerWhatsapp"
          className="block text-sm font-medium text-gray-700"
        >
          Nomor WhatsApp Aktif <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="customerWhatsapp"
          type="tel"
          value={customerWhatsapp}
          onChange={(e) => {
            setCustomerWhatsapp(e.target.value);
            if (errors.customerWhatsapp) {
              setErrors((prev) => ({ ...prev, customerWhatsapp: "" }));
            }
          }}
          placeholder="Contoh: 081234567890 atau +6281234567890"
          autoComplete="tel"
          inputMode="tel"
          aria-required="true"
          aria-invalid={!!errors.customerWhatsapp}
          aria-describedby={
            errors.customerWhatsapp ? "customerWhatsapp-error" : "customerWhatsapp-hint"
          }
          disabled={isLoading}
          className={`w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed ${
            errors.customerWhatsapp
              ? "border-red-400 bg-red-50 focus-visible:ring-red-400"
              : "border-gray-300 bg-white hover:border-gray-400"
          }`}
        />
        {errors.customerWhatsapp ? (
          <p id="customerWhatsapp-error" role="alert" className="text-xs font-medium text-red-600">
            {errors.customerWhatsapp}
          </p>
        ) : (
          <p id="customerWhatsapp-hint" className="text-xs text-gray-500">
            Format: 08xxxxxxxxxx atau +62xxxxxxxxxx (10–15 digit)
          </p>
        )}
      </div>

      {/* ── Alamat Pengiriman ── */}
      <div className="space-y-1.5">
        <label
          htmlFor="shippingAddress"
          className="block text-sm font-medium text-gray-700"
        >
          Alamat Pengiriman Lengkap <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <textarea
          id="shippingAddress"
          value={shippingAddress}
          onChange={(e) => {
            setShippingAddress(e.target.value);
            if (errors.shippingAddress) {
              setErrors((prev) => ({ ...prev, shippingAddress: "" }));
            }
          }}
          placeholder="Contoh: Jl. Merdeka No. 1, RT 01/RW 02, Kelurahan Gambir, Jakarta Pusat 10110"
          rows={3}
          autoComplete="street-address"
          aria-required="true"
          aria-invalid={!!errors.shippingAddress}
          aria-describedby={errors.shippingAddress ? "shippingAddress-error" : undefined}
          disabled={isLoading}
          className={`w-full resize-none rounded-lg border px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed ${
            errors.shippingAddress
              ? "border-red-400 bg-red-50 focus-visible:ring-red-400"
              : "border-gray-300 bg-white hover:border-gray-400"
          }`}
        />
        {errors.shippingAddress && (
          <p id="shippingAddress-error" role="alert" className="text-xs font-medium text-red-600">
            {errors.shippingAddress}
          </p>
        )}
      </div>

      {/* ── Metode Pembayaran ── */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">
          Metode Pembayaran <span className="text-red-500" aria-hidden="true">*</span>
        </legend>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PAYMENT_METHODS.map((method) => {
            const isSelected = paymentMethod === method.value;
            return (
              <label
                key={method.value}
                className={`relative flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5 transition-all select-none ${
                  isLoading ? "cursor-not-allowed opacity-60" : ""
                } ${
                  isSelected
                    ? "border-blue-500 bg-blue-50"
                    : errors.paymentMethod
                    ? "border-red-300 bg-white hover:border-red-400"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={method.value}
                  checked={isSelected}
                  onChange={() => {
                    setPaymentMethod(method.value);
                    if (errors.paymentMethod) {
                      setErrors((prev) => ({ ...prev, paymentMethod: "" }));
                    }
                  }}
                  disabled={isLoading}
                  className="sr-only"
                />

                <span
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white text-xl shadow-sm border border-gray-100"
                  aria-hidden="true"
                >
                  {method.icon}
                </span>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold leading-tight ${isSelected ? "text-blue-700" : "text-gray-900"}`}>
                    {method.label}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 leading-snug">
                    {method.description}
                  </p>
                </div>

                {isSelected && (
                  <span
                    className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500"
                    aria-hidden="true"
                  >
                    <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M10.28 2.28a.75.75 0 0 0-1.06 0L4.5 7 2.78 5.28a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l5.25-5.25a.75.75 0 0 0 0-1.06Z" />
                    </svg>
                  </span>
                )}
              </label>
            );
          })}
        </div>

        {errors.paymentMethod && (
          <p role="alert" className="text-xs font-medium text-red-600">
            {errors.paymentMethod}
          </p>
        )}
      </fieldset>

      {/* ── Tombol Submit ── */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        aria-busy={isLoading}
      >
        {isLoading ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Memproses Pesanan...
          </>
        ) : (
          "Buat Pesanan"
        )}
      </button>
    </form>
  );
}
