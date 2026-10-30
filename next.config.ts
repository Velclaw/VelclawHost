import type { NextConfig } from "next";

const apiOrigin = (
  process.env.VELCLAWHOST_API_ORIGIN || "https://velclawhost.onrender.com"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
