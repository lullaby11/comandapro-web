import type { NextConfig } from "next";
import path from "path";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  output: "standalone",
  // Turbopack infiere mal la raíz del workspace en este monorepo y avisa en cada build.
  // Se fija explícitamente, y con ella `outputFileTracingRoot`: si solo se fija una de
  // las dos, Amplify establece la otra al raíz del repositorio y Next avisa de que deben
  // coincidir.
  turbopack: {
    root: path.resolve(__dirname),
  },
  outputFileTracingRoot: path.resolve(__dirname),
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
