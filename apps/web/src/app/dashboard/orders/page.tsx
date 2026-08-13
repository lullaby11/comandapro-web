'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  PlusCircle, Search, Clock, ChefHat, CheckCircle2,
  Truck, XCircle, RefreshCw, Eye, MessageCircle, Store, Printer, Navigation, Trash2,
  Play, StopCircle, Globe,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiRes } from '@/lib/api';


// ─── Diagnóstico de impresión ────────────────────────────────────────────────
// Los problemas de impresora solo se reproducen en el local del cliente, así que el
// registro detallado se activa desde la consola del propio equipo, sin redesplegar:
//   localStorage.setItem('debugPrint', '1')
function printLog(...args: unknown[]) {
  if (typeof window !== 'undefined' && localStorage.getItem('debugPrint') === '1') {
    console.log('[Print]', ...args);
  }
}

async function printViaWebUSB(buffer: Uint8Array) {
  if (!navigator.usb) throw new Error('WebUSB no soportado. Usa Chrome o Edge.');

  const device = await navigator.usb.requestDevice({
    filters: [{ classCode: 0x07 }, { classCode: 0xFF }],
  });
  await device.open();

  if (device.configuration === null) await device.selectConfiguration(1);

  // Recopilar todos los endpoints BULK OUT de todas las interfaces y alternates
  type Candidate = { interfaceNumber: number; altSetting: number; endpointNumber: number };
  const candidates: Candidate[] = [];

  for (const iface of device.configuration!.interfaces) {
    for (const alt of iface.alternates) {
      for (const ep of alt.endpoints) {
        if (ep.type === 'bulk' && ep.direction === 'out') {
          candidates.push({
            interfaceNumber: iface.interfaceNumber,
            altSetting:      alt.alternateSetting,
            endpointNumber:  ep.endpointNumber,
          });
        }
      }
    }
  }

  // Añadir combinaciones hardcodeadas como último recurso (iface=0, ep=1 y ep=2)
  for (const ep of [1, 2]) {
    if (!candidates.some((c) => c.interfaceNumber === 0 && c.endpointNumber === ep)) {
      candidates.push({ interfaceNumber: 0, altSetting: 0, endpointNumber: ep });
    }
  }

  printLog('WebUSB — candidatos a probar:', candidates);

  let lastError: Error = new Error('No se pudo imprimir — comprueba que la impresora está encendida y conectada');

  for (const { interfaceNumber, altSetting, endpointNumber } of candidates) {
    try {
      printLog(`WebUSB — probando iface=${interfaceNumber} alt=${altSetting} ep=${endpointNumber}...`);
      await device.claimInterface(interfaceNumber);
      try {
        await device.selectAlternateInterface(interfaceNumber, altSetting);
      } catch {
        // Algunos dispositivos no admiten SET_INTERFACE — continuar igualmente
      }
      await device.transferOut(endpointNumber, buffer);
      printLog(`WebUSB — impresión correcta con iface=${interfaceNumber} ep=${endpointNumber}`);
      await device.close();
      return;
    } catch (err) {
      // Es normal que fallen varios candidatos antes de dar con el bueno: no es un aviso
      printLog(`WebUSB — falló iface=${interfaceNumber} ep=${endpointNumber}:`, err);
      lastError = err as Error;
      try { await device.releaseInterface(interfaceNumber); } catch { /* ignorar */ }
    }
  }

  await device.close();
  throw lastError;
}

// ── Bluetooth ESC/POS ────────────────────────────────────────────────────────
// UUIDs del servicio serie BLE usados por la mayoría de impresoras POS (Bluebee, Xprinter, HPRT…)
const BLE_SERVICE_UUID  = '000018f0-0000-1000-8000-00805f9b34fb';
const BLE_WRITE_CHAR_UUID = '000018f1-0000-1000-8000-00805f9b34fb';
// UUIDs alternativos para impresoras que usan otro perfil serie BLE
const BLE_SERVICE_ALT   = 'e7810a71-73ae-499d-8c15-faa9aef0c3f2';
const BLE_CHAR_ALT      = 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f';

let bleDevice: BluetoothDevice | null = null;
let bleCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

