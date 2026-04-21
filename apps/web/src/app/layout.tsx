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
  title: 'ComandaPro — Sistema de Pedidos a Domicilio',
  description:
    'Gestiona pedidos, stock e impresión térmica de comandas en tiempo real para tu local de comida a domicilio.',
  keywords: ['comandas', 'pedidos', 'domicilio', 'impresión térmica', 'restaurante'],
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
              background: 'hsl(222 47% 15%)',
              color: 'hsl(220 30% 96%)',
              border: '1px solid hsl(222 30% 22%)',
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
