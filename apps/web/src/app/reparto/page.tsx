'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Phone, Package, LogOut, RefreshCw, Check, Bike, Banknote, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, apiRes } from '@/lib/api';

// Pantalla de reparto. Está pensada para un móvil, con una mano y en la calle: pocos
// elementos, botones grandes y las dos acciones que hacen falta a un toque. No comparte
// layout con el dashboard a propósito — un repartidor no tiene acceso a esas pantallas y
// la API le devolvería 403 en todas.

interface PedidoDeReparto {
  id: string;
  status: 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
  total: string;
  paymentMethod: 'CASH' | 'CARD';
  deliveryAddress: string | null;
  notes: string | null;
  estimatedDeliveryAt: string | null;
  assignedAt: string | null;
  createdAt: string;
  customer: { name: string; phone: string };
  items: { quantity: number; notes: string | null; product: { name: string } }[];
}

const REFRESCO_MS = 20_000;

export default function RepartoPage() {
  const router = useRouter();
  const [pedidos, setPedidos]   = useState<PedidoDeReparto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [nombre, setNombre]     = useState('');

  const cargar = useCallback(async () => {
    try {
      setPedidos(await api<PedidoDeReparto[]>('/api/delivery/orders'));
    } catch {
      // Un fallo puntual de red no debe vaciar la pantalla ni molestar: en la calle la
      // cobertura va y viene, y el siguiente refresco lo arregla solo.
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    setNombre(JSON.parse(localStorage.getItem('user') ?? '{}').name ?? '');
    cargar();
    const id = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar, router]);

  async function cambiarEstado(pedido: PedidoDeReparto, status: 'OUT_FOR_DELIVERY' | 'DELIVERED') {
    setEnviando(pedido.id);
    try {
      // `body` va como objeto: apiRes ya lo serializa. Pasarlo serializado aquí lo
      // convertía en una cadena JSON, que la API no puede interpretar como pedido.
      const res = await apiRes(`/api/delivery/orders/${pedido.id}/status`, {
        method: 'PATCH',
        body: { status },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'No se pudo actualizar');
      }
      toast.success(status === 'DELIVERED' ? 'Entregado ✓' : 'En camino');
      await cargar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setEnviando(null);
    }
  }

  function salir() {
    localStorage.removeItem('token');
    localStorage.removeItem('business');
    localStorage.removeItem('user');
    router.push('/login');
  }

  const enCamino = pedidos.filter((p) => p.status === 'OUT_FOR_DELIVERY').length;

  return (
    <div style={{ minHeight: '100dvh', background: 'hsl(var(--bg))', color: 'hsl(var(--text))' }}>
      {/* Cabecera fija: en la calle la pantalla se desplaza sola con el movimiento */}
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'hsl(var(--surface))', borderBottom: '1px solid hsl(var(--border))',
          padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Mi reparto</div>
          <div style={{ fontSize: '0.8rem', color: 'hsl(var(--muted))' }}>
            {nombre}
            {enCamino > 0 && ` · ${enCamino} en camino`}
          </div>
        </div>
        <button onClick={cargar} aria-label="Actualizar" style={botonIcono}>
          <RefreshCw size={20} />
        </button>
        <button onClick={salir} aria-label="Salir" style={botonIcono}>
          <LogOut size={20} />
        </button>
      </header>

      <main style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {cargando && <p style={{ color: 'hsl(var(--muted))', textAlign: 'center' }}>Cargando…</p>}

        {!cargando && pedidos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'hsl(var(--muted))' }}>
            <Package size={48} style={{ opacity: 0.4, marginBottom: '1rem' }} />
            <p style={{ fontSize: '1.05rem' }}>No tienes pedidos asignados</p>
            <p style={{ fontSize: '0.85rem' }}>La pantalla se actualiza sola</p>
          </div>
        )}

        {pedidos.map((p) => (
          <TarjetaPedido
            key={p.id}
            pedido={p}
            enviando={enviando === p.id}
            onCambiar={cambiarEstado}
          />
        ))}
      </main>
    </div>
  );
}

