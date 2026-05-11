"use client";

import { useEffect } from "react";

/**
 * Error boundary for the /owner route segment.
 */
export default function OwnerError({ error, reset }) {
  useEffect(() => {
    console.error("Owner page error:", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div
        role="alert"
        className="max-w-md w-full bg-white rounded-xl border border-red-200 p-8 text-center shadow-sm"
      >
        <span className="text-5xl mb-4 block" aria-hidden="true">⚠️</span>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Terjadi Kesalahan
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          {error?.message || "Halaman dashboard mengalami kesalahan yang tidak terduga."}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Coba Lagi
          </button>
          <a
            href="/owner/dashboard"
            className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Kembali ke Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
