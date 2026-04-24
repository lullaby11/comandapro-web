'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import {
  Package, CheckCircle, Clock, Truck, XCircle, Navigation,
} from 'lucide-react';

function useCountdown(target: string | null) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!target) return;
    function tick() {
      const diff = new Date(target!).getTime() - Date.now();
      setRemaining(diff > 0 ? diff : 0);
    }
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [target]);

  return remaining;
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}min`;
  if (m > 0) return `${m}min ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

const API = '';

const STATUS_INFO: Record<string, { label: string; color: string; icon: React.ElementType; step: number }> = {
  PENDING:          { label: 'Pedido recibido',     color: 'hsl(38 95% 56%)',  icon: Clock,        step: 1 },
  PREPARING:        { label: 'En preparación',      color: 'hsl(25 100% 51%)', icon: Package,      step: 2 },
  READY:            { label: 'Listo para entregar', color: 'hsl(142 71% 45%)', icon: CheckCircle,  step: 3 },
  OUT_FOR_DELIVERY: { label: 'En reparto',          color: 'hsl(185 80% 45%)', icon: Navigation,   step: 4 },
  DELIVERED:        { label: 'Entregado',           color: 'hsl(142 71% 45%)', icon: Truck,        step: 5 },
  CANCELLED:        { label: 'Cancelado',           color: 'hsl(0 84% 60%)',   icon: XCircle,      step: 0 },
};

interface TrackingData {
  id: string;
  status: string;
  isPickup: boolean;
  createdAt: string;
  updatedAt: string;
  estimatedDeliveryAt: string | null;
  customerName: string;
  business: { name: string; logoUrl?: string; phone?: string };
  items: { productName: string; quantity: number; subtotal: number; productImage?: string }[];
  total: number;
}

