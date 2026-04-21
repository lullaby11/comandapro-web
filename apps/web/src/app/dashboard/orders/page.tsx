'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  PlusCircle, Search, Clock, ChefHat, CheckCircle2,
  Truck, XCircle, RefreshCw, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';

interface Order {
  id: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  trackingToken: string;
  customer: { name: string; phone: string };
  items: Array<{ product: { name: string }; quantity: number }>;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; className: string; icon: React.ElementType; next?: OrderStatus }> = {
  PENDING:   { label: 'Pendiente',    className: 'badge-warning', icon: Clock,         next: 'PREPARING' },
  PREPARING: { label: 'Preparando',   className: 'badge-primary', icon: ChefHat,       next: 'READY' },
  READY:     { label: 'Listo',        className: 'badge-success', icon: CheckCircle2,  next: 'DELIVERED' },
  DELIVERED: { label: 'Entregado',    className: 'badge-muted',   icon: Truck,         next: undefined },
  CANCELLED: { label: 'Cancelado',    className: 'badge-danger',  icon: XCircle,       next: undefined },
};

function apiHeaders() {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export default function OrdersPage() {
  const [orders, setOrders]         = useState<Order[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [filterStatus, setFilter]   = useState<OrderStatus | 'ALL'>('ALL');
  const [updating, setUpdating]     = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const params = filterStatus !== 'ALL' ? `?status=${filterStatus}` : '';
      const res = await fetch(`${API}/api/orders${params}`, { headers: apiHeaders() });
      if (!res.ok) throw new Error('Error cargando pedidos');
      const data = await res.json();
      setOrders(data.orders);
      setTotal(data.total);
    } catch {
      toast.error('Error cargando pedidos');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Auto-refresh each 30s
  useEffect(() => {
    const iv = setInterval(loadOrders, 30_000);
    return () => clearInterval(iv);
  }, [loadOrders]);

  async function advanceStatus(order: Order) {
    const next = STATUS_CONFIG[order.status].next;
    if (!next) return;
    setUpdating(order.id);
    try {
      const res = await fetch(`${API}/api/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error('Error actualizando estado');
      toast.success(`Pedido → ${STATUS_CONFIG[next].label}`);
      loadOrders();
    } catch {
      toast.error('Error actualizando');
    } finally {
      setUpdating(null);
    }
  }

  async function cancelOrder(id: string) {
    setUpdating(id);
    try {
      const res = await fetch(`${API}/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      if (!res.ok) throw new Error();
      toast.success('Pedido cancelado');
      loadOrders();
    } catch {
      toast.error('Error cancelando');
    } finally {
      setUpdating(null);
    }
  }

  const filterTabs: Array<{ value: OrderStatus | 'ALL'; label: string }> = [
    { value: 'ALL',       label: 'Todos' },
    { value: 'PENDING',   label: 'Pendientes' },
    { value: 'PREPARING', label: 'Preparando' },
    { value: 'READY',     label: 'Listos' },
    { value: 'DELIVERED', label: 'Entregados' },
  ];

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.2rem' }}>Pedidos</h1>
          <p style={{ color: 'hsl(220 18% 65%)', fontSize: '0.9rem' }}>{total} pedido{total !== 1 ? 's' : ''} en total</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setLoading(true); loadOrders(); }}
            id="refresh-orders"
          >
            <RefreshCw size={15} />
            Actualizar
          </button>
          <Link href="/dashboard/orders/new" className="btn btn-primary btn-sm" id="new-order-link">
            <PlusCircle size={15} />
            Nueva comanda
          </Link>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        {filterTabs.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => { setFilter(value); setLoading(true); }}
            className={`btn btn-sm ${filterStatus === value ? 'btn-primary' : 'btn-ghost'}`}
            id={`filter-${value.toLowerCase()}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ height: 96, borderRadius: 12, background: 'hsl(222 40% 13%)', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: 'center', padding: '4rem 2rem', color: 'hsl(220 18% 55%)' }}
        >
          <Search size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
          <p style={{ fontSize: '1rem' }}>No hay pedidos{filterStatus !== 'ALL' ? ` con estado "${STATUS_CONFIG[filterStatus as OrderStatus]?.label}"` : ''}</p>
          <Link href="/dashboard/orders/new" className="btn btn-primary btn-sm" style={{ marginTop: '1.5rem', display: 'inline-flex' }}>
            <PlusCircle size={14} /> Crear el primero
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {orders.map((order, idx) => {
            const cfg   = STATUS_CONFIG[order.status];
            const Icon  = cfg.icon;
            const isUpd = updating === order.id;
            const canAdvance = !!cfg.next;
            const canCancel  = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';

            return (
              <div
                key={order.id}
                className="card animate-fade-up"
                style={{
                  padding: '1rem 1.25rem',
                  animationDelay: `${idx * 40}ms`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                {/* Status icon */}
                <div
                  style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    background: `hsl(${order.status === 'PENDING' ? '38 95% 56%' : order.status === 'PREPARING' ? '262 83% 66%' : order.status === 'READY' ? '142 71% 45%' : '220 18% 40%'} / 0.15)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Icon
                    size={20}
                    style={{
                      color: order.status === 'PENDING' ? 'hsl(38 95% 56%)' :
                             order.status === 'PREPARING' ? 'hsl(262 83% 66%)' :
                             order.status === 'READY' ? 'hsl(142 71% 45%)' :
                             order.status === 'CANCELLED' ? 'hsl(0 84% 60%)' :
                             'hsl(220 18% 55%)',
                    }}
                  />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                      #{order.id.slice(-8).toUpperCase()}
                    </span>
                    <span className={`badge ${cfg.className}`}>{cfg.label}</span>
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'hsl(220 18% 75%)', fontWeight: 500 }}>
                    {order.customer.name} · {order.customer.phone}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'hsl(220 18% 50%)', marginTop: '0.2rem' }}>
                    {order.items.slice(0, 3).map((i) => `${i.quantity}× ${i.product.name}`).join(', ')}
                    {order.items.length > 3 && ` +${order.items.length - 3} más`}
                  </div>
                </div>

                {/* Time + Total */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '1.0625rem', color: 'hsl(262 83% 70%)' }}>
                    {Number(order.total).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'hsl(220 18% 50%)', marginTop: 2 }}>
                    {new Date(order.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <a
                    href={`/tracking/${order.trackingToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                    title="Ver tracking"
                    id={`view-${order.id}`}
                  >
                    <Eye size={14} />
                  </a>
                  {canAdvance && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => advanceStatus(order)}
                      disabled={isUpd}
                      id={`advance-${order.id}`}
                    >
                      {isUpd ? (
                        <span style={{ width: 14, height: 14, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                      ) : (
                        <>→ {STATUS_CONFIG[cfg.next!].label}</>
                      )}
                    </button>
                  )}
                  {canCancel && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => cancelOrder(order.id)}
                      disabled={isUpd}
                      id={`cancel-${order.id}`}
                      title="Cancelar"
                    >
                      <XCircle size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }
      `}</style>
    </div>
  );
}
