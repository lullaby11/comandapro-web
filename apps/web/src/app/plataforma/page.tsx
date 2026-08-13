'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Store, Ban, CheckCircle2, Search, Activity,
  ScrollText, LogOut, AlertCircle, TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Panel de administración de la plataforma.
 *
 * Vive fuera de `/dashboard` y usa su propia clave de sesión: un administrador de
 * plataforma no pertenece a ningún local, y mezclar ambas sesiones en `token` haría que
 * entrar aquí cerrara la sesión del panel de un local, o peor, que se enviara el token
 * equivocado a la API.
 */
const CLAVE_SESION = 'platformToken';

interface Local {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  onlineOrderEnabled: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  pedidos30d: number;
  usuarios: number;
  ultimoPedido: string | null;
}

interface Metricas {
  locales: {
    total: number;
    activos30d: number;
    suspendidos: number;
    conTiendaOnline: number;
    altasUltimos30d: number;
    conServicioAbiertoAhora: number;
  };
  pedidos: { ultimos30d: number; ultimos7d: number };
}

interface Auditoria {
  id: string;
  adminEmail: string;
  action: string;
  businessName: string | null;
  detail: string | null;
  createdAt: string;
}

const ETIQUETA_ACCION: Record<string, string> = {
  login: 'Inicio de sesión',
  suspender_local: 'Suspendió un local',
  reactivar_local: 'Reactivó un local',
  conceder_acceso_plataforma: 'Concedió acceso de plataforma',
  revocar_acceso_plataforma: 'Revocó acceso de plataforma',
};

async function apiPlataforma(ruta: string, opciones: Omit<RequestInit, 'body'> & { body?: unknown } = {}) {
  const token = localStorage.getItem(CLAVE_SESION);
  const { body, ...resto } = opciones;

  const res = await fetch(`/api/platform${ruta}`, {
    ...resto,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem(CLAVE_SESION);
    window.location.reload();
    throw new Error('Sesión de plataforma caducada');
  }

  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error ?? `Error ${res.status}`);
  return datos;
}

