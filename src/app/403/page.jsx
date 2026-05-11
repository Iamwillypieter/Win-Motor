import Link from "next/link";

export const metadata = {
  title: "Akses Ditolak — POS System",
};

export default function ForbiddenPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <span className="text-8xl font-bold text-red-500" aria-hidden="true">
            403
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Akses Ditolak
        </h1>
        <p className="text-gray-600 mb-8">
          Anda tidak memiliki izin untuk mengakses halaman ini. Silakan hubungi
          administrator jika Anda merasa ini adalah kesalahan.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Kembali ke Halaman Masuk
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Halaman Utama
          </Link>
        </div>
      </div>
    </main>
  );
}
