import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  output: "standalone",
  // NO fijar aquí `turbopack.root` ni `outputFileTracingRoot` apuntando a apps/web.
  //
  // La raíz del workspace es el repositorio, no esta app: con npm workspaces, buena parte
  // de las dependencias vive hoisted en el node_modules de la raíz. Apuntando el rastreo
  // a apps/web, Next deja fuera esos módulos y el build de Amplify muere con
  // "Cannot find module 'picocolors'" desde el postcss que empaqueta Next.
  //
  // Se deja que Next lo infiera, que es lo que hacía la última versión que se desplegó
  // con éxito. A cambio, en local avisa de que ha tenido que deducir la raíz: es ruido
  // inofensivo y preferible a romper el despliegue.
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
