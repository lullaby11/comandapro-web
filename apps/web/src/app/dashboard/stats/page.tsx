'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BarChart2, TrendingUp, Package, Users, Clock, Search,
  Truck, Store, ChevronDown, ChevronUp, Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';

const API = '';
const EUR = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const NUM = (n: number) => n.toLocaleString('es-ES');

function apiHeaders() {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceSummary {
  id: string; startedAt: string; endedAt: string | null;
  orderCount: number; totalRevenue: number;
}
interface TopProduct { productId: string; name: string; totalQty: number; totalRevenue: number }
interface ServiceStats {
  service: ServiceSummary;
  summary: { totalRevenue: number; totalOrders: number; deliveries: number; pickups: number };
  topProducts: TopProduct[];
}

interface Customer { id: string; name: string; phone: string; address?: string }
interface OrderRow {
  id: string; total: number; createdAt: string; isPickup: boolean;
  paymentMethod: string | null;
  items: Array<{ quantity: number; product: { name: string } }>;
  service?: { startedAt: string } | null;
}
interface CustomerStats {
  customer: Customer;
  summary: { totalOrders: number; totalSpent: number; avgTicket: number };
  ordersByPrice: OrderRow[];
  ordersByDate: OrderRow[];
}

interface Product { id: string; name: string; price: number; category?: string | null }
interface ProductStats {
  product: Product;
  summary: { totalSold: number; totalRevenue: number };
  topCustomers: Array<{ customerId: string; name: string; phone: string; totalQty: number; totalSpent: number }>;
}

interface CategoryItem {
  category: string; totalSold: number; totalRevenue: number;
  topProducts: Array<{ name: string; totalQty: number; totalRevenue: number }>;
}

interface PeriodRow { period: string; revenue: number; orders: number; deliveries: number; pickups: number }
interface PeriodStats {
  groupBy: string; from: string; to: string;
  data: PeriodRow[];
  topProducts: TopProduct[];
}

// ── Shared UI components ──────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card" style={{ padding: '1.25rem 1.5rem', minWidth: 160, flex: 1 }}>
      <div style={{ fontSize: '0.75rem', color: 'hsl(var(--muted))', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: color ?? 'hsl(var(--primary))' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'hsl(var(--muted))', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}

function ProductsTable({ products }: { products: TopProduct[] }) {
  if (!products.length) return <p style={{ color: 'hsl(var(--muted))', fontSize: '0.875rem' }}>Sin datos</p>;
  const maxQty = Math.max(...products.map((p) => p.totalQty), 1);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
            <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>#</th>
            <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Producto</th>
            <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Uds</th>
            <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Recaudado</th>
            <th style={{ padding: '0.5rem 0.75rem', width: 120 }} />
          </tr>
        </thead>
        <tbody>
          {products.map((p, i) => (
            <tr key={p.productId} style={{ borderBottom: '1px solid hsl(var(--border) / 0.4)' }}>
              <td style={{ padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 700 }}>{i + 1}</td>
              <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{p.name}</td>
              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700 }}>{NUM(p.totalQty)}</td>
              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'hsl(var(--primary))', fontWeight: 700 }}>{EUR(p.totalRevenue)}</td>
              <td style={{ padding: '0.5rem 0.75rem' }}>
                <div style={{ background: 'hsl(var(--primary) / 0.15)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                  <div style={{ background: 'hsl(var(--primary))', height: '100%', width: `${(p.totalQty / maxQty) * 100}%`, borderRadius: 4, transition: 'width 0.4s' }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab: Servicios ────────────────────────────────────────────────────────────

function ServiceTab() {
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [stats, setStats] = useState<ServiceStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/stats/services`, { headers: apiHeaders() })
      .then((r) => r.json())
      .then((d) => {
        setServices(d.services ?? []);
        if (d.services?.length) setSelectedId(d.services[0].id);
      })
      .catch(() => toast.error('Error cargando servicios'));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setStats(null);
    fetch(`${API}/api/stats/service/${selectedId}`, { headers: apiHeaders() })
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => toast.error('Error cargando estadísticas'))
      .finally(() => setLoading(false));
  }, [selectedId]);

  function formatService(s: ServiceSummary) {
    const start = new Date(s.startedAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const end = s.endedAt
      ? new Date(s.endedAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : 'Activo';
    return `${start} → ${end} · ${s.orderCount} ped.`;
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted))', marginBottom: '0.4rem', display: 'block' }}>
          Selecciona un servicio
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{ background: 'hsl(var(--surface2))', border: '1px solid hsl(var(--border))', borderRadius: '0.5rem', color: 'hsl(var(--text))', padding: '0.5rem 0.875rem', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', minWidth: 340 }}
        >
          {services.length === 0 && <option value="">Sin servicios</option>}
          {services.map((s) => (
            <option key={s.id} value={s.id}>{formatService(s)}</option>
          ))}
        </select>
      </div>

      {loading && <div style={{ color: 'hsl(var(--muted))', fontSize: '0.9rem' }}>Cargando…</div>}

      {stats && (
        <>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <StatCard label="Total recaudado" value={EUR(stats.summary.totalRevenue)} color="hsl(var(--primary))" />
            <StatCard label="Total pedidos"   value={NUM(stats.summary.totalOrders)} color="hsl(185 80% 45%)" />
            <StatCard label="Entregas"        value={NUM(stats.summary.deliveries)}  color="hsl(142 71% 45%)" sub="a domicilio" />
            <StatCard label="Recogidas"       value={NUM(stats.summary.pickups)}     color="hsl(38 95% 56%)"  sub="en local" />
          </div>

          <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem' }}>Productos más vendidos</h3>
            <ProductsTable products={stats.topProducts} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: Clientes ─────────────────────────────────────────────────────────────

function CustomerTab() {
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [orderView, setOrderView] = useState<'price' | 'date'>('date');
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchInput.length < 2) { setSuggestions([]); setShowDrop(false); return; }
    const t = setTimeout(async () => {
      try {
        const isPhone = /^\d/.test(searchInput);
        const param = isPhone ? `phone=${encodeURIComponent(searchInput)}` : `name=${encodeURIComponent(searchInput)}`;
        const r = await fetch(`${API}/api/customers?${param}&limit=6`, { headers: apiHeaders() });
        if (r.ok) { const d = await r.json(); setSuggestions(d.customers ?? []); setShowDrop(true); }
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDrop(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function selectCustomer(c: Customer) {
    setCustomer(c);
    setSearchInput(c.name);
    setShowDrop(false);
    setSuggestions([]);
    setLoading(true);
    setStats(null);
    try {
      const r = await fetch(`${API}/api/stats/customer/${c.id}`, { headers: apiHeaders() });
      const d = await r.json();
      setStats(d);
    } catch { toast.error('Error cargando estadísticas'); }
    finally { setLoading(false); }
  }

  const orders = stats ? (orderView === 'price' ? stats.ordersByPrice : stats.ordersByDate) : [];

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', position: 'relative' }} ref={dropRef}>
        <label style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted))', marginBottom: '0.4rem', display: 'block' }}>
          Buscar cliente (nombre o teléfono)
        </label>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <input
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setCustomer(null); setStats(null); }}
            placeholder="Ej: Juan / 612..."
            style={{ background: 'hsl(var(--surface2))', border: '1px solid hsl(var(--border))', borderRadius: '0.5rem', color: 'hsl(var(--text))', padding: '0.5rem 2.5rem 0.5rem 0.875rem', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', width: 280 }}
          />
          <Search size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted))', pointerEvents: 'none' }} />
        </div>
        {showDrop && suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, background: 'hsl(var(--surface2))', border: '1px solid hsl(var(--border))', borderRadius: '0.5rem', zIndex: 50, minWidth: 280, marginTop: 4 }}>
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => selectCustomer(s)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.625rem 0.875rem', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--text))', fontSize: '0.875rem' }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'hsl(var(--surface))')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <span style={{ color: 'hsl(var(--muted))', marginLeft: 8 }}>{s.phone}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div style={{ color: 'hsl(var(--muted))', fontSize: '0.9rem' }}>Cargando…</div>}

      {stats && (
        <>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <StatCard label="Total pedidos"  value={NUM(stats.summary.totalOrders)} color="hsl(185 80% 45%)" />
            <StatCard label="Total gastado"  value={EUR(stats.summary.totalSpent)}  color="hsl(var(--primary))" />
            <StatCard label="Ticket medio"   value={EUR(stats.summary.avgTicket)}   color="hsl(142 71% 45%)" />
          </div>

          <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700 }}>Historial de pedidos</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setOrderView('date')} className={`btn btn-sm ${orderView === 'date' ? 'btn-primary' : 'btn-ghost'}`}>Por fecha</button>
                <button onClick={() => setOrderView('price')} className={`btn btn-sm ${orderView === 'price' ? 'btn-primary' : 'btn-ghost'}`}>Por importe</button>
              </div>
            </div>
            {orders.length === 0 ? (
              <p style={{ color: 'hsl(var(--muted))', fontSize: '0.875rem' }}>Sin pedidos</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Pedido</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Fecha</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Artículos</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Total</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} style={{ borderBottom: '1px solid hsl(var(--border) / 0.4)' }}>
                        <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.8rem', color: 'hsl(var(--muted))' }}>#{o.id.slice(-8).toUpperCase()}</td>
                        <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>
                          {new Date(o.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))' }}>
                          {o.items.slice(0, 2).map((i) => `${i.quantity}× ${i.product.name}`).join(', ')}
                          {o.items.length > 2 && ` +${o.items.length - 2}`}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 800, color: 'hsl(var(--primary))' }}>
                          {EUR(Number(o.total))}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          {o.isPickup
                            ? <span style={{ fontSize: '0.75rem', color: 'hsl(38 95% 56%)' }}>Local</span>
                            : <span style={{ fontSize: '0.75rem', color: 'hsl(142 71% 45%)' }}>Domicilio</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: Productos ────────────────────────────────────────────────────────────

function ProductTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [stats, setStats] = useState<ProductStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/products`, { headers: apiHeaders() })
      .then((r) => r.json())
      .then((d: Product[]) => { setProducts(d); if (d.length) setSelectedId(d[0].id); })
      .catch(() => toast.error('Error cargando productos'));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setStats(null);
    fetch(`${API}/api/stats/product/${selectedId}`, { headers: apiHeaders() })
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => toast.error('Error cargando estadísticas'))
      .finally(() => setLoading(false));
  }, [selectedId]);

  // Group products by category for optgroup
  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    const cat = p.category ?? 'Sin categoría';
    (acc[cat] = acc[cat] ?? []).push(p);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted))', marginBottom: '0.4rem', display: 'block' }}>
          Selecciona un producto
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{ background: 'hsl(var(--surface2))', border: '1px solid hsl(var(--border))', borderRadius: '0.5rem', color: 'hsl(var(--text))', padding: '0.5rem 0.875rem', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', minWidth: 280 }}
        >
          {Object.entries(grouped).map(([cat, prods]) => (
            <optgroup key={cat} label={cat}>
              {prods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {loading && <div style={{ color: 'hsl(var(--muted))', fontSize: '0.9rem' }}>Cargando…</div>}

      {stats && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted))' }}>
              Categoría: <strong>{stats.product.category ?? 'Sin categoría'}</strong>
              {' · '}Precio unitario: <strong>{EUR(Number(stats.product.price))}</strong>
            </span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <StatCard label="Unidades vendidas" value={NUM(stats.summary.totalSold)}    color="hsl(185 80% 45%)" />
            <StatCard label="Total recaudado"   value={EUR(stats.summary.totalRevenue)} color="hsl(var(--primary))" />
          </div>

          <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem' }}>Clientes que más lo compran</h3>
            {stats.topCustomers.length === 0 ? (
              <p style={{ color: 'hsl(var(--muted))', fontSize: '0.875rem' }}>Sin datos</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>#</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Cliente</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Uds</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Gastado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topCustomers.map((c, i) => (
                      <tr key={c.customerId} style={{ borderBottom: '1px solid hsl(var(--border) / 0.4)' }}>
                        <td style={{ padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 700 }}>{i + 1}</td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <div style={{ fontWeight: 600 }}>{c.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'hsl(var(--muted))' }}>{c.phone}</div>
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700 }}>{NUM(c.totalQty)}</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'hsl(var(--primary))', fontWeight: 700 }}>{EUR(c.totalSpent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: Categorías ───────────────────────────────────────────────────────────

function CategoryTab() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`${API}/api/stats/categories`, { headers: apiHeaders() })
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => toast.error('Error cargando categorías'))
      .finally(() => setLoading(false));
  }, []);

  function toggle(cat: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  const maxRev = Math.max(...categories.map((c) => c.totalRevenue), 1);

  if (loading) return <div style={{ color: 'hsl(var(--muted))', fontSize: '0.9rem' }}>Cargando…</div>;
  if (!categories.length) return <div style={{ color: 'hsl(var(--muted))' }}>Sin datos de categorías</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {categories.map((cat) => {
        const isOpen = expanded.has(cat.category);
        return (
          <div key={cat.category} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <button
              onClick={() => toggle(cat.category)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--text))', textAlign: 'left' }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{cat.category}</span>
                  <span style={{ fontSize: '0.75rem', color: 'hsl(var(--muted))' }}>{NUM(cat.topProducts.length)} productos</span>
                </div>
                <div style={{ background: 'hsl(var(--primary) / 0.12)', borderRadius: 4, height: 6, overflow: 'hidden', maxWidth: 240 }}>
                  <div style={{ background: 'hsl(var(--primary))', height: '100%', width: `${(cat.totalRevenue / maxRev) * 100}%`, borderRadius: 4 }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '1.0625rem', color: 'hsl(var(--primary))' }}>{EUR(cat.totalRevenue)}</div>
                <div style={{ fontSize: '0.75rem', color: 'hsl(var(--muted))' }}>{NUM(cat.totalSold)} uds vendidas</div>
              </div>
              {isOpen ? <ChevronUp size={16} style={{ flexShrink: 0, color: 'hsl(var(--muted))' }} /> : <ChevronDown size={16} style={{ flexShrink: 0, color: 'hsl(var(--muted))' }} />}
            </button>

            {isOpen && (
              <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid hsl(var(--border))' }}>
                <h4 style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted))', fontWeight: 600, margin: '0.75rem 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Top productos
                </h4>
                <ProductsTable products={cat.topProducts.map((p, i) => ({ productId: String(i), ...p }))} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tab: Período ──────────────────────────────────────────────────────────────

const PRESETS = [
  { label: '7 días',   days: 7,   groupBy: 'day' as const },
  { label: '30 días',  days: 30,  groupBy: 'day' as const },
  { label: '3 meses',  days: 90,  groupBy: 'week' as const },
  { label: '12 meses', days: 365, groupBy: 'month' as const },
];

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

function PeriodTab() {
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const [from, setFrom] = useState(toDateStr(new Date(Date.now() - 7 * 86400_000)));
  const [to, setTo]     = useState(toDateStr(new Date()));
  const [stats, setStats] = useState<PeriodStats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setStats(null);
    fetch(`${API}/api/stats/period?groupBy=${groupBy}&from=${from}&to=${to}`, { headers: apiHeaders() })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then((d) => setStats(d))
      .catch(() => toast.error('Error cargando estadísticas de período'))
      .finally(() => setLoading(false));
  }, [groupBy, from, to]);

  useEffect(() => { load(); }, [load]);

  function applyPreset(p: typeof PRESETS[0]) {
    const end   = new Date();
    const start = new Date(Date.now() - p.days * 86400_000);
    setGroupBy(p.groupBy);
    setFrom(toDateStr(start));
    setTo(toDateStr(end));
  }

  function formatPeriod(iso: string) {
    const d = new Date(iso);
    if (groupBy === 'month') return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
    if (groupBy === 'week')  return `Sem ${d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`;
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  }

  const maxRev = stats ? Math.max(...stats.data.map((r) => r.revenue), 1) : 1;
  const totals = stats?.data.reduce(
    (acc, r) => ({ revenue: acc.revenue + r.revenue, orders: acc.orders + r.orders, deliveries: acc.deliveries + r.deliveries, pickups: acc.pickups + r.pickups }),
    { revenue: 0, orders: 0, deliveries: 0, pickups: 0 }
  ) ?? null;

  return (
    <div>
      {/* Controles */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {/* Presets */}
        <div>
          <div style={{ fontSize: '0.75rem', color: 'hsl(var(--muted))', marginBottom: '0.4rem' }}>Presets</div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className="btn btn-ghost btn-sm"
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Agrupación */}
        <div>
          <div style={{ fontSize: '0.75rem', color: 'hsl(var(--muted))', marginBottom: '0.4rem' }}>Agrupación</div>
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            {(['day', 'week', 'month'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`btn btn-sm ${groupBy === g ? 'btn-primary' : 'btn-ghost'}`}
              >
                {g === 'day' ? 'Día' : g === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
        </div>

        {/* Fechas */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'hsl(var(--muted))', marginBottom: '0.4rem' }}>Desde</div>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              style={{ background: 'hsl(var(--surface2))', border: '1px solid hsl(var(--border))', borderRadius: '0.5rem', color: 'hsl(var(--text))', padding: '0.375rem 0.75rem', fontSize: '0.8125rem', fontFamily: 'inherit', outline: 'none' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'hsl(var(--muted))', marginBottom: '0.4rem' }}>Hasta</div>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              style={{ background: 'hsl(var(--surface2))', border: '1px solid hsl(var(--border))', borderRadius: '0.5rem', color: 'hsl(var(--text))', padding: '0.375rem 0.75rem', fontSize: '0.8125rem', fontFamily: 'inherit', outline: 'none' }} />
          </div>
        </div>
      </div>

      {loading && <div style={{ color: 'hsl(var(--muted))', fontSize: '0.9rem' }}>Cargando…</div>}

      {stats && totals && (
        <>
          {/* Summary */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <StatCard label="Total recaudado" value={EUR(totals.revenue)}    color="hsl(var(--primary))" />
            <StatCard label="Pedidos"         value={NUM(totals.orders)}     color="hsl(185 80% 45%)" />
            <StatCard label="Entregas"        value={NUM(totals.deliveries)} color="hsl(142 71% 45%)" sub="a domicilio" />
            <StatCard label="Recogidas"       value={NUM(totals.pickups)}    color="hsl(38 95% 56%)"  sub="en local" />
          </div>

          {/* Bar chart */}
          {stats.data.length > 0 && (
            <div className="card" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem', overflowX: 'auto' }}>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1.25rem' }}>Recaudación por período</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, minHeight: 140 }}>
                {stats.data.map((row, i) => {
                  const h = Math.max((row.revenue / maxRev) * 120, 4);
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 32, maxWidth: 72 }}>
                      <div
                        title={`${formatPeriod(row.period)}: ${EUR(row.revenue)}`}
                        style={{ width: '100%', height: h, background: 'hsl(var(--primary) / 0.7)', borderRadius: '4px 4px 0 0', transition: 'height 0.4s', cursor: 'default' }}
                      />
                      <div style={{ fontSize: '0.65rem', color: 'hsl(var(--muted))', textAlign: 'center', lineHeight: 1.2 }}>
                        {formatPeriod(row.period)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Period table */}
          <div className="card" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem' }}>Detalle por período</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Período</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Recaudado</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Pedidos</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Entregas</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'hsl(var(--muted))', fontWeight: 600 }}>Recogidas</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.data.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid hsl(var(--border) / 0.4)' }}>
                      <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{formatPeriod(row.period)}</td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'hsl(var(--primary))', fontWeight: 700 }}>{EUR(row.revenue)}</td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{NUM(row.orders)}</td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{NUM(row.deliveries)}</td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{NUM(row.pickups)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top products in period */}
          <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem' }}>Productos más vendidos en el período</h3>
            <ProductsTable products={stats.topProducts} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type TabId = 'service' | 'customer' | 'product' | 'category' | 'period';

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'service',  label: 'Por servicio',  icon: Clock },
  { id: 'customer', label: 'Por cliente',   icon: Users },
  { id: 'product',  label: 'Por producto',  icon: Package },
  { id: 'category', label: 'Por categoría', icon: TrendingUp },
  { id: 'period',   label: 'Por período',   icon: Calendar },
];

export default function StatsPage() {
  const [tab, setTab] = useState<TabId>('service');

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <BarChart2 size={22} />
          Estadísticas
        </h1>
        <p style={{ color: 'hsl(220 18% 65%)', fontSize: '0.9rem' }}>
          Analiza el rendimiento de tu local
        </p>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.75rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`btn btn-sm ${tab === id ? 'btn-primary' : 'btn-ghost'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'service'  && <ServiceTab  />}
      {tab === 'customer' && <CustomerTab />}
      {tab === 'product'  && <ProductTab  />}
      {tab === 'category' && <CategoryTab />}
      {tab === 'period'   && <PeriodTab   />}
    </div>
  );
}
