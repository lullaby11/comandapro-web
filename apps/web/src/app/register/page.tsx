'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ShoppingBag, Building2, User, Mail, Lock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const API = '';

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    businessName: '',
    businessSlug: '',
    userName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  function handleName(name: string) {
    const slug = name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 50);
    setForm({ ...form, businessName: name, businessSlug: slug });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: form.businessName,
          businessSlug: form.businessSlug,
          userName: form.userName,
          email: form.email,
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error registrando');

      localStorage.setItem('token', data.token);
      localStorage.setItem('business', JSON.stringify(data.business));
      localStorage.setItem('user', JSON.stringify(data.user));

      toast.success('¡Local registrado con éxito!');
      router.push('/dashboard');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error del servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '1.5rem',
        background: 'radial-gradient(ellipse at 80% 20%, hsl(262 83% 66% / 0.1) 0%, transparent 55%), hsl(222 47% 8%)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, hsl(262 83% 66%), hsl(262 83% 50%))', boxShadow: '0 8px 24px hsl(262 83% 66% / 0.35)', marginBottom: '1rem' }}>
            <ShoppingBag size={28} color="white" />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>
            Registra tu local en <span style={{ color: 'hsl(262 83% 66%)' }}>ComandaPro</span>
          </h1>
          <p style={{ color: 'hsl(220 18% 60%)', marginTop: '0.4rem', fontSize: '0.9rem' }}>
            Comienza gratis, sin tarjeta de crédito
          </p>
        </div>

        <div className="card-glass animate-fade-up" style={{ padding: '2rem' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Business */}
            <div style={{ paddingBottom: '0.5rem', borderBottom: '1px solid hsl(222 30% 20%)', marginBottom: '0.25rem' }}>
              <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'hsl(262 83% 66%)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Tu local
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div>
                  <label htmlFor="businessName">Nombre del restaurante / local *</label>
                  <div style={{ position: 'relative' }}>
                    <Building2 size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 50%)' }} />
                    <input id="businessName" type="text" required value={form.businessName} onChange={(e) => handleName(e.target.value)} placeholder="Pizzería Bella Italia" style={{ paddingLeft: '2.1rem' }} />
                  </div>
                </div>
                <div>
                  <label htmlFor="businessSlug">URL del local (slug) *</label>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid hsl(222 30% 20%)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'hsl(222 40% 15%)' }}>
                    <span style={{ padding: '0.625rem 0.75rem', color: 'hsl(220 18% 45%)', fontSize: '0.875rem', flexShrink: 0, borderRight: '1px solid hsl(222 30% 20%)' }}>
                      comandapro.app/
                    </span>
                    <input
                      id="businessSlug"
                      type="text"
                      required
                      value={form.businessSlug}
                      onChange={(e) => setForm({ ...form, businessSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                      style={{ border: 'none', borderRadius: 0, background: 'transparent', boxShadow: 'none' }}
                      placeholder="pizzeria-bella"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Owner */}
            <div>
              <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'hsl(38 95% 56%)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Tu cuenta
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div>
                  <label htmlFor="userName">Tu nombre *</label>
                  <div style={{ position: 'relative' }}>
                    <User size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 50%)' }} />
                    <input id="userName" type="text" required value={form.userName} onChange={(e) => setForm({ ...form, userName: e.target.value })} placeholder="Giovanni Rossi" style={{ paddingLeft: '2.1rem' }} />
                  </div>
                </div>
                <div>
                  <label htmlFor="email">Email *</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 50%)' }} />
                    <input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="admin@mi-local.com" style={{ paddingLeft: '2.1rem' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label htmlFor="password">Contraseña *</label>
                    <div style={{ position: 'relative' }}>
                      <Lock size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 50%)' }} />
                      <input id="password" type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mín. 8 chars" style={{ paddingLeft: '2.1rem' }} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="confirmPassword">Confirmar *</label>
                    <div style={{ position: 'relative' }}>
                      <Lock size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 50%)' }} />
                      <input id="confirmPassword" type="password" required value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} placeholder="Repite" style={{ paddingLeft: '2.1rem' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              id="register-submit"
              style={{ marginTop: '0.5rem', justifyContent: 'center' }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: 16, height: 16, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                  Creando tu local…
                </span>
              ) : (
                '🚀 Crear mi local gratis'
              )}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.8125rem', color: 'hsl(220 18% 55%)' }}>
          <Link href="/login" style={{ color: 'hsl(262 83% 66%)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={13} /> Volver al inicio de sesión
          </Link>
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
