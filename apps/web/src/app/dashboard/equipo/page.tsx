'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, UserPlus, Mail, Shield, X, Check, Trash2, Clock, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiRes } from '@/lib/api';


type Rol = 'OWNER' | 'ADMIN' | 'STAFF';

interface Miembro {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Rol;
  disabledAt: string | null;
  isMe: boolean;
  joinedAt: string;
}

interface Invitacion {
  id: string;
  email: string;
  role: Rol;
  expiresAt: string;
  createdAt: string;
}

const ROLES: Record<Rol, { etiqueta: string; descripcion: string; badge: string }> = {
  OWNER: {
    etiqueta: 'Propietario',
    descripcion: 'Control total, incluida la gestión del equipo y la facturación',
    badge: 'badge-primary',
  },
  ADMIN: {
    etiqueta: 'Administrador',
    descripcion: 'Configuración, productos, tarifas y borrado de pedidos',
    badge: 'badge-info',
  },
  STAFF: {
    etiqueta: 'Empleado',
    descripcion: 'Toma pedidos, cambia estados e imprime comandas',
    badge: 'badge-muted',
  },
};

export default function EquipoPage() {
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinPermiso, setSinPermiso] = useState(false);

  const [mostrarInvitar, setMostrarInvitar] = useState(false);
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [nuevoRol, setNuevoRol] = useState<'ADMIN' | 'STAFF'>('STAFF');
  const [invitando, setInvitando] = useState(false);

  const [confirmarQuitar, setConfirmarQuitar] = useState<Miembro | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await apiRes(`/api/users`);
      if (res.status === 403) {
        setSinPermiso(true);
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMiembros(data.members);
      setInvitaciones(data.invitations);
    } catch {
      toast.error('No se pudo cargar el equipo');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function invitar(e: React.FormEvent) {
    e.preventDefault();
    setInvitando(true);
    try {
      const res = await apiRes(`/api/users/invite`, { method: 'POST', body: { email: nuevoEmail.trim(), role: nuevoRol } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo enviar la invitación');

      toast.success(data.reactivated ? 'Acceso reactivado' : `Invitación enviada a ${nuevoEmail}`);
      setNuevoEmail('');
      setMostrarInvitar(false);
      cargar();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al invitar');
    } finally {
      setInvitando(false);
    }
  }

  async function cambiarRol(miembro: Miembro, rol: Rol) {
    try {
      const res = await apiRes(`/api/users/${miembro.id}`, { method: 'PATCH', body: { role: rol } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cambiar el rol');
      toast.success(`${miembro.name} ahora es ${ROLES[rol].etiqueta.toLowerCase()}`);
      cargar();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function alternarAcceso(miembro: Miembro) {
    const desactivar = miembro.disabledAt === null;
    try {
      const res = await apiRes(`/api/users/${miembro.id}`, { method: 'PATCH', body: { disabled: desactivar } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cambiar el acceso');
      toast.success(desactivar ? `Acceso de ${miembro.name} desactivado` : `Acceso de ${miembro.name} reactivado`);
      cargar();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function quitar(miembro: Miembro) {
    try {
      const res = await apiRes(`/api/users/${miembro.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'No se pudo quitar del equipo');
      }
      toast.success(`${miembro.name} ya no tiene acceso al local`);
      setConfirmarQuitar(null);
      cargar();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function revocarInvitacion(inv: Invitacion) {
    try {
      const res = await apiRes(`/api/users/invitations/${inv.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Invitación revocada');
      cargar();
    } catch {
      toast.error('No se pudo revocar la invitación');
    }
  }

  if (sinPermiso) {
    return (
      <div style={{ padding: '2rem', maxWidth: 560, margin: '3rem auto', textAlign: 'center' }}>
        <Shield size={40} style={{ color: 'hsl(var(--muted))', marginBottom: '1rem' }} />
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Solo para administración</h1>
        <p style={{ color: 'hsl(var(--muted))', fontSize: '0.9375rem', lineHeight: 1.6 }}>
          La gestión del equipo está reservada al propietario y a los administradores del local.
        </p>
      </div>
    );
  }

  if (cargando) {
    return (
      <div style={{ padding: '2rem' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 64, borderRadius: 12, background: 'hsl(var(--surface2))', marginBottom: '0.75rem', opacity: 0.5 }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 880, margin: '0 auto' }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={22} style={{ color: 'hsl(var(--primary))' }} />
            Equipo
          </h1>
          <p style={{ color: 'hsl(var(--muted))', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Quién puede entrar en este local y con qué permisos
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setMostrarInvitar(true)}>
          <UserPlus size={16} /> Invitar
        </button>
      </div>

      {/* Miembros */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {miembros.map((m) => {
          const desactivado = m.disabledAt !== null;
          return (
            <div key={m.id} className="card" style={{ padding: '1rem', opacity: desactivado ? 0.55 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flexWrap: 'wrap' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: 'hsl(var(--surface2))', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 700, fontSize: '0.9375rem',
                }}>
                  {m.name[0]?.toUpperCase() ?? '?'}
                </div>

                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{m.name}</span>
                    {m.isMe && <span className="badge badge-muted">Tú</span>}
                    {desactivado && <span className="badge badge-danger">Sin acceso</span>}
                  </div>
                  <div style={{ color: 'hsl(var(--muted))', fontSize: '0.8125rem' }}>{m.email}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <select
                    value={m.role}
                    onChange={(e) => cambiarRol(m, e.target.value as Rol)}
                    style={{ width: 'auto', minWidth: 150, fontSize: '0.875rem', padding: '0.5rem 0.75rem' }}
                    title={ROLES[m.role].descripcion}
                  >
                    {(Object.keys(ROLES) as Rol[]).map((r) => (
                      <option key={r} value={r}>{ROLES[r].etiqueta}</option>
                    ))}
                  </select>

                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => alternarAcceso(m)}
                    title={desactivado ? 'Reactivar acceso' : 'Desactivar acceso'}
                  >
                    {desactivado ? <Check size={15} /> : <X size={15} />}
                  </button>

                  {!m.isMe && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setConfirmarQuitar(m)}
                      title="Quitar del local"
                      style={{ color: 'hsl(var(--danger))' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Invitaciones pendientes */}
      {invitaciones.length > 0 && (
        <>
          <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: '2rem 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={16} style={{ color: 'hsl(var(--warning))' }} />
            Invitaciones pendientes
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {invitaciones.map((inv) => (
              <div key={inv.id} className="card" style={{ padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Mail size={16} style={{ color: 'hsl(var(--muted))', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 160, fontSize: '0.9375rem' }}>{inv.email}</span>
                <span className={`badge ${ROLES[inv.role].badge}`}>{ROLES[inv.role].etiqueta}</span>
                <span style={{ color: 'hsl(var(--muted))', fontSize: '0.75rem' }}>
                  caduca el {new Date(inv.expiresAt).toLocaleDateString('es-ES')}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => revocarInvitacion(inv)} title="Revocar">
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Leyenda de roles */}
      <div className="card" style={{ padding: '1rem', marginTop: '2rem', background: 'hsl(var(--surface2) / 0.4)' }}>
        <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.625rem', color: 'hsl(var(--muted))' }}>
          QUÉ PUEDE HACER CADA ROL
        </h3>
        {(Object.keys(ROLES) as Rol[]).map((r) => (
          <div key={r} style={{ display: 'flex', gap: '0.625rem', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
            <span className={`badge ${ROLES[r].badge}`} style={{ flexShrink: 0, minWidth: 104, justifyContent: 'center' }}>
              {ROLES[r].etiqueta}
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted))', lineHeight: 1.5 }}>
              {ROLES[r].descripcion}
            </span>
          </div>
        ))}
      </div>

      {/* Modal de invitación */}
      {mostrarInvitar && (
        <div
          onClick={() => setMostrarInvitar(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={invitar}
            className="card"
            style={{ padding: '1.5rem', width: '100%', maxWidth: 420 }}
          >
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, marginBottom: '1rem' }}>Invitar al equipo</h2>

            <label style={{ display: 'block', fontSize: '0.8125rem', color: 'hsl(var(--muted))', marginBottom: '0.375rem' }}>
              Correo electrónico
            </label>
            <input
              type="email"
              required
              autoFocus
              value={nuevoEmail}
              onChange={(e) => setNuevoEmail(e.target.value)}
              placeholder="persona@ejemplo.com"
              style={{ marginBottom: '1rem' }}
            />

            <label style={{ display: 'block', fontSize: '0.8125rem', color: 'hsl(var(--muted))', marginBottom: '0.375rem' }}>
              Rol
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {(['STAFF', 'ADMIN'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`btn ${nuevoRol === r ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setNuevoRol(r)}
                  style={{ flex: 1 }}
                >
                  {ROLES[r].etiqueta}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted))', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              {ROLES[nuevoRol].descripcion}. Recibirá un correo con un enlace para unirse, válido durante 7 días.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setMostrarInvitar(false)} style={{ flex: 1 }}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={invitando} style={{ flex: 1 }}>
                {invitando ? 'Enviando…' : 'Enviar invitación'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmación de quitar */}
      {confirmarQuitar && (
        <div
          onClick={() => setConfirmarQuitar(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}
        >
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ padding: '1.5rem', width: '100%', maxWidth: 400 }}>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              <AlertCircle size={20} style={{ color: 'hsl(var(--danger))', flexShrink: 0, marginTop: 2 }} />
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.375rem' }}>
                  ¿Quitar a {confirmarQuitar.name} del local?
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted))', lineHeight: 1.55 }}>
                  Perderá el acceso inmediatamente. Su cuenta no se borra, así que podrás volver a invitarla
                  cuando quieras. Si solo quieres suspender el acceso temporalmente, usa el botón de desactivar.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmarQuitar(null)} style={{ flex: 1 }}>
                Cancelar
              </button>
              <button className="btn btn-danger" onClick={() => quitar(confirmarQuitar)} style={{ flex: 1 }}>
                Quitar del local
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
