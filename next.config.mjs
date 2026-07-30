/** @type {import('next').NextConfig} */
const nextConfig = {
  // Izinkan gambar dari domain eksternal jika diperlukan
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  // Pastikan bcryptjs dan mongoose berjalan di Node.js runtime (bukan Edge)
  // Next.js 14 menggunakan experimental.serverComponentsExternalPackages
  experimental: {
    serverComponentsExternalPackages: ["bcryptjs", "mongoose"],
  },

  webpack: (config, { dev }) => {
    if (dev) {
      // Nonaktifkan filesystem cache di development untuk menghindari
      // ENOENT rename error pada Windows (file locking issue)
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
