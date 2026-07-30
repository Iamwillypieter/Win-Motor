"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import useOnlineCart from "@/hooks/useOnlineCart";
import CheckoutForm from "@/components/store/CheckoutForm";
import PaymentStep from "@/components/store/PaymentStep";
import { formatRupiah } from "@/lib/utils";

/**
 * CheckoutPage — halaman checkout multi-step untuk pesanan online.
 *
 * Step 1: Isi data diri (nama, WA, alamat) + pilih metode pembayaran
 * Step 2: Halaman pembayaran — instruksi + timer + tombol konfirmasi sudah bayar
 *
 * Pesanan dibuat di DB saat pelanggan submit Step 1.
 * Gudang menerima pesanan dengan paymentStatus "pending" sampai pelanggan konfirmasi.
 */
export default function CheckoutPage() {
  const router = useRouter();
  const items = useOnlineCart((state) => state.items);
  const totalAmount = useOnlineCart((state) => state.totalAmount);
  const clearCart = useOnlineCart((state) => state.clearCart);

  // step: "form" | "payment"
  const [step, setStep] = useState("form");
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  // Data pesanan yang sudah dibuat (setelah step 1 berhasil)
  const [createdOrder, setCreatedOrder] = useState(null);

  // Redirect ke katalog jika keranjang kosong
  useEffect(() => {
    if (items.length === 0 && step === "form") {
      router.replace("/store");
    }
  }, [items, router, step]);

  // ── Step 1: Submit form → buat pesanan ──────────────────────────────────

  async function handleFormSubmit(formData) {
    setIsLoading(true);
    setApiError("");

    try {
      const payload = {
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        customerName: formData.customerName,
        customerWhatsapp: formData.customerWhatsapp,
        shippingAddress: formData.shippingAddress,
        paymentMethod: formData.paymentMethod,
      };

      const res = await fetch("/api/store/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setApiError(
          json?.error?.message || "Terjadi kesalahan. Silakan coba lagi."
        );
        return;
      }

      // Pesanan berhasil dibuat — simpan data dan pindah ke step pembayaran
      setCreatedOrder(json.data);
      clearCart();
      setStep("payment");
      // Scroll ke atas agar step pembayaran terlihat
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setApiError("Gagal terhubung ke server. Periksa koneksi internet Anda.");
    } finally {
      setIsLoading(false);
    }
  }

  // ── Step 2: Selesai — redirect ke halaman order ──────────────────────────

  const handlePaymentDone = useCallback((invoiceNumber) => {
    router.push(`/store/order/${invoiceNumber}`);
  }, [router]);

  // Loading state sementara redirect
  if (items.length === 0 && step === "form") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-gray-500">Mengalihkan ke katalog...</p>
      </div>
    );
  }

  // ── Step 2: Halaman pembayaran ───────────────────────────────────────────

  if (step === "payment" && createdOrder) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6">
        {/* Step indicator */}
        <StepIndicator current={2} />

        <PaymentStep
          order={createdOrder}
          onDone={handlePaymentDone}
        />
      </div>
    );
  }

  // ── Step 1: Form checkout ────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      {/* Step indicator */}
      <StepIndicator current={1} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start mt-8">
        {/* Ringkasan Keranjang */}
        <section aria-labelledby="cart-summary-heading">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 id="cart-summary-heading" className="text-base font-semibold text-gray-900">
                Ringkasan Pesanan
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">{items.length} jenis produk</p>
            </div>

            <ul className="divide-y divide-gray-100" role="list">
              {items.map((item) => (
                <li key={item.productId} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 border border-gray-200">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xl text-gray-300" aria-hidden="true">📦</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatRupiah(item.price)} × {item.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 flex-shrink-0">
                    {formatRupiah(item.price * item.quantity)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Total Pembayaran</span>
                <span className="text-base font-bold text-gray-900">{formatRupiah(totalAmount)}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/store")}
            disabled={isLoading}
            className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50 transition-colors"
          >
            ← Kembali ke Katalog
          </button>
        </section>

        {/* Formulir Checkout */}
        <section aria-labelledby="checkout-form-heading">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 id="checkout-form-heading" className="text-base font-semibold text-gray-900">
                Data Pemesanan
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Isi data diri dan pilih metode pembayaran
              </p>
            </div>

            <div className="px-5 py-5">
              {apiError && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
                >
                  <span className="mt-0.5 flex-shrink-0 text-red-500" aria-hidden="true">⚠️</span>
                  <p className="text-sm font-medium text-red-700">{apiError}</p>
                </div>
              )}
              <CheckoutForm onSubmit={handleFormSubmit} isLoading={isLoading} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Step Indicator ────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Data & Metode Bayar" },
  { n: 2, label: "Pembayaran" },
  { n: 3, label: "Selesai" },
];

function StepIndicator({ current }) {
  return (
    <nav aria-label="Langkah checkout">
      <ol className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const isDone = step.n < current;
          const isActive = step.n === current;
          return (
            <li key={step.n} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold border-2 transition-all ${
                  isDone
                    ? "bg-blue-600 border-blue-600 text-white"
                    : isActive
                    ? "bg-white border-blue-600 text-blue-600"
                    : "bg-white border-gray-300 text-gray-400"
                }`}>
                  {isDone ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : step.n}
                </div>
                <span className={`mt-1.5 text-xs font-medium text-center leading-tight ${
                  isActive ? "text-blue-600" : isDone ? "text-blue-500" : "text-gray-400"
                }`}>
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1 mb-5 rounded ${
                  step.n < current ? "bg-blue-600" : "bg-gray-200"
                }`} aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
