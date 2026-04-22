/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: { buildActivity: false },
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};
module.exports = nextConfig;