async function printViaBluetooth(buffer: Uint8Array) {
  if (!('bluetooth' in navigator)) {
    throw new Error('Web Bluetooth no disponible. Usa Chrome en Android o Chrome/Edge en escritorio.');
  }

  // Si no hay dispositivo conectado o se desconectó, abrimos el diálogo de selección
  if (!bleDevice || !bleDevice.gatt?.connected) {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [BLE_SERVICE_UUID] }, { services: [BLE_SERVICE_ALT] }],
      optionalServices: [BLE_SERVICE_UUID, BLE_SERVICE_ALT],
    });

    const server = await device.gatt!.connect();
    device.addEventListener('gattserverdisconnected', () => {
      bleCharacteristic = null;
    });

    // Intentar primero con UUID principal, luego con el alternativo
    let characteristic: BluetoothRemoteGATTCharacteristic | null = null;
    for (const [svcUuid, charUuid] of [
      [BLE_SERVICE_UUID, BLE_WRITE_CHAR_UUID],
      [BLE_SERVICE_ALT,  BLE_CHAR_ALT],
    ]) {
      try {
        const svc = await server.getPrimaryService(svcUuid);
        characteristic = await svc.getCharacteristic(charUuid);
        break;
      } catch {
        // probar siguiente par
      }
    }

    if (!characteristic) {
      throw new Error('No se encontró el servicio de impresión en la impresora Bluetooth. Comprueba que esté encendida y emparejada.');
    }

    bleDevice = device;
    bleCharacteristic = characteristic;
  }

  if (!bleCharacteristic) throw new Error('Impresora Bluetooth desconectada');

  // Enviar el buffer en chunks (el MTU BLE suele ser 512 bytes, usamos 200 por seguridad)
  const CHUNK = 200;
  for (let i = 0; i < buffer.length; i += CHUNK) {
    await bleCharacteristic.writeValueWithoutResponse(buffer.slice(i, i + CHUNK));
    // Pausa mínima para que la impresora procese sin saturar el buffer BLE
    await new Promise<void>((r) => setTimeout(r, 20));
  }
}

type OrderStatus = 'RECEIVED_ONLINE' | 'PENDING' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';

interface Service {
  id: string;
  startedAt: string;
  endedAt: string | null;
}

interface Order {
  id: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  estimatedDeliveryAt: string | null;
  trackingToken: string;
  isPickup: boolean;
  paymentMethod: 'CASH' | 'CARD' | null;
  cashGiven: number | null;
  customer: { name: string; phone: string };
  items: Array<{ product: { name: string }; quantity: number }>;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; className: string; icon: React.ElementType; next?: OrderStatus; acceptLabel?: string }> = {
  RECEIVED_ONLINE:  { label: 'Online — sin confirmar', className: 'badge-online',   icon: Globe,         next: 'PENDING', acceptLabel: '✓ Aceptar pedido' },
  PENDING:          { label: 'Pendiente',              className: 'badge-warning',  icon: Clock,         next: 'PREPARING' },
  PREPARING:        { label: 'Preparando',             className: 'badge-primary',  icon: ChefHat,       next: 'READY' },
  READY:            { label: 'Listo',                  className: 'badge-success',  icon: CheckCircle2,  next: 'OUT_FOR_DELIVERY' },
  OUT_FOR_DELIVERY: { label: 'En reparto',             className: 'badge-info',     icon: Navigation,    next: 'DELIVERED' },
  DELIVERED:        { label: 'Entregado',              className: 'badge-muted',    icon: Truck,         next: undefined },
  CANCELLED:        { label: 'Cancelado',              className: 'badge-danger',   icon: XCircle,       next: undefined },
};

