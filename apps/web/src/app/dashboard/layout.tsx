'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ShoppingBag, PlusCircle, Package, Users, Settings,
  LogOut, ChevronRight, ClipboardList,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard/orders/new', label: 'Nueva Comanda', icon: PlusCircle },
  { href: '/dashboard/orders', label: 'Pedidos', icon: ClipboardList },
  { href: '/dashboard/products', label: 'Productos', icon: Package },
  { href: '/dashboard/customers', label: 'Clientes', icon: Users },
  { href: '/dashboard/settings', label: 'Ajustes', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('business');
    localStorage.removeItem('user');
    router.push('/login');
  }

  // Get business name from localStorage (client-side safe)
  const business = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('business') ?? '{}')
    : {};
  const user = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('user') ?? '{}')
    : {};

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        {/* Brand */}
        <div
          style={{
            padding: '1.5rem 1.25rem 1rem',
            borderBottom: '1px solid hsl(222 30% 20%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'linear-gradient(135deg, hsl(262 83% 66%), hsl(262 83% 50%))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, boxShadow: '0 4px 12px hsl(262 83% 66% / 0.35)',
              }}
            >
              <ShoppingBag size={20} color="white" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.2 }}>
                Comanda<span style={{ color: 'hsl(262 83% 66%)' }}>Pro</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'hsl(220 18% 55%)', marginTop: 2 }}>
                {business.name ?? 'Mi local'}
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, paddingTop: '0.75rem', overflowY: 'auto' }}>
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = href === '/dashboard/orders/new'
              ? pathname === href
              : pathname.startsWith(href) && href !== '/dashboard/orders/new';

            return (
              <Link
                key={href}
                href={href}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                <span style={{ flex: 1 }}>{label}</span>
                {isActive && <ChevronRight size={14} style={{ opacity: 0.5 }} />}
              </Link>
            );
          })}
        </nav>

        {/* User / Logout */}
        <div
          style={{
            padding: '0.75rem',
            borderTop: '1px solid hsl(222 30% 20%)',
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.625rem 0.75rem', borderRadius: '0.625rem',
              background: 'hsl(222 47% 13%)',
            }}
          >
            <div
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'hsl(262 83% 66% / 0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8125rem', fontWeight: 700,
                color: 'hsl(262 83% 66%)',
                flexShrink: 0,
              }}
            >
              {(user.name ?? 'U')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.name ?? 'Usuario'}
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'hsl(220 18% 55%)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.role ?? ''}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'hsl(220 18% 55%)', padding: 4, borderRadius: 6,
                display: 'flex', alignItems: 'center',
                transition: 'color 0.15s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = 'hsl(0 84% 60%)')}
              onMouseOut={(e) => (e.currentTarget.style.color = 'hsl(220 18% 55%)')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={{ flex: 1, overflowY: 'auto', background: 'hsl(222 47% 8%)' }}>
        {children}
      </main>
    </div>
  );
}
