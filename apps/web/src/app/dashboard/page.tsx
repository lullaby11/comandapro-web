'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShoppingBag, Users, Package, TrendingUp,
  PlusCircle, ArrowRight, Clock, CheckCircle2, ChefHat,
} from 'lucide-react';
import toast from 'react-hot-toast';

const API = '';

function apiHeaders() {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

interface DashboardStats {
  todayOrders: number;
  todayRevenue: number;
  pendingOrders: number;
  preparingOrders: number;
  readyOrders: number;
  totalCustomers: number;
  outOfStock: number;
  recentOrders: Array<{
    id: string;
    status: string;
    total: number;
    createdAt: string;
    customer: { name: string };
  }>;
}

export default function DashboardPage() {
  const [stats, setStats]   = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [business, setBusiness] = useState<{ name: string } | null>(null);
  const [user, setUser] = useState<{ name: string } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBusiness(JSON.parse(localStorage.getItem('business') ?? 'null'));
      setUser(JSON.parse(localStorage.getItem('user') ?? 'null'));
    }

    async function loadStats() {
      try {
        const [ordersRes, customersRes, productsRes] = await Promise.all([
          fetch(`${API}/api/orders?limit=5`, { headers: apiHeaders() }),
          fetch(`${API}/api/customers?limit=1`, { headers: apiHeaders() }),
          fetch(`${API}/api/products?active=true`, { headers: apiHeaders() }),
        ]);

        if (!ordersRes.ok || !customersRes.ok || !productsRes.ok) return;

        const ordersData      = await ordersRes.json();
        const customersData   = await customersRes.json();
        const productsData: Array<{ stock: number }> = await productsRes.json();

        const today = new Date().toDateString();
        const todayOrders   = ordersData.orders.filter((o: { createdAt: string }) => new Date(o.createdAt).toDateString() === today);
        const todayRevenue  = todayOrders.reduce((s: number, o: { total: number }) => s + Number(o.total), 0);

        setStats({
          todayOrders: todayOrders.length,
          todayRevenue,
          pendingOrders:   ordersData.orders.filter((o: { status: string }) => o.status === 'PENDING').length,
          preparingOrders: ordersData.orders.filter((o: { status: string }) => o.status === 'PREPARING').length,
          readyOrders:     ordersData.orders.filter((o: { status: string }) => o.status === 'READY').length,
          totalCustomers:  customersData.total,
          outOfStock:      productsData.filter((p) => p.stock === 0).length,
          recentOrders:    ordersData.orders.slice(0, 5),
        });
      } catch {
        toast.error('Error cargando métricas');
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 13 ? '¡Buenos días' : hour < 20 ? '¡Buenas tardes' : '¡Buenas noches';

  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'PENDING':   return <Clock size={14} style={{ color: 'hsl(38 95% 56%)' }} />;
      case 'PREPARING': return <ChefHat size={14} style={{ color: 'hsl(262 83% 66%)' }} />;
      case 'READY':     return <CheckCircle2 size={14} style={{ color: 'hsl(142 71% 45%)' }} />;
      default: return null;
    }
  };

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      {/* Greeting */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>
          {greeting}, {user?.name?.split(' ')[0] ?? 'usuario'}! 👋
        </h1>
        <p style={{ color: 'hsl(220 18% 65%)' }}>
          {business?.name} · {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Quick action */}
      <Link
        href="/dashboard/orders/new"
        className="card"
        style={{
          display: 'flex', alignItems: 'center', gap: '1.25rem',
          padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, hsl(262 83% 20%), hsl(262 83% 15%))',
          border: '1px solid hsl(262 83% 40% / 0.4)',
          textDecoration: 'none', cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        id="quick-new-order"
      >
        <div
          style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, hsl(262 83% 66%), hsl(262 83% 50%))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 20px hsl(262 83% 66% / 0.4)', flexShrink: 0,
          }}
        >
          <PlusCircle size={26} color="white" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: '1.0625rem', marginBottom: '0.2rem' }}>Nueva comanda</div>
          <div style={{ color: 'hsl(262 83% 75%)', fontSize: '0.875rem' }}>Empieza un pedido en menos de 30 segundos</div>
        </div>
        <ArrowRight size={22} style={{ color: 'hsl(262 83% 66%)' }} />
      </Link>

      {/* Stats grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.875rem', marginBottom: '1.5rem' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: 100, borderRadius: 12, background: 'hsl(222 40% 13%)', animation: 'pulse 1.5s infinite', animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
      ) : stats && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.875rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Pedidos hoy',     value: stats.todayOrders,    icon: ShoppingBag, color: 'hsl(262 83% 66%)', suffix: '' },
              { label: 'Ingresos hoy',    value: stats.todayRevenue,   icon: TrendingUp,  color: 'hsl(142 71% 45%)', suffix: ' €', isPrice: true },
              { label: 'Clientes',        value: stats.totalCustomers, icon: Users,       color: 'hsl(38 95% 56%)',  suffix: '' },
              { label: 'Sin stock',       value: stats.outOfStock,     icon: Package,     color: stats.outOfStock > 0 ? 'hsl(0 84% 60%)' : 'hsl(142 71% 45%)', suffix: '' },
            ].map(({ label, value, icon: Icon, color, isPrice }) => (
              <div key={label} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={18} style={{ color }} />
                  </div>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, lineHeight: 1, color }}>
                  {isPrice ? value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : value}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'hsl(220 18% 55%)', marginTop: '0.375rem' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Active orders summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginBottom: '1.5rem' }}>
            {/* Status summary */}
            <div className="card">
              <h2 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.9375rem' }}>Estado en vivo</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                  { label: 'Pendientes',  count: stats.pendingOrders,   color: 'hsl(38 95% 56%)',  Icon: Clock },
                  { label: 'Preparando', count: stats.preparingOrders, color: 'hsl(262 83% 66%)', Icon: ChefHat },
                  { label: 'Listos',     count: stats.readyOrders,     color: 'hsl(142 71% 45%)', Icon: CheckCircle2 },
                ].map(({ label, count, color, Icon }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                      <Icon size={14} style={{ color }} />
                      <span style={{ color: 'hsl(220 18% 70%)' }}>{label}</span>
                    </div>
                    <span
                      style={{
                        fontWeight: 700, fontSize: '1rem',
                        color: count > 0 ? color : 'hsl(220 18% 40%)',
                      }}
                    >
                      {count}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                href="/dashboard/orders"
                className="btn btn-ghost btn-sm"
                style={{ marginTop: '1.25rem', width: '100%', justifyContent: 'center' }}
                id="view-all-orders"
              >
                Ver todos <ArrowRight size={13} />
              </Link>
            </div>

            {/* Recent orders */}
            <div className="card">
              <h2 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.9375rem' }}>Últimos pedidos</h2>
              {stats.recentOrders.length === 0 ? (
                <p style={{ color: 'hsl(220 18% 50%)', fontSize: '0.875rem', textAlign: 'center', padding: '1.5rem 0' }}>
                  Aún no hay pedidos hoy.{' '}
                  <Link href="/dashboard/orders/new" style={{ color: 'hsl(262 83% 66%)', fontWeight: 600 }}>
                    Crear el primero
                  </Link>
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {stats.recentOrders.map((o) => (
                    <div
                      key={o.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.625rem 0', borderBottom: '1px solid hsl(222 30% 18%)',
                      }}
                    >
                      <StatusIcon status={o.status} />
                      <span style={{ flex: 1, fontWeight: 600, fontSize: '0.875rem' }}>
                        #{o.id.slice(-8).toUpperCase()}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'hsl(220 18% 60%)' }}>{o.customer.name}</span>
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'hsl(262 83% 70%)' }}>
                        {Number(o.total).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Quick navigation */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.875rem' }}>
        {[
          { href: '/dashboard/products', label: 'Gestionar productos', desc: 'Actualizar precios y stock', icon: Package, color: 'hsl(38 95% 56%)' },
          { href: '/dashboard/customers', label: 'Ver clientes', desc: 'Historial y datos de contacto', icon: Users, color: 'hsl(142 71% 45%)' },
          { href: '/dashboard/settings', label: 'Configuración', desc: 'Impresora, papel, moneda', icon: ShoppingBag, color: 'hsl(262 83% 66%)' },
        ].map(({ href, label, desc, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            className="card"
            style={{ textDecoration: 'none', transition: 'all 0.15s', display: 'block' }}
            id={`quick-${href.split('/').pop()}`}
          >
            <div style={{ width: 36, height: 36, borderRadius: 9, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <Icon size={18} style={{ color }} />
            </div>
            <div style={{ fontWeight: 700, marginBottom: '0.2rem', fontSize: '0.9375rem' }}>{label}</div>
            <div style={{ color: 'hsl(220 18% 55%)', fontSize: '0.8125rem' }}>{desc}</div>
          </Link>
        ))}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }`}</style>
    </div>
  );
}
