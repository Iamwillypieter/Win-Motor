/** @type {import('next').NextConfig} */
const nextConfig = {
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
