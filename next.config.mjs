/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gambar produk disimpan di public/uploads/ (lokal) — tidak butuh remotePatterns
  // Jika nanti pakai Cloudinary atau CDN, tambahkan hostname spesifik di sini, bukan wildcard
  images: {
    remotePatterns: [],
  },

  // Security headers untuk semua response
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Cegah halaman dimuat di dalam iframe (clickjacking)
          { key: "X-Frame-Options", value: "DENY" },
          // Cegah browser menebak tipe konten (MIME sniffing)
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Batasi informasi Referer yang dikirim ke domain lain
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nonaktifkan fitur browser yang tidak digunakan aplikasi ini
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // Paksa HTTPS untuk semua koneksi selama 1 tahun (aktif di production)
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // Content Security Policy — batasi sumber resource yang boleh dimuat
          // 'unsafe-inline' diperlukan untuk Tailwind CSS dan komponen React
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval diperlukan Next.js dev mode
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  // Pastikan bcryptjs dan mongoose berjalan di Node.js runtime (bukan Edge)
  experimental: {
    serverComponentsExternalPackages: ["bcryptjs", "mongoose"],
  },
};

export default nextConfig;
