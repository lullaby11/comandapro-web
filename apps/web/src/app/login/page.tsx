'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Lock, Mail, Building2, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: 'admin@pizzeria-bella.com',
    password: 'admin1234',
    businessSlug: 'pizzeria-bella',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${''}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Error de autenticación');
      }

      const data = await res.json();
      localStorage.setItem('token', data.token);
      localStorage.setItem('business', JSON.stringify(data.business));
      localStorage.setItem('user', JSON.stringify(data.user));

      toast.success(`¡Bienvenido, ${data.user.name}!`);
      router.push('/dashboard/orders/new');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'radial-gradient(ellipse at 20% 60%, hsl(var(--primary) / 0.1) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, hsl(var(--accent) / 0.08) 0%, transparent 50%), hsl(var(--bg))',
      }}
    >
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <img
            src="/olyda.png"
            alt="Olyda"
            style={{ height: 72, width: 'auto', objectFit: 'contain', marginBottom: '1.25rem' }}
          />
          <p style={{ color: 'hsl(var(--muted))', marginTop: '0.4rem', fontSize: '0.9375rem' }}>
            Sistema de gestión de pedidos
          </p>
        </div>

        {/* Form Card */}
        <div className="card-glass animate-fade-up" style={{ padding: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>
            Iniciar sesión
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label htmlFor="businessSlug">Local (slug)</label>
              <div style={{ position: 'relative' }}>
                <Building2
                  size={16}
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted))' }}
                />
                <input
                  id="businessSlug"
                  type="text"
                  placeholder="mi-restaurante"
                  value={formData.businessSlug}
                  onChange={(e) => setFormData({ ...formData, businessSlug: e.target.value })}
                  style={{ paddingLeft: '2.25rem' }}
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="email">Email</label>
              <div style={{ position: 'relative' }}>
                <Mail
                  size={16}
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted))' }}
                />
                <input
                  id="email"
                  type="email"
                  placeholder="admin@local.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{ paddingLeft: '2.25rem' }}
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password">Contraseña</label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={16}
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted))' }}
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  style={{ paddingLeft: '2.25rem', paddingRight: '2.5rem' }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted))',
                    padding: 2,
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              id="login-submit"
              style={{ marginTop: '0.5rem', justifyContent: 'center' }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: 16, height: 16, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                  Entrando…
                </span>
              ) : (
                'Entrar al panel'
              )}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'hsl(var(--muted))', fontSize: '0.8125rem' }}>
          ¿Nuevo local?{' '}
          <a href="/register" style={{ color: 'hsl(var(--primary))', fontWeight: 600, textDecoration: 'none' }}>
            Regístralo aquí
          </a>
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