function getNextStatus(order: Order): OrderStatus | undefined {
  if (order.status === 'READY' && order.isPickup) return 'DELIVERED';
  return STATUS_CONFIG[order.status].next;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function OrdersPage() {
  const [service, setService]           = useState<Service | null | undefined>(undefined);
  const [orders, setOrders]             = useState<Order[]>([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [filterStatus, setFilter]       = useState<OrderStatus | 'ALL'>('ALL');
  const [pageSize, setPageSize]         = useState(20);
  const [updating, setUpdating]         = useState<string | null>(null);
  const [printing, setPrinting]         = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Order | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [serviceLoading, setServiceLoading] = useState(false);
  const [confirmEndService, setConfirmEndService] = useState(false);
  const [printerMode, setPrinterMode]   = useState<string>('webusb');

  const loadService = useCallback(async () => {
    try {
      const res = await apiRes(`/api/services/active`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setService(data.service);
    } catch {
      setService(null);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'ALL') params.set('status', filterStatus);
      params.set('limit', String(pageSize));
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await apiRes(`/api/orders${qs}`);
      if (!res.ok) throw new Error('Error cargando pedidos');
      const data = await res.json();
      const TERMINAL = new Set(['DELIVERED', 'CANCELLED']);
      const sorted = [...data.orders].sort((a: Order, b: Order) => {
        // RECEIVED_ONLINE siempre al principio
        if (a.status === 'RECEIVED_ONLINE' && b.status !== 'RECEIVED_ONLINE') return -1;
        if (b.status === 'RECEIVED_ONLINE' && a.status !== 'RECEIVED_ONLINE') return 1;
        const aTerminal = TERMINAL.has(a.status) ? 1 : 0;
        const bTerminal = TERMINAL.has(b.status) ? 1 : 0;
        if (aTerminal !== bTerminal) return aTerminal - bTerminal;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setOrders(sorted);
      setTotal(data.total);
    } catch {
      toast.error('Error cargando pedidos');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, pageSize]);

  useEffect(() => { loadService(); }, [loadService]);
  useEffect(() => { loadOrders(); }, [loadOrders]);

  useEffect(() => {
    apiRes(`/api/settings`)
      .then((r) => r.ok ? r.json() : null)
      .then((s) => { if (s?.printerMode) setPrinterMode(s.printerMode); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const iv = setInterval(loadOrders, 30_000);
    return () => clearInterval(iv);
  }, [loadOrders]);

  async function startService() {
    setServiceLoading(true);
    try {
      const res = await apiRes(`/api/services/start`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error iniciando servicio');
      }
      toast.success('Servicio iniciado');
      await loadService();
      setLoading(true);
      loadOrders();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error iniciando servicio');
    } finally {
      setServiceLoading(false);
    }
  }

  async function endService() {
    setConfirmEndService(false);
    setServiceLoading(true);
    try {
      const res = await apiRes(`/api/services/end`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error finalizando servicio');
      }
      toast.success('Servicio finalizado. Todos los pedidos marcados como entregados.');
      await loadService();
      setLoading(true);
      loadOrders();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error finalizando servicio');
    } finally {
      setServiceLoading(false);
    }
  }

  async function advanceStatus(order: Order) {
    const next = getNextStatus(order);
    if (!next) return;
    setUpdating(order.id);
    try {
      const res = await apiRes(`/api/orders/${order.id}/status`, { method: 'PATCH', body: { status: next } });
      if (!res.ok) throw new Error('Error actualizando estado');
      toast.success(`Pedido → ${STATUS_CONFIG[next].label}`);
      loadOrders();
    } catch {
      toast.error('Error actualizando');
    } finally {
      setUpdating(null);
    }
  }

  async function handlePrint(id: string) {
    setPrinting(id);
    try {
      printLog('iniciando impresión, modo:', printerMode);
      const res = await apiRes(`/api/orders/${id}/print`, { method: 'POST' });
      if (!res.ok) throw new Error('Error generando comanda');
      const buffer = new Uint8Array(await res.arrayBuffer());
      printLog(`buffer recibido (${buffer.length} bytes) → ${printerMode === 'bluetooth' ? 'Bluetooth' : 'WebUSB'}`);

      if (printerMode === 'bluetooth') {
        await printViaBluetooth(buffer);
      } else {
        await printViaWebUSB(buffer);
      }

      // Se confirma solo tras un envío correcto: si el transporte falla, el pedido sigue
      // constando como pendiente de imprimir y el agente local puede recogerlo.
      await apiRes(`/api/orders/${id}/printed`, { method: 'POST' })
        .catch(() => printLog('no se pudo confirmar la impresión'));

      toast.success('¡Comanda enviada a la impresora!', { icon: '🖨️' });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error de impresión');
    } finally {
      setPrinting(null);
    }
  }

  async function cancelOrder(id: string) {
    setUpdating(id);
    try {
      const res = await apiRes(`/api/orders/${id}/status`, { method: 'PATCH', body: { status: 'CANCELLED' } });
      if (!res.ok) throw new Error();
      toast.success('Pedido cancelado');
      loadOrders();
    } catch {
      toast.error('Error cancelando');
    } finally {
      setUpdating(null);
    }
  }

  async function deleteOrder() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await apiRes(`/api/orders/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Pedido eliminado y stock restaurado');
      setConfirmDelete(null);
      loadOrders();
    } catch {
      toast.error('Error eliminando el pedido');
    } finally {
      setDeleting(false);
    }
  }

  const filterTabs: Array<{ value: OrderStatus | 'ALL'; label: string; highlight?: boolean }> = [
    { value: 'ALL',              label: 'Todos' },
    { value: 'RECEIVED_ONLINE',  label: '🌐 Online', highlight: true },
    { value: 'PENDING',          label: 'Pendientes' },
    { value: 'PREPARING',        label: 'Preparando' },
    { value: 'READY',            label: 'Listos' },
    { value: 'OUT_FOR_DELIVERY', label: 'En reparto' },
    { value: 'DELIVERED',        label: 'Entregados' },
  ];

  const onlineCount = orders.filter(o => o.status === 'RECEIVED_ONLINE').length;

  const serviceActive = service !== null && service !== undefined && !service?.endedAt;

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Banner de servicio ── */}
      {service !== undefined && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '1rem',
          marginBottom: '1.5rem', padding: '1rem 1.25rem',
          background: serviceActive
            ? 'hsl(142 71% 45% / 0.08)'
            : 'hsl(220 18% 20% / 0.6)',
          border: `1px solid ${serviceActive ? 'hsl(142 71% 45% / 0.3)' : 'hsl(220 18% 30%)'}`,
          borderRadius: '0.75rem',
          flexWrap: 'wrap',
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: serviceActive ? 'hsl(142 71% 45%)' : 'hsl(220 18% 45%)',
            boxShadow: serviceActive ? '0 0 8px hsl(142 71% 45% / 0.6)' : 'none',
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {serviceActive ? (
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'hsl(142 71% 55%)' }}>
                Servicio activo · iniciado {formatDateTime(service!.startedAt)}
              </span>
            ) : (
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'hsl(220 18% 55%)' }}>
                Sin servicio activo — los pedidos no se pueden crear hasta iniciar uno
              </span>
            )}
          </div>
          {serviceActive ? (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setConfirmEndService(true)}
              disabled={serviceLoading}
            >
              {serviceLoading ? (
                <span style={{ width: 14, height: 14, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
              ) : (
                <><StopCircle size={14} /> Finalizar servicio</>
              )}
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={startService}
              disabled={serviceLoading}
            >
              {serviceLoading ? (
                <span style={{ width: 14, height: 14, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
              ) : (
                <><Play size={14} /> Iniciar servicio</>
              )}
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.2rem' }}>Pedidos</h1>
          <p style={{ color: 'hsl(220 18% 65%)', fontSize: '0.9rem' }}>
            {total} pedido{total !== 1 ? 's' : ''} en el servicio actual
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setLoading(true); }}
            style={{
              background: 'hsl(var(--surface2))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
              color: 'hsl(var(--text))',
              padding: '0.375rem 0.75rem',
              fontSize: '0.8125rem',
              fontFamily: 'inherit',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value={20}>20 pedidos</option>
            <option value={50}>50 pedidos</option>
            <option value={100}>100 pedidos</option>
          </select>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setLoading(true); loadOrders(); }}
            id="refresh-orders"
          >
            <RefreshCw size={15} />
            Actualizar
          </button>
          {serviceActive ? (
            <Link href="/dashboard/orders/new" className="btn btn-primary btn-sm" id="new-order-link">
              <PlusCircle size={15} />
              Nueva comanda
            </Link>
          ) : (
            <button className="btn btn-primary btn-sm" disabled title="Inicia un servicio para crear pedidos" id="new-order-link">
              <PlusCircle size={15} />
              Nueva comanda
            </button>
          )}
        </div>
      </div>

      {/* Online orders alert banner */}
      {onlineCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.875rem',
          marginBottom: '1rem', padding: '0.875rem 1.25rem',
          background: 'hsl(262 80% 45% / 0.12)',
          border: '2px solid hsl(262 80% 55% / 0.7)',
          borderRadius: '0.75rem',
          animation: 'pulseOnline 2s ease-in-out infinite',
        }}>
          <Globe size={20} style={{ color: 'hsl(262 80% 70%)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'hsl(262 80% 75%)' }}>
              {onlineCount} pedido{onlineCount !== 1 ? 's' : ''} online sin confirmar
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'hsl(262 80% 60%)', marginLeft: '0.5rem' }}>
              — el cliente está esperando tu confirmación
            </span>
          </div>
          <button
            onClick={() => { setFilter('RECEIVED_ONLINE'); setLoading(true); }}
            style={{ background: 'hsl(262 80% 55%)', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', flexShrink: 0 }}
          >
            Ver ahora →
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        {filterTabs.map(({ value, label, highlight }) => (
          <button
            key={value}
            onClick={() => { setFilter(value); setLoading(true); }}
            className={`btn btn-sm ${filterStatus === value ? 'btn-primary' : 'btn-ghost'}`}
            id={`filter-${value.toLowerCase()}`}
            style={highlight && onlineCount > 0 && filterStatus !== value ? {
              background: 'hsl(262 80% 45% / 0.2)',
              borderColor: 'hsl(262 80% 55% / 0.5)',
              color: 'hsl(262 80% 75%)',
            } : {}}
          >
            {label}
            {highlight && onlineCount > 0 && (
              <span style={{ marginLeft: '0.25rem', background: 'hsl(262 80% 55%)', color: 'white', borderRadius: 10, padding: '0 5px', fontSize: '0.7rem', fontWeight: 700 }}>
                {onlineCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Resumen de entregados */}
      {(() => {
        const delivered = orders.filter(o => o.status === 'DELIVERED');
        if (delivered.length === 0) return null;
        const sum = delivered.reduce((acc, o) => acc + Number(o.total), 0);
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.625rem',
            marginBottom: '1.25rem', padding: '0.625rem 1rem',
            background: 'hsl(142 71% 45% / 0.08)',
            border: '1px solid hsl(142 71% 45% / 0.25)',
            borderRadius: '0.625rem',
          }}>
            <Truck size={15} style={{ color: 'hsl(142 71% 45%)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.875rem', color: 'hsl(var(--muted))' }}>
              {delivered.length} pedido{delivered.length !== 1 ? 's' : ''} entregado{delivered.length !== 1 ? 's' : ''}
            </span>
            <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '1rem', color: 'hsl(142 71% 45%)' }}>
              {sum.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </span>
          </div>
        );
      })()}

      {/* Sin servicio activo */}
      {!serviceActive && service !== undefined && (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'hsl(220 18% 55%)' }}>
          <Play size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
          <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>No hay ningún servicio activo</p>
          <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>Pulsa &laquo;Iniciar servicio&raquo; para comenzar a recibir pedidos</p>
        </div>
      )}

      {/* Orders list (siempre visible para que los pedidos online aparezcan incluso sin servicio activo) */}
      {(serviceActive || onlineCount > 0) && (
        loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ height: 96, borderRadius: 12, background: 'hsl(222 40% 13%)', animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'hsl(220 18% 55%)' }}>
            <Search size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
            <p style={{ fontSize: '1rem' }}>No hay pedidos{filterStatus !== 'ALL' ? ` con estado "${STATUS_CONFIG[filterStatus as OrderStatus]?.label}"` : ''}</p>
            <Link href="/dashboard/orders/new" className="btn btn-primary btn-sm" style={{ marginTop: '1.5rem', display: 'inline-flex' }}>
              <PlusCircle size={14} /> Crear el primero
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {orders.map((order, idx) => {
              const cfg      = STATUS_CONFIG[order.status];
              const Icon     = cfg.icon;
              const isUpd    = updating === order.id;
              const nextSt   = getNextStatus(order);
              const canAdvance = !!nextSt;
              const canCancel  = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';

              const isOnline = order.status === 'RECEIVED_ONLINE';

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
                    ...(isOnline ? {
                      background: 'hsl(262 80% 45% / 0.1)',
                      borderColor: 'hsl(262 80% 55% / 0.7)',
                      borderWidth: 2,
                      boxShadow: '0 0 20px hsl(262 80% 45% / 0.2)',
                    } : order.isPickup ? {
                      borderColor: 'hsl(38 95% 56% / 0.6)',
                      background: 'hsl(38 95% 56% / 0.05)',
                    } : {}),
                  }}
                >
                  {/* Status icon */}
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    background: isOnline ? 'hsl(262 80% 55% / 0.2)' : `hsl(${order.status === 'PENDING' ? '38 95% 56%' : order.status === 'PREPARING' ? '25 100% 51%' : order.status === 'READY' ? '142 71% 45%' : order.status === 'OUT_FOR_DELIVERY' ? '185 80% 45%' : '220 18% 40%'} / 0.15)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    ...(isOnline ? { animation: 'pulseOnline 2s ease-in-out infinite' } : {}),
                  }}>
                    <Icon size={20} style={{
                      color: isOnline ? 'hsl(262 80% 75%)' :
                             order.status === 'PENDING' ? 'hsl(38 95% 56%)' :
                             order.status === 'PREPARING' ? 'hsl(25 100% 51%)' :
                             order.status === 'READY' ? 'hsl(142 71% 45%)' :
                             order.status === 'OUT_FOR_DELIVERY' ? 'hsl(185 80% 45%)' :
                             order.status === 'CANCELLED' ? 'hsl(0 84% 60%)' :
                             'hsl(220 18% 55%)',
                    }} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                        #{order.id.slice(-8).toUpperCase()}
                      </span>
                      <span
                        className={`badge ${cfg.className}`}
                        style={isOnline ? {
                          background: 'hsl(262 80% 55%)', color: 'white',
                          border: '1px solid hsl(262 80% 65%)',
                          fontWeight: 700, fontSize: '0.7rem',
                        } : {}}
                      >
                        {isOnline ? '🌐 ' : ''}{cfg.label}
                      </span>
                      {order.isPickup && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 700, color: 'hsl(38 95% 56%)', background: 'hsl(38 95% 56% / 0.15)', border: '1px solid hsl(38 95% 56% / 0.4)', borderRadius: 6, padding: '0.1rem 0.5rem' }}>
                          <Store size={10} /> Recoge en local
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: isOnline ? 'hsl(262 80% 80%)' : 'hsl(220 18% 75%)', fontWeight: 500 }}>
                      {order.customer.name} · {order.customer.phone}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'hsl(220 18% 50%)', marginTop: '0.2rem' }}>
                      {order.items.slice(0, 3).map((i) => `${i.quantity}× ${i.product.name}`).join(', ')}
                      {order.items.length > 3 && ` +${order.items.length - 3} más`}
                    </div>
                  </div>

                  {/* Time + Total + Payment */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '1.0625rem', color: isOnline ? 'hsl(262 80% 75%)' : 'hsl(var(--primary))' }}>
                      {Number(order.total).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'hsl(207 20% 55%)', marginTop: 2, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.1rem' }}>
                      <span title="Hora de recepción">📥 {formatTime(order.createdAt)}</span>
                      {order.estimatedDeliveryAt && (
                        <span title="Hora de entrega" style={{ color: 'hsl(25 100% 55%)' }}>
                          🕐 {formatTime(order.estimatedDeliveryAt)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.7rem', marginTop: 3, color: 'hsl(207 20% 55%)' }}>
                      {(order.paymentMethod ?? 'CASH') === 'CASH' ? '💵 Efectivo' : '💳 Tarjeta'}
                      {(order.paymentMethod ?? 'CASH') === 'CASH' && order.cashGiven != null && (
                        <span style={{ marginLeft: 4, color: 'hsl(142 71% 45%)' }}>
                          · cambio {(order.cashGiven - Number(order.total)).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
                    {!isOnline && (
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
                    )}
                    <a
                      href={`https://wa.me/${order.customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${order.customer.name}, puedes seguir tu pedido aquí: ${window.location.origin}/tracking/${order.trackingToken}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm"
                      title="Enviar por WhatsApp"
                      id={`whatsapp-${order.id}`}
                      style={{ color: 'hsl(142 71% 45%)' }}
                    >
                      <MessageCircle size={14} />
                    </a>
                    {!isOnline && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handlePrint(order.id)}
                        disabled={printing === order.id}
                        title="Imprimir comanda"
                        id={`print-${order.id}`}
                      >
                        {printing === order.id ? (
                          <span style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                        ) : (
                          <Printer size={14} />
                        )}
                      </button>
                    )}
                    {canAdvance && (
                      <button
                        onClick={() => advanceStatus(order)}
                        disabled={isUpd}
                        id={`advance-${order.id}`}
                        style={isOnline ? {
                          background: 'hsl(262 80% 55%)', color: 'white',
                          border: 'none', borderRadius: 8,
                          padding: '0.5rem 1rem', fontWeight: 700,
                          fontSize: '0.875rem', cursor: 'pointer',
                          boxShadow: '0 2px 8px hsl(262 80% 45% / 0.4)',
                        } : undefined}
                        className={isOnline ? undefined : 'btn btn-primary btn-sm'}
                      >
                        {isUpd ? (
                          <span style={{ width: 14, height: 14, border: `2px solid ${isOnline ? 'white' : 'white'}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                        ) : (
                          cfg.acceptLabel ?? `→ ${STATUS_CONFIG[nextSt!].label}`
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
                    {!isOnline && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setConfirmDelete(order)}
                        disabled={isUpd}
                        id={`delete-${order.id}`}
                        title="Eliminar pedido"
                        style={{ color: 'hsl(0 84% 60%)', borderColor: 'hsl(0 84% 60% / 0.3)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Modal confirmar finalizar servicio */}
      {confirmEndService && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'hsl(0 0% 0% / 0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setConfirmEndService(false)}
        >
          <div
            className="card"
            style={{ maxWidth: 420, width: '100%', padding: '1.75rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'hsl(0 84% 60% / 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <StopCircle size={18} style={{ color: 'hsl(0 84% 60%)' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>Finalizar servicio</div>
                <div style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted))' }}>
                  Iniciado {service ? formatDateTime(service.startedAt) : ''}
                </div>
              </div>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'hsl(var(--muted))', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Al finalizar el servicio, <strong>todos los pedidos activos se marcarán como entregados</strong> y dejarán de aparecer en el listado. Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmEndService(false)}>
                Cancelar
              </button>
              <button className="btn btn-danger btn-sm" onClick={endService}>
                <StopCircle size={14} /> Finalizar servicio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de borrado */}
      {confirmDelete && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'hsl(0 0% 0% / 0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 420, width: '100%', padding: '1.75rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'hsl(0 84% 60% / 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trash2 size={18} style={{ color: 'hsl(0 84% 60%)' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>Eliminar pedido</div>
                <div style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted))' }}>
                  #{confirmDelete.id.slice(-8).toUpperCase()} · {confirmDelete.customer.name}
                </div>
              </div>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'hsl(var(--muted))', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Se eliminará el pedido permanentemente y se restaurará el stock de los productos incluidos. Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={deleteOrder}
                disabled={deleting}
              >
                {deleting ? (
                  <span style={{ width: 14, height: 14, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                ) : (
                  <><Trash2 size={14} /> Eliminar</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }
        @keyframes pulseOnline {
          0%,100% { box-shadow: 0 0 0 0 hsl(262 80% 55% / 0.4); }
          50%     { box-shadow: 0 0 0 6px hsl(262 80% 55% / 0); }
        }
        .badge-online {
          background: hsl(262 80% 55%);
          color: white;
          border: 1px solid hsl(262 80% 65%);
        }
      `}</style>
    </div>
  );
}
