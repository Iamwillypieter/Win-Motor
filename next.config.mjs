/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gambar produk disimpan di public/uploads/ (lokal) — tidak butuh remotePatterns
  images: {
    remotePatterns: [],
  },

  // Izinkan Server Actions dari origin lokal (IP LAN dan hostname .local via HTTPS proxy)
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "localhost:3443",
        "127.0.0.1:3000",
        "127.0.0.1:3443",
        "willy-pieter.local:3443",
        "willy-pieter:3443",
        // IP LAN yang umum dipakai router rumah/toko
        "192.168.1.1:3443",
        "192.168.3.77:3443",
      ],
    },
    serverComponentsExternalPackages: ["bcryptjs", "mongoose"],
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
            // camera=(self) diperlukan untuk fitur scan barcode (html5-qrcode).
            // microphone & geolocation tetap dimatikan karena tidak dipakai.
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
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
};

export default nextConfig;
