"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useOnlineCart from "@/hooks/useOnlineCart";
import CheckoutForm from "@/components/store/CheckoutForm";
import { formatRupiah } from "@/lib/utils";

/**
 * CheckoutPage — halaman checkout untuk pesanan online.
 *
 * Client Component yang:
 * - Redirect ke /store jika keranjang kosong (Req 3.2)
 * - Menampilkan ringkasan keranjang (item + total)
 * - Menampilkan CheckoutForm untuk data pelanggan
 * - Submit ke POST /api/store/orders (Req 4.1)
 * - Menampilkan error stok tidak mencukupi (Req 4.4)
 * - Redirect ke /store/order/[invoiceNumber] setelah berhasil (Req 5.1)
 */
export default function CheckoutPage() {
  const router = useRouter();
  const items = useOnlineCart((state) => state.items);
  const totalAmount = useOnlineCart((state) => state.totalAmount);
  const clearCart = useOnlineCart((state) => state.clearCart);

  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  // Req 3.2: Redirect ke /store jika keranjang kosong
  useEffect(() => {
    if (items.length === 0) {
      router.replace("/store");
    }
  }, [items, router]);

  async function handleSubmit(formData) {
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
        const message =
          json?.error?.message ||
          json?.message ||
          "Terjadi kesalahan. Silakan coba lagi.";
        setApiError(message);
        return;
      }

      // Req 5.1: Redirect ke /store/order/[invoiceNumber] setelah berhasil
      const invoiceNumber = json?.data?.invoiceNumber;
      if (!invoiceNumber) {
        setApiError("Pesanan berhasil dibuat, tetapi nomor invoice tidak ditemukan.");
        return;
      }

      clearCart();
      router.push(`/store/order/${invoiceNumber}`);
    } catch {
      setApiError("Gagal terhubung ke server. Periksa koneksi internet Anda.");
    } finally {
      setIsLoading(false);
    }
  }

  // Tampilkan loading sementara saat redirect (keranjang kosong)
  if (items.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-gray-500">Mengalihkan ke katalog...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-xl font-bold text-gray-900 mb-8">Checkout</h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
        {/* ── Ringkasan Keranjang ── */}
        <section aria-labelledby="cart-summary-heading">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 id="cart-summary-heading" className="text-base font-semibold text-gray-900">
                Ringkasan Pesanan
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {items.length} jenis produk
              </p>
            </div>

            <ul className="divide-y divide-gray-100" role="list">
              {items.map((item) => (
                <li key={item.productId} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 border border-gray-200">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xl text-gray-300" aria-hidden="true">
                        📦
                      </div>
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
                <span className="text-base font-bold text-gray-900">
                  {formatRupiah(totalAmount)}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/store")}
            disabled={isLoading}
            className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            ← Kembali ke Katalog
          </button>
        </section>

        {/* ── Formulir Checkout ── */}
        <section aria-labelledby="checkout-form-heading">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 id="checkout-form-heading" className="text-base font-semibold text-gray-900">
                Data Pengiriman
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

              <CheckoutForm onSubmit={handleSubmit} isLoading={isLoading} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
