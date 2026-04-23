import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Olyda — Gestión de Pedidos',
  description:
    'Gestiona pedidos, productos e impresión térmica en tiempo real para tu negocio de comida a domicilio.',
  keywords: ['pedidos', 'domicilio', 'comandas', 'restaurante', 'gestión'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'hsl(207 75% 11%)',
              color: 'hsl(0 0% 98%)',
              border: '1px solid hsl(207 40% 22%)',
              borderRadius: '0.75rem',
              fontSize: '0.9rem',
            },
            success: {
              iconTheme: { primary: 'hsl(142 71% 45%)', secondary: 'white' },
            },
            error: {
              iconTheme: { primary: 'hsl(0 84% 60%)', secondary: 'white' },
            },
          }}
        />
      </body>
    </html>
  );
}
