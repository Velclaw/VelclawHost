const apiOrigin = (
  process.env.VELCLAWHOST_API_ORIGIN || "https://velclawhost.onrender.com"
).replace(/\/+$/, "");

const nextConfig = {
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
