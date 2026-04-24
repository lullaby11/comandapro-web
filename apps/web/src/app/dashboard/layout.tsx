'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  PlusCircle, Package, Users, Settings,
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
        <div className="sidebar-brand">
          <div className="sidebar-brand-inner">
            <img src="/olyda.png" alt="Olyda" style={{ height: 32, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
            <div className="sidebar-brand-name">
              {business.name ?? 'Mi local'}
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
                <span className="nav-label">{label}</span>
                {isActive && <span className="nav-chevron"><ChevronRight size={14} style={{ opacity: 0.5 }} /></span>}
              </Link>
            );
          })}
        </nav>

        {/* User / Logout */}
        <div className="sidebar-user">
          <div className="sidebar-user-inner">
            <div className="sidebar-avatar">
              {(user.name ?? 'U')[0].toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.name ?? 'Usuario'}
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'hsl(var(--muted))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.role ?? ''}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="sidebar-logout"
              onMouseOver={(e) => (e.currentTarget.style.color = 'hsl(0 84% 60%)')}
              onMouseOut={(e) => (e.currentTarget.style.color = 'hsl(var(--muted))')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="dashboard-main" style={{ flex: 1, overflowY: 'auto', background: 'hsl(var(--bg))' }}>
        {children}
      </main>
    </div>
  );
}