export default function TrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData]       = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const countdown             = useCountdown(data?.estimatedDeliveryAt ?? null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    async function fetchStatus() {
      try {
        const res = await fetch(`${API}/api/tracking/${token}`);
        if (!res.ok) throw new Error('Pedido no encontrado');
        const d = await res.json();
        setData(d);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error');
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
    // Polling cada 30s
    interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [token]);

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 48, height: 48, border: '3px solid hsl(25 100% 51%)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', padding: '2rem' }}>
        <XCircle size={48} style={{ color: 'hsl(0 84% 60%)' }} />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Pedido no encontrado</h1>
        <p style={{ color: 'hsl(207 20% 65%)' }}>{error}</p>
      </div>
    );
  }

  const statusInfo = STATUS_INFO[data.status] ?? STATUS_INFO.PENDING;
  const StatusIcon = statusInfo.icon;
  const steps = data.isPickup
    ? ['PENDING', 'PREPARING', 'READY', 'DELIVERED']
    : ['PENDING', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  const isCancelled = data.status === 'CANCELLED';
  const isDelivered = data.status === 'DELIVERED';

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'radial-gradient(ellipse at 50% 0%, hsl(25 100% 51% / 0.1) 0%, transparent 60%), hsl(207 85% 7%)',
        padding: '2rem 1rem',
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        
        {/* Business header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }} className="animate-fade-up">
          <img src="/olyda.png" alt="Olyda" style={{ height: 48, width: 'auto', objectFit: 'contain', marginBottom: '1rem' }} />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{data.business.name}</h1>
          <p style={{ color: 'hsl(207 20% 65%)', marginTop: '0.25rem', fontSize: '0.875rem' }}>
            Seguimiento del pedido · #{data.id.slice(-8).toUpperCase()}
          </p>
        </div>

        {/* Status card */}
        <div
          className="card animate-fade-up"
          style={{
            marginBottom: '1.25rem',
            border: `1px solid ${statusInfo.color}40`,
            background: `${statusInfo.color}10`,
            padding: '1.75rem',
            textAlign: 'center',
          }}
        >
          <StatusIcon
            size={48}
            style={{ color: statusInfo.color, margin: '0 auto 1rem', display: 'block' }}
          />
          <div style={{ fontSize: '1.375rem', fontWeight: 800, color: statusInfo.color, marginBottom: '0.25rem' }}>
            {statusInfo.label}
          </div>
          <div style={{ color: 'hsl(207 20% 65%)', fontSize: '0.875rem' }}>
            Última actualización: {new Date(data.updatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* Estimated delivery countdown */}
        {data.estimatedDeliveryAt && !isCancelled && !isDelivered && (
          <div
            className="card animate-fade-up"
            style={{ marginBottom: '1.25rem', padding: '1.25rem 1.75rem', textAlign: 'center', border: '1px solid hsl(25 100% 51% / 0.25)' }}
          >
            <div style={{ fontSize: '0.75rem', color: 'hsl(207 20% 65%)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.375rem' }}>
              Tiempo estimado de entrega
            </div>
            {countdown === null ? null : countdown === 0 ? (
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'hsl(142 71% 45%)' }}>
                ¡Tu pedido llega enseguida!
              </div>
            ) : (
              <>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'hsl(25 100% 51%)', letterSpacing: '-0.02em' }}>
                  {formatCountdown(countdown)}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'hsl(207 20% 65%)', marginTop: '0.25rem' }}>
                  Previsto para las {new Date(data.estimatedDeliveryAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Progress steps */}
        {!isCancelled && (
          <div className="card animate-fade-up" style={{ marginBottom: '1.25rem', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
              {steps.map((step, idx) => {
                const info      = STATUS_INFO[step];
                const StepIcon  = info.icon;
                const isCurrent = data.status === step;
                const isDone    = info.step < statusInfo.step;
                const isActive  = isDone || isCurrent;
                return (
                  <div key={step} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem', position: 'relative' }}>
                    {/* Connector line */}
                    {idx < steps.length - 1 && (
                      <div
                        style={{
                          position: 'absolute', left: '50%', top: 18, width: '100%', height: 2,
                          background: isDone ? 'hsl(142 71% 45%)' : 'hsl(207 40% 22%)',
                          transition: 'background 0.3s',
                        }}
                      />
                    )}
                    {/* Icon circle */}
                    <div
                      style={{
                        width: 36, height: 36, borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', zIndex: 1,
                        background: isActive ? (isCurrent ? statusInfo.color : 'hsl(142 71% 45%)') : 'hsl(207 60% 16%)',
                        border: `2px solid ${isActive ? (isCurrent ? statusInfo.color : 'hsl(142 71% 45%)') : 'hsl(207 40% 22%)'}`,
                        transition: 'all 0.3s',
                        boxShadow: isCurrent ? `0 0 0 4px ${statusInfo.color}30` : 'none',
                      }}
                    >
                      <StepIcon size={16} color={isActive ? 'white' : 'hsl(207 20% 65%)'} />
                    </div>
                    <span style={{ fontSize: '0.65rem', color: isActive ? 'hsl(var(--text))' : 'hsl(207 20% 65%)', textAlign: 'center', lineHeight: 1.2 }}>
                      {info.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Order items */}
        <div className="card animate-fade-up" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '1rem' }}>
            Resumen del pedido
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {data.items.map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.625rem 0', borderBottom: '1px solid hsl(207 40% 22%)',
                }}
              >
                <span style={{ fontWeight: 500 }}>
                  <span style={{ color: 'hsl(25 100% 51%)', marginRight: '0.5rem', fontWeight: 700 }}>
                    {item.quantity}x
                  </span>
                  {item.productName}
                </span>
                <span style={{ color: 'hsl(207 20% 65%)', fontWeight: 600 }}>
                  {item.subtotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', fontWeight: 800, fontSize: '1.125rem' }}>
              <span>Total</span>
              <span style={{ color: 'hsl(25 100% 51%)' }}>
                {data.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', color: 'hsl(207 20% 65%)', fontSize: '0.75rem', marginTop: '1.5rem' }}>
          Pedido realizado el {new Date(data.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
          {' · '}Actualización automática cada 30 segundos
        </p>
      </div>
    </div>
  );
}