export default function PlataformaPage() {
  const [autenticado, setAutenticado] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [entrando, setEntrando] = useState(false);

  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [locales, setLocales] = useState<Local[]>([]);
  const [auditoria, setAuditoria] = useState<Auditoria[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [pestana, setPestana] = useState<'locales' | 'auditoria'>('locales');
  const [suspendiendo, setSuspendiendo] = useState<Local | null>(null);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    setAutenticado(Boolean(localStorage.getItem(CLAVE_SESION)));
  }, []);

  const cargar = useCallback(async () => {
    try {
      const [m, l, a] = await Promise.all([
        apiPlataforma('/metrics'),
        apiPlataforma(`/businesses${busqueda ? `?q=${encodeURIComponent(busqueda)}` : ''}`),
        apiPlataforma('/audit?limit=80'),
      ]);
      setMetricas(m);
      setLocales(l.businesses);
      setAuditoria(a.entries);
    } catch (err: unknown) {
      if (err instanceof Error && !err.message.includes('caducada')) toast.error(err.message);
    }
  }, [busqueda]);

  useEffect(() => {
    if (autenticado) cargar();
  }, [autenticado, cargar]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    try {
      const res = await fetch('/api/platform/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const datos = await res.json();
      if (!res.ok) throw new Error(datos.error ?? 'No se pudo entrar');

      localStorage.setItem(CLAVE_SESION, datos.token);
      setAutenticado(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setEntrando(false);
    }
  }

  async function suspender() {
    if (!suspendiendo) return;
    try {
      const datos = await apiPlataforma(`/businesses/${suspendiendo.id}/suspend`, {
        method: 'POST',
        body: { reason: motivo.trim() },
      });
      toast.success(datos.message, { duration: 6000 });
      setSuspendiendo(null);
      setMotivo('');
      cargar();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function reactivar(local: Local) {
    try {
      const datos = await apiPlataforma(`/businesses/${local.id}/reactivate`, { method: 'POST' });
      toast.success(datos.message);
      cargar();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  if (autenticado === null) return null;

  // ─── Identificación ────────────────────────────────────────────────────────
  if (!autenticado) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <form onSubmit={entrar} className="card" style={{ padding: '2rem', width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <Shield size={32} style={{ color: 'hsl(var(--primary))', marginBottom: '0.75rem' }} />
            <h1 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Administración de Olyda</h1>
            <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted))', marginTop: '0.375rem' }}>
              Acceso restringido al equipo de la plataforma
            </p>
          </div>

          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo" style={{ marginBottom: '0.75rem' }} autoComplete="username" />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña" style={{ marginBottom: '1.25rem' }} autoComplete="current-password" />

          <button type="submit" className="btn btn-primary" disabled={entrando} style={{ width: '100%' }}>
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    );
  }

  // ─── Panel ─────────────────────────────────────────────────────────────────
  const tarjetas = metricas
    ? [
        { etiqueta: 'Locales', valor: metricas.locales.total, pie: `${metricas.locales.altasUltimos30d} altas en 30 d`, icono: Store },
        { etiqueta: 'Activos (30 d)', valor: metricas.locales.activos30d, pie: 'con algún pedido', icono: TrendingUp },
        { etiqueta: 'Sirviendo ahora', valor: metricas.locales.conServicioAbiertoAhora, pie: 'con servicio abierto', icono: Activity },
        { etiqueta: 'Pedidos (30 d)', valor: metricas.pedidos.ultimos30d, pie: `${metricas.pedidos.ultimos7d} en 7 d`, icono: Activity },
        { etiqueta: 'Tienda online', valor: metricas.locales.conTiendaOnline, pie: 'locales con venta online', icono: Store },
        { etiqueta: 'Suspendidos', valor: metricas.locales.suspendidos, pie: 'sin poder operar', icono: Ban },
      ]
    : [];

  return (
    <div style={{ minHeight: '100dvh', padding: '1.5rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={22} style={{ color: 'hsl(var(--primary))' }} />
            Administración de Olyda
          </h1>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { localStorage.removeItem(CLAVE_SESION); setAutenticado(false); }}
          >
            <LogOut size={15} /> Salir
          </button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.75rem' }}>
          {tarjetas.map((t) => (
            <div key={t.etiqueta} className="card" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'hsl(var(--muted))', fontSize: '0.75rem', marginBottom: '0.375rem' }}>
                <t.icono size={13} /> {t.etiqueta}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{t.valor}</div>
              <div style={{ fontSize: '0.6875rem', color: 'hsl(var(--muted))' }}>{t.pie}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${pestana === 'locales' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPestana('locales')}>
            <Store size={15} /> Locales
          </button>
          <button className={`btn btn-sm ${pestana === 'auditoria' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPestana('auditoria')}>
            <ScrollText size={15} /> Auditoría
          </button>
        </div>

        {pestana === 'locales' && (
          <>
            <div style={{ position: 'relative', marginBottom: '1rem', maxWidth: 360 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted))' }} />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o identificador" style={{ paddingLeft: '2.25rem' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {locales.map((l) => (
                <div key={l.id} className="card" style={{ padding: '1rem', opacity: l.suspendedAt ? 0.7 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600 }}>{l.name}</span>
                        <span className="badge badge-muted">{l.slug}</span>
                        {l.suspendedAt && <span className="badge badge-danger">Suspendido</span>}
                        {l.onlineOrderEnabled && <span className="badge badge-info">Tienda online</span>}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'hsl(var(--muted))', marginTop: '0.25rem' }}>
                        {l.pedidos30d} pedidos en 30 d · {l.usuarios} usuario(s) ·{' '}
                        {l.ultimoPedido ? `último pedido ${new Date(l.ultimoPedido).toLocaleDateString('es-ES')}` : 'sin pedidos'}
                      </div>
                      {l.suspendedReason && (
                        <div style={{ fontSize: '0.75rem', color: 'hsl(var(--danger))', marginTop: '0.25rem' }}>
                          Motivo: {l.suspendedReason}
                        </div>
                      )}
                    </div>

                    {l.suspendedAt ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => reactivar(l)}>
                        <CheckCircle2 size={15} /> Reactivar
                      </button>
                    ) : (
                      <button className="btn btn-ghost btn-sm" style={{ color: 'hsl(var(--danger))' }} onClick={() => setSuspendiendo(l)}>
                        <Ban size={15} /> Suspender
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {locales.length === 0 && (
                <p style={{ color: 'hsl(var(--muted))', fontSize: '0.875rem', padding: '2rem', textAlign: 'center' }}>
                  No hay locales que coincidan.
                </p>
              )}
            </div>
          </>
        )}

        {pestana === 'auditoria' && (
          <div className="card" style={{ padding: '0.5rem 1rem' }}>
            {auditoria.map((a) => (
              <div key={a.id} style={{ padding: '0.625rem 0', borderBottom: '1px solid hsl(var(--border))', fontSize: '0.8125rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <span>
                    <strong>{ETIQUETA_ACCION[a.action] ?? a.action}</strong>
                    {a.businessName && <> · {a.businessName}</>}
                  </span>
                  <span style={{ color: 'hsl(var(--muted))', fontSize: '0.75rem' }}>
                    {new Date(a.createdAt).toLocaleString('es-ES')}
                  </span>
                </div>
                <div style={{ color: 'hsl(var(--muted))', fontSize: '0.75rem' }}>
                  {a.adminEmail}{a.detail && <> — {a.detail}</>}
                </div>
              </div>
            ))}
            {auditoria.length === 0 && (
              <p style={{ color: 'hsl(var(--muted))', fontSize: '0.875rem', padding: '1.5rem', textAlign: 'center' }}>
                Todavía no hay actividad registrada.
              </p>
            )}
          </div>
        )}
      </div>

      {suspendiendo && (
        <div
          onClick={() => setSuspendiendo(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ padding: '1.5rem', width: '100%', maxWidth: 440 }}>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              <AlertCircle size={20} style={{ color: 'hsl(var(--danger))', flexShrink: 0, marginTop: 2 }} />
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.375rem' }}>
                  Suspender {suspendiendo.name}
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted))', lineHeight: 1.55 }}>
                  Su equipo dejará de poder entrar <strong>de inmediato</strong>, aunque tengan la
                  sesión abierta, y su tienda online quedará cerrada. Los datos no se tocan y la
                  suspensión se puede revertir.
                </p>
              </div>
            </div>

            <label style={{ display: 'block', fontSize: '0.8125rem', color: 'hsl(var(--muted))', marginBottom: '0.375rem' }}>
              Motivo (queda registrado en la auditoría)
            </label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: impago de la cuota de julio" autoFocus style={{ marginBottom: '1.25rem' }} />

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-ghost" onClick={() => setSuspendiendo(null)} style={{ flex: 1 }}>Cancelar</button>
              <button className="btn btn-danger" disabled={motivo.trim().length < 3} onClick={suspender} style={{ flex: 1 }}>
                Suspender
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