function TarjetaPedido({
  pedido, enviando, onCambiar,
}: {
  pedido: PedidoDeReparto;
  enviando: boolean;
  onCambiar: (p: PedidoDeReparto, s: 'OUT_FOR_DELIVERY' | 'DELIVERED') => void;
}) {
  const enCamino = pedido.status === 'OUT_FOR_DELIVERY';
  const efectivo = pedido.paymentMethod === 'CASH';

  return (
    <article
      style={{
        background: 'hsl(var(--surface))',
        border: `1px solid ${enCamino ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
          <span style={{ fontWeight: 700, fontSize: '1.1rem', flex: 1 }}>{pedido.customer.name}</span>
          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'hsl(var(--muted))' }}>
            #{pedido.id.slice(-6).toUpperCase()}
          </span>
        </div>

        {/* Dirección y teléfono son enlaces: en el móvil abren el mapa y la llamada. Es
            lo que más se usa de esta pantalla, así que van arriba y con área grande.

            `dir/?api=1&destination=` abre la NAVEGACIÓN, no una búsqueda: en el móvil
            salta a la app de Maps con la ruta ya trazada desde donde esté el repartidor.
            Es un toque en lugar de tres, que en la calle y con una mano se nota. */}
        {pedido.deliveryAddress ? (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pedido.deliveryAddress)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={enlaceAccion}
          >
            <MapPin size={20} style={{ flexShrink: 0, color: 'hsl(var(--primary))' }} />
            <span style={{ textDecoration: 'underline' }}>{pedido.deliveryAddress}</span>
          </a>
        ) : (
          // Si no hay dirección hay que decirlo, no dejar el hueco en blanco: el
          // repartidor tiene que saber que le toca llamar para preguntarla.
          <div style={{ ...enlaceAccion, color: 'hsl(var(--warning))' }}>
            <MapPin size={20} style={{ flexShrink: 0 }} />
            <span>Sin dirección — llama al cliente</span>
          </div>
        )}

        <a href={`tel:${pedido.customer.phone}`} style={enlaceAccion}>
          <Phone size={20} style={{ flexShrink: 0, color: 'hsl(var(--primary))' }} />
          <span>{pedido.customer.phone}</span>
        </a>

        <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '0.9rem', color: 'hsl(var(--muted))' }}>
          {pedido.items.map((l, i) => (
            <li key={i}>
              {l.quantity}× {l.product.name}
              {l.notes && <span style={{ fontStyle: 'italic' }}> — {l.notes}</span>}
            </li>
          ))}
        </ul>

        {pedido.notes && (
          <p style={{
            margin: 0, padding: '0.6rem 0.75rem', fontSize: '0.9rem',
            background: 'hsl(var(--surface2))', borderRadius: '0.5rem',
          }}>
            {pedido.notes}
          </p>
        )}

        {/* Cobro: lo primero que pregunta un repartidor al llegar al portal. Si es en
            efectivo se destaca, porque es dinero que tiene que llevar de vuelta. */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.7rem 0.85rem', borderRadius: '0.5rem',
            background: efectivo ? 'hsl(var(--warning) / 0.15)' : 'hsl(var(--surface2))',
            border: efectivo ? '1px solid hsl(var(--warning) / 0.4)' : '1px solid transparent',
          }}
        >
          {efectivo ? <Banknote size={20} color="hsl(var(--warning))" /> : <CreditCard size={20} />}
          <span style={{ fontWeight: 700, fontSize: '1.15rem' }}>
            {Number(pedido.total).toFixed(2)} €
          </span>
          <span style={{ fontSize: '0.85rem', color: 'hsl(var(--muted))' }}>
            {efectivo ? 'a cobrar en efectivo' : 'ya pagado con tarjeta'}
          </span>
        </div>
      </div>

      <button
        onClick={() => onCambiar(pedido, enCamino ? 'DELIVERED' : 'OUT_FOR_DELIVERY')}
        disabled={enviando}
        style={{
          width: '100%', border: 'none', cursor: 'pointer',
          // Alto generoso: se pulsa caminando y con una sola mano
          padding: '1.1rem', fontSize: '1.05rem', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
          background: enCamino ? 'hsl(var(--success))' : 'hsl(var(--primary))',
          color: '#fff', opacity: enviando ? 0.6 : 1,
        }}
      >
        {enCamino ? <Check size={22} /> : <Bike size={22} />}
        {enviando ? 'Enviando…' : enCamino ? 'Entregado' : 'Salgo a repartir'}
      </button>
    </article>
  );
}

const botonIcono: React.CSSProperties = {
  background: 'hsl(var(--surface2))', border: '1px solid hsl(var(--border))',
  color: 'hsl(var(--text))', borderRadius: '0.5rem',
  width: 42, height: 42, display: 'grid', placeItems: 'center', cursor: 'pointer',
};

const enlaceAccion: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.6rem',
  color: 'hsl(var(--text))', textDecoration: 'none',
  padding: '0.5rem 0', fontSize: '1rem', minHeight: 44,
};
