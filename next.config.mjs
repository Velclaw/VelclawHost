const apiOrigin = (
  process.env.VELCLAWHOST_API_ORIGIN || "https://velclawhost.onrender.com"
).replace(/\/+$/, "");

const nextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        // Auth.js routes must stay in Next.js. Only proxy non-auth API paths
        // to the existing VelclawHost control-plane service.
        source: "/api/:path((?!auth(?:/|$)).*)",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
