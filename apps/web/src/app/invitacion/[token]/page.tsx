'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { UserPlus, AlertCircle, Store } from 'lucide-react';
import toast from 'react-hot-toast';

const API = '';

type Rol = 'OWNER' | 'ADMIN' | 'STAFF';

const ETIQUETA_ROL: Record<Rol, string> = {
  OWNER: 'propietario',
  ADMIN: 'administrador',
  STAFF: 'empleado',
};

interface Invitacion {
  email: string;
  role: Rol;
  business: { name: string; slug: string };
  hasAccount: boolean;
  name: string | null;
}

export default function AceptarInvitacionPage() {
  const router = useRouter();
  const { token } = useParams<{ token: string }>();

  const [invitacion, setInvitacion] = useState<Invitacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch(`${API}/api/invitations/${token}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Esta invitación no es válida');
          return;
        }
        setInvitacion(data);
        setNombre(data.name ?? '');
      } catch {
        setError('No se pudo comprobar la invitación. Revisa tu conexión.');
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [token]);

  async function aceptar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const cuerpo = invitacion?.hasAccount ? {} : { name: nombre.trim(), password };

      const res = await fetch(`${API}/api/invitations/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo aceptar la invitación');

      // Se entra directamente: quien acepta ya tiene sesión iniciada
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('business', JSON.stringify(data.business));

      toast.success(`¡Bienvenida a ${data.business.name}!`);
      router.push('/dashboard');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al aceptar');
      setEnviando(false);
    }
  }

  const contenedor: React.CSSProperties = {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
  };

  if (cargando) {
    return (
      <div style={contenedor}>
        <div style={{ width: 360, height: 200, borderRadius: 16, background: 'hsl(var(--surface2))', opacity: 0.5 }} />
      </div>
    );
  }

  if (error || !invitacion) {
    return (
      <div style={contenedor}>
        <div className="card" style={{ padding: '2rem', maxWidth: 420, textAlign: 'center' }}>
          <AlertCircle size={36} style={{ color: 'hsl(var(--danger))', margin: '0 auto 1rem' }} />
          <h1 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Invitación no válida
          </h1>
          <p style={{ color: 'hsl(var(--muted))', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            {error}
          </p>
          <p style={{ color: 'hsl(var(--muted))', fontSize: '0.8125rem', lineHeight: 1.55 }}>
            Pide a quien te invitó que te envíe una nueva. Las invitaciones caducan a los 7 días.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={contenedor}>
      <form onSubmit={aceptar} className="card" style={{ padding: '2rem', width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, margin: '0 auto 1rem',
            background: 'hsl(var(--primary) / 0.15)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Store size={24} style={{ color: 'hsl(var(--primary))' }} />
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Únete a {invitacion.business.name}
          </h1>
          <p style={{ color: 'hsl(var(--muted))', fontSize: '0.9375rem', lineHeight: 1.55 }}>
            Te han invitado como <strong>{ETIQUETA_ROL[invitacion.role]}</strong>
          </p>
          <p style={{ color: 'hsl(var(--muted))', fontSize: '0.8125rem', marginTop: '0.375rem' }}>
            {invitacion.email}
          </p>
        </div>

        {invitacion.hasAccount ? (
          <p style={{ color: 'hsl(var(--muted))', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem', textAlign: 'center' }}>
            Ya tienes cuenta en Olyda, así que solo tienes que confirmar. Entrarás con tu contraseña de siempre.
          </p>
        ) : (
          <>
            <label style={{ display: 'block', fontSize: '0.8125rem', color: 'hsl(var(--muted))', marginBottom: '0.375rem' }}>
              Tu nombre
            </label>
            <input
              required
              minLength={2}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre y apellido"
              style={{ marginBottom: '1rem' }}
            />

            <label style={{ display: 'block', fontSize: '0.8125rem', color: 'hsl(var(--muted))', marginBottom: '0.375rem' }}>
              Contraseña
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Al menos 8 caracteres"
              style={{ marginBottom: '1.5rem' }}
            />
          </>
        )}

        <button type="submit" className="btn btn-primary btn-lg" disabled={enviando} style={{ width: '100%' }}>
          <UserPlus size={17} />
          {enviando ? 'Entrando…' : 'Aceptar invitación'}
        </button>
      </form>
    </div>
  );
}
