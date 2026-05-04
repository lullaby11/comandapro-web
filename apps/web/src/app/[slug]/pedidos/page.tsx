'use client';

import { Fragment, useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Check, ChevronLeft, Plus, Minus, Trash2, Search,
  User, Mail, Phone, MapPin, Lock, Eye, EyeOff,
  ShoppingCart, Truck, AlertCircle, CheckCircle2,
  Store, Globe,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface BusinessInfo { name: string; logoUrl?: string; address?: string }
interface Product { id: string; name: string; description?: string; price: number; stock: number; category?: string }
interface CartItem extends Product { quantity: number }
interface ShippingRate { id: string; name: string; price: number }

type Step = 1 | 2 | 3;
type AuthView = 'login' | 'register' | 'verify-pending';
type CustomerSession = { token: string; name: string; email: string; address: string };

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

function apiPublic(slug: string) {
  return `${API}/api/public/${slug}`;
}

// ─── Step Indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: Step }) {
  const labels = ['Mi cuenta', 'Productos', 'Confirmar'];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '0.75rem 1.5rem 1rem' }}>
      {labels.map((label, i) => {
        const num = i + 1;
        const done = step > num;
        const active = step === num;
        return (
          <Fragment key={num}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: done ? 'hsl(142 71% 45%)' : active ? 'hsl(262 80% 55%)' : 'hsl(222 30% 18%)',
                border: `2px solid ${done ? 'hsl(142 71% 45%)' : active ? 'hsl(262 80% 55%)' : 'hsl(222 30% 25%)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: '0.8rem',
                color: done || active ? 'white' : 'hsl(220 18% 45%)',
                transition: 'all 0.25s', flexShrink: 0,
              }}>
                {done ? <Check size={14} /> : num}
              </div>
              <span style={{
                fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap',
                color: active ? 'hsl(262 80% 70%)' : done ? 'hsl(142 71% 45%)' : 'hsl(220 18% 45%)',
              }}>
                {label}
              </span>
            </div>
            {i < 2 && (
              <div style={{ flex: 1, height: 2, minWidth: 20, marginTop: 13, background: done ? 'hsl(142 71% 45%)' : 'hsl(222 30% 20%)', transition: 'background 0.3s' }} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PublicStorePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;

  // Business state
  const [business, setBusiness]       = useState<BusinessInfo | null>(null);
  const [serviceActive, setServiceActive] = useState(false);
  const [loading, setLoading]         = useState(true);

  // Auth state
  const [step, setStep]               = useState<Step>(1);
  const [authView, setAuthView]       = useState<AuthView>('login');
  const [session, setSession]         = useState<CustomerSession | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Register form
  const [reg, setReg] = useState({ name: '', phone: '', email: '', address: '', password: '', confirm: '' });
  // Login form
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [authLoading, setAuthLoading] = useState(false);

  // Products
  const [products, setProducts]       = useState<Product[]>([]);
  const [categories, setCategories]   = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Cart
  const [cart, setCart]               = useState<CartItem[]>([]);
  const [orderNotes, setOrderNotes]   = useState('');

  // Shipping & payment
  const [isPickup, setIsPickup]       = useState(false);
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [selectedRateId, setSelectedRateId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');

  // Order done
  const [orderDone, setOrderDone]     = useState(false);
  const [orderRef, setOrderRef]       = useState('');
  const [submitting, setSubmitting]   = useState(false);

  // ── Load business info ──────────────────────────────────────────────────────
  useEffect(() => {
    async function loadBusiness() {
      try {
        const res = await fetch(apiPublic(slug));
        if (!res.ok) { setLoading(false); return; }
        const data = await res.json();
        setBusiness(data.business);
        setServiceActive(data.serviceActive);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    loadBusiness();
  }, [slug]);

  // ── Check stored session ────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(`customer_session_${slug}`);
    if (stored) {
      try {
        const s: CustomerSession = JSON.parse(stored);
        setSession(s);
      } catch { /* ignore */ }
    }
  }, [slug]);

  // ── Handle email verification token in URL ──────────────────────────────────
  useEffect(() => {
    const verifyToken = searchParams.get('verify');
    if (!verifyToken) return;

    async function verify() {
      try {
        const res = await fetch(`${apiPublic(slug)}/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: verifyToken }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? 'Enlace inválido o expirado');
          setAuthView('register');
          return;
        }
        const s: CustomerSession = { token: data.token, name: data.name, email: data.email, address: data.address };
        setSession(s);
        localStorage.setItem(`customer_session_${slug}`, JSON.stringify(s));
        toast.success('¡Email verificado! Ya puedes hacer tu pedido.');
        // Remove verify param from URL without reload
        window.history.replaceState({}, '', `/${slug}/pedidos`);
      } catch {
        toast.error('Error verificando email');
      }
    }
    verify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load products & shipping rates ──────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [prodRes, ratesRes] = await Promise.all([
          fetch(`${apiPublic(slug)}/products`),
          fetch(`${apiPublic(slug)}/shipping-rates`),
        ]);
        if (prodRes.ok) {
          const data: Product[] = await prodRes.json();
          setProducts(data);
          setCategories(['all', ...Array.from(new Set(data.map((p) => p.category ?? 'Sin categoría')))]);
        }
        if (ratesRes.ok) setShippingRates(await ratesRes.json());
      } catch { /* ignore */ } finally {
        setLoadingProducts(false);
      }
    }
    load();
  }, [slug]);

  // ── Auth handlers ───────────────────────────────────────────────────────────
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (reg.password !== reg.confirm) { toast.error('Las contraseñas no coinciden'); return; }
    if (reg.password.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return; }
    setAuthLoading(true);
    try {
      const res = await fetch(`${apiPublic(slug)}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: reg.name, phone: reg.phone, email: reg.email, address: reg.address, password: reg.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'EMAIL_UNVERIFIED') { setAuthView('verify-pending'); return; }
        toast.error(data.error ?? 'Error al registrarse');
        return;
      }
      setAuthView('verify-pending');
    } catch {
      toast.error('Error de conexión');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const res = await fetch(`${apiPublic(slug)}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'EMAIL_UNVERIFIED') {
          toast.error('Verifica tu email antes de iniciar sesión.');
          return;
        }
        toast.error(data.error ?? 'Email o contraseña incorrectos');
        return;
      }
      const s: CustomerSession = { token: data.token, name: data.name, email: data.email, address: data.address };
      setSession(s);
      localStorage.setItem(`customer_session_${slug}`, JSON.stringify(s));
      toast.success(`¡Bienvenido, ${data.name}!`);
    } catch {
      toast.error('Error de conexión');
    } finally {
      setAuthLoading(false);
    }
  }

  function logout() {
    setSession(null);
    localStorage.removeItem(`customer_session_${slug}`);
    setCart([]);
    setStep(1);
  }

  // ── Cart handlers ───────────────────────────────────────────────────────────
  function addToCart(product: Product) {
    if (product.stock === 0) return;
    setCart((prev) => {
      const exists = prev.find((i) => i.id === product.id);
      if (exists) {
        if (exists.quantity >= product.stock) { toast.error(`Stock máximo: ${product.stock}`); return prev; }
        return prev.map((i) => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }

  function updateQty(id: string, delta: number) {
    setCart((prev) =>
      prev.map((i) => i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)
          .filter((i) => i.quantity > 0)
    );
  }

  const subtotal    = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount   = cart.reduce((s, i) => s + i.quantity, 0);
  const selectedRate = shippingRates.find((r) => r.id === selectedRateId);
  const shippingCost = !isPickup && selectedRate ? Number(selectedRate.price) : 0;
  const total       = subtotal + shippingCost;

  const filteredProducts = products.filter((p) => {
    const matchCat    = activeCategory === 'all' || (p.category ?? 'Sin categoría') === activeCategory;
    const matchSearch = !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  // ── Submit order ────────────────────────────────────────────────────────────
  async function submitOrder() {
    if (!session) return;
    if (cart.length === 0) { toast.error('El carrito está vacío'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${apiPublic(slug)}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          isPickup,
          notes: orderNotes || undefined,
          paymentMethod,
          shippingRateId: !isPickup && selectedRateId ? selectedRateId : undefined,
          items: cart.map((i) => ({ productId: i.id, quantity: i.quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.details) {
          toast.error(`Stock insuficiente: ${data.details.map((d: { productName: string }) => d.productName).join(', ')}`);
        } else {
          toast.error(data.error ?? 'Error al enviar el pedido');
        }
        return;
      }
      setOrderRef(data.ref);
      setOrderDone(true);
    } catch {
      toast.error('Error de conexión');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'hsl(222 47% 9%)' }}>
        <div style={{ width: 40, height: 40, border: '3px solid hsl(262 80% 55%)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ─── Not found ──────────────────────────────────────────────────────────────
  if (!business) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'hsl(222 47% 9%)', padding: '2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <Globe size={48} style={{ color: 'hsl(220 18% 40%)', margin: '0 auto 1.5rem', display: 'block' }} />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Tienda no encontrada</h1>
          <p style={{ color: 'hsl(220 18% 55%)', fontSize: '0.9rem' }}>Esta tienda no existe o no tiene venta online activa.</p>
        </div>
      </div>
    );
  }

  // ─── Closed ─────────────────────────────────────────────────────────────────
  if (!serviceActive) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'hsl(222 47% 9%)' }}>
        <StoreBanner business={business} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto 1.5rem', background: 'hsl(220 18% 18%)', border: '2px solid hsl(220 18% 28%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Store size={32} style={{ color: 'hsl(220 18% 50%)' }} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>Estamos cerrados</h2>
            <p style={{ color: 'hsl(220 18% 55%)', fontSize: '0.9375rem', lineHeight: 1.6 }}>
              En este momento no podemos recibir pedidos.<br />¡Vuelve más tarde!
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Order done ──────────────────────────────────────────────────────────────
  if (orderDone) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'hsl(222 47% 9%)' }}>
        <StoreBanner business={business} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ textAlign: 'center', maxWidth: 480, width: '100%' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', margin: '0 auto 1.5rem', background: 'hsl(142 71% 45% / 0.15)', border: '2px solid hsl(142 71% 45%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={40} style={{ color: 'hsl(142 71% 45%)' }} />
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>¡Pedido recibido!</h2>
            <p style={{ fontSize: '1rem', color: 'hsl(220 18% 60%)', marginBottom: '0.25rem' }}>
              Referencia: <strong style={{ color: 'hsl(262 80% 70%)' }}>#{orderRef}</strong>
            </p>
            <p style={{ fontSize: '0.9375rem', color: 'hsl(220 18% 55%)', marginBottom: '2rem', lineHeight: 1.6 }}>
              Te avisaremos por <strong>WhatsApp y email</strong> en cuanto <strong>{business.name}</strong> confirme tu pedido.
            </p>
            <div style={{ background: 'hsl(222 40% 12%)', border: '1px solid hsl(222 30% 20%)', borderRadius: 12, padding: '1rem', marginBottom: '2rem', fontSize: '0.875rem', color: 'hsl(220 18% 55%)', lineHeight: 1.6 }}>
              📧 Revisa también tu bandeja de entrada — te enviaremos la confirmación cuando el comercio la procese.
            </div>
            <button
              onClick={() => { setOrderDone(false); setCart([]); setStep(2); setOrderRef(''); }}
              style={{ background: 'hsl(262 80% 55%)', color: 'white', border: 'none', borderRadius: 10, padding: '0.875rem 2rem', fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }}
            >
              Hacer otro pedido
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Wizard ─────────────────────────────────────────────────────────────────
  const S = {
    page:   { display: 'flex', flexDirection: 'column' as const, height: '100dvh', background: 'hsl(222 47% 9%)', maxWidth: 640, margin: '0 auto', position: 'relative' as const },
    scroll: { flex: 1, overflowY: 'auto' as const },
    footer: { flexShrink: 0, padding: '1rem 1.25rem', borderTop: '1px solid hsl(222 30% 18%)', background: 'hsl(222 47% 8%)' },
    label:  { display: 'block', fontSize: '0.75rem', fontWeight: 600 as const, color: 'hsl(220 18% 55%)', marginBottom: '0.5rem', textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
    input:  { background: 'hsl(222 40% 13%)', fontSize: '1rem' },
  };

  return (
    <div style={S.page}>
      {/* Fixed header */}
      <div style={{ flexShrink: 0, background: 'hsl(222 47% 9%)', borderBottom: '1px solid hsl(222 30% 18%)' }}>
        <StoreBanner business={business} compact />
        <StepIndicator step={step} />
      </div>

      {/* ══════════ STEP 1: AUTH ══════════ */}
      {step === 1 && (
        <>
          <div style={S.scroll}>
            <div style={{ padding: '1.5rem 1.25rem' }}>

              {session ? (
                /* Already logged in */
                <div>
                  <div style={{ background: 'hsl(142 71% 15% / 0.2)', border: '1px solid hsl(142 71% 45% / 0.4)', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'hsl(142 71% 45% / 0.2)', border: '2px solid hsl(142 71% 45% / 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 700, color: 'hsl(142 71% 45%)', flexShrink: 0 }}>
                          {session.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{session.name}</div>
                          <div style={{ fontSize: '0.8125rem', color: 'hsl(220 18% 55%)', marginTop: 2 }}>{session.email}</div>
                          {session.address && <div style={{ fontSize: '0.75rem', color: 'hsl(220 18% 48%)', marginTop: 1 }}>{session.address}</div>}
                        </div>
                      </div>
                      <button onClick={logout} style={{ background: 'none', border: '1px solid hsl(220 18% 30%)', borderRadius: 6, padding: '0.3rem 0.6rem', color: 'hsl(220 18% 55%)', cursor: 'pointer', fontSize: '0.75rem' }}>
                        Cerrar sesión
                      </button>
                    </div>
                  </div>
                  <p style={{ color: 'hsl(220 18% 55%)', fontSize: '0.875rem', textAlign: 'center' }}>
                    ¡Todo listo! Pulsa continuar para elegir tus productos.
                  </p>
                </div>
              ) : authView === 'verify-pending' ? (
                /* Email verification pending */
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <div style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto 1.5rem', background: 'hsl(262 80% 45% / 0.15)', border: '2px solid hsl(262 80% 55% / 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Mail size={32} style={{ color: 'hsl(262 80% 65%)' }} />
                  </div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>Revisa tu email</h2>
                  <p style={{ color: 'hsl(220 18% 55%)', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                    Te hemos enviado un enlace de verificación. Haz clic en él para activar tu cuenta y continuar con el pedido.
                  </p>
                  <button
                    onClick={() => setAuthView('login')}
                    style={{ background: 'none', border: '1px solid hsl(262 80% 55% / 0.4)', borderRadius: 8, padding: '0.625rem 1.25rem', color: 'hsl(262 80% 65%)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
                  >
                    Ya verifiqué mi email → Iniciar sesión
                  </button>
                </div>
              ) : authView === 'register' ? (
                /* Register form */
                <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Crear cuenta</h2>
                    <p style={{ fontSize: '0.875rem', color: 'hsl(220 18% 50%)', marginBottom: '1rem' }}>Rellena tus datos para hacer el pedido</p>
                  </div>

                  {[
                    { icon: User,  field: 'name',    type: 'text',     placeholder: 'Nombre completo *',       required: true },
                    { icon: Phone, field: 'phone',   type: 'tel',      placeholder: 'Teléfono *',               required: true },
                    { icon: Mail,  field: 'email',   type: 'email',    placeholder: 'Email *',                  required: true },
                    { icon: MapPin,field: 'address', type: 'text',     placeholder: 'Dirección de entrega *',  required: true },
                  ].map(({ icon: Icon, field, type, placeholder, required }) => (
                    <div key={field} style={{ position: 'relative' }}>
                      <Icon size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 50%)', pointerEvents: 'none' }} />
                      <input
                        type={type}
                        placeholder={placeholder}
                        required={required}
                        value={reg[field as keyof typeof reg]}
                        onChange={(e) => setReg({ ...reg, [field]: e.target.value })}
                        style={{ paddingLeft: '2.5rem', ...S.input }}
                      />
                    </div>
                  ))}

                  <div style={{ position: 'relative' }}>
                    <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 50%)', pointerEvents: 'none' }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Contraseña * (mín. 6 caracteres)"
                      required
                      value={reg.password}
                      onChange={(e) => setReg({ ...reg, password: e.target.value })}
                      style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem', ...S.input }}
                    />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(220 18% 50%)' }}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 50%)', pointerEvents: 'none' }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Repetir contraseña *"
                      required
                      value={reg.confirm}
                      onChange={(e) => setReg({ ...reg, confirm: e.target.value })}
                      style={{ paddingLeft: '2.5rem', ...S.input }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    style={{ background: 'hsl(262 80% 55%)', color: 'white', border: 'none', borderRadius: 10, padding: '0.875rem', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  >
                    {authLoading ? <span style={{ width: 18, height: 18, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> : 'Crear cuenta y continuar'}
                  </button>

                  <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'hsl(220 18% 55%)', marginTop: '0.5rem' }}>
                    ¿Ya tienes cuenta?{' '}
                    <button type="button" onClick={() => setAuthView('login')} style={{ background: 'none', border: 'none', color: 'hsl(262 80% 70%)', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                      Iniciar sesión
                    </button>
                  </p>
                </form>
              ) : (
                /* Login form */
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Iniciar sesión</h2>
                    <p style={{ fontSize: '0.875rem', color: 'hsl(220 18% 50%)', marginBottom: '1rem' }}>Accede con tu cuenta para hacer el pedido</p>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 50%)', pointerEvents: 'none' }} />
                    <input
                      type="email"
                      placeholder="Email *"
                      required
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      style={{ paddingLeft: '2.5rem', ...S.input }}
                    />
                  </div>

                  <div style={{ position: 'relative' }}>
                    <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 50%)', pointerEvents: 'none' }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Contraseña *"
                      required
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem', ...S.input }}
                    />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(220 18% 50%)' }}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    style={{ background: 'hsl(262 80% 55%)', color: 'white', border: 'none', borderRadius: 10, padding: '0.875rem', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  >
                    {authLoading ? <span style={{ width: 18, height: 18, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> : 'Entrar'}
                  </button>

                  <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'hsl(220 18% 55%)', marginTop: '0.5rem' }}>
                    ¿No tienes cuenta?{' '}
                    <button type="button" onClick={() => setAuthView('register')} style={{ background: 'none', border: 'none', color: 'hsl(262 80% 70%)', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                      Regístrate
                    </button>
                  </p>
                </form>
              )}
            </div>
          </div>

          <div style={S.footer}>
            <button
              onClick={() => setStep(2)}
              disabled={!session}
              style={{ width: '100%', background: session ? 'hsl(262 80% 55%)' : 'hsl(220 18% 25%)', color: session ? 'white' : 'hsl(220 18% 45%)', border: 'none', borderRadius: 10, padding: '0.875rem', fontWeight: 600, fontSize: '1rem', cursor: session ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'background 0.2s' }}
            >
              {session ? `Elegir productos →` : 'Inicia sesión para continuar'}
            </button>
          </div>
        </>
      )}

      {/* ══════════ STEP 2: PRODUCTS ══════════ */}
      {step === 2 && (
        <>
          <div style={{ flexShrink: 0, padding: '0.875rem 1.25rem 0', background: 'hsl(222 47% 9%)', borderBottom: '1px solid hsl(222 30% 18%)' }}>
            <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Buscar producto…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                style={{ paddingLeft: '2.5rem', background: 'hsl(222 40% 13%)' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.75rem' }}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{ flexShrink: 0, padding: '0.375rem 0.875rem', borderRadius: 20, border: `1px solid ${activeCategory === cat ? 'hsl(262 80% 55%)' : 'hsl(222 30% 25%)'}`, background: activeCategory === cat ? 'hsl(262 80% 55%)' : 'none', color: activeCategory === cat ? 'white' : 'hsl(220 18% 60%)', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  {cat === 'all' ? 'Todos' : cat}
                </button>
              ))}
            </div>
          </div>

          <div style={S.scroll}>
            <div style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
              {loadingProducts ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ height: 96, borderRadius: 12, background: 'hsl(222 40% 13%)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                ))
              ) : filteredProducts.length === 0 ? (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'hsl(220 18% 50%)' }}>
                  No hay productos disponibles
                </div>
              ) : (
                filteredProducts.map((product) => {
                  const inCart = cart.find((i) => i.id === product.id);
                  return (
                    <div
                      key={product.id}
                      onClick={() => addToCart(product)}
                      style={{
                        position: 'relative', borderRadius: 12, padding: '0.875rem', cursor: 'pointer',
                        background: inCart ? 'hsl(262 80% 45% / 0.15)' : 'hsl(222 40% 13%)',
                        border: `1px solid ${inCart ? 'hsl(262 80% 55% / 0.6)' : 'hsl(222 30% 20%)'}`,
                        transition: 'all 0.15s', minHeight: 88,
                      }}
                    >
                      {inCart && (
                        <div style={{ position: 'absolute', top: 8, left: 8, width: 24, height: 24, borderRadius: '50%', background: 'hsl(262 80% 55%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                          {inCart.quantity}
                        </div>
                      )}
                      <div style={{ paddingTop: inCart ? '0.75rem' : 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem', lineHeight: 1.3 }}>{product.name}</div>
                        {product.description && <div style={{ fontSize: '0.75rem', color: 'hsl(220 18% 50%)', marginBottom: '0.25rem', lineHeight: 1.3 }}>{product.description}</div>}
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: inCart ? 'hsl(262 80% 70%)' : 'hsl(262 80% 55%)' }}>
                          {product.price.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Cart items */}
            {cart.length > 0 && (
              <div style={{ padding: '0 1.25rem 1.25rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'hsl(220 18% 55%)', marginBottom: '0.625rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <ShoppingCart size={13} /> Mi pedido · {cartCount} ítem{cartCount !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {cart.map((item) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', background: 'hsl(222 40% 13%)', border: '1px solid hsl(222 30% 20%)', borderRadius: 10, padding: '0.625rem 0.75rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                        <div style={{ fontSize: '0.8125rem', color: 'hsl(262 80% 65%)' }}>
                          {(item.price * item.quantity).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                        <button onClick={() => updateQty(item.id, -1)} style={{ width: 34, height: 34, border: '1px solid hsl(222 30% 28%)', borderRadius: 8, background: 'none', cursor: 'pointer', color: 'hsl(220 18% 55%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Minus size={14} />
                        </button>
                        <span style={{ width: 24, textAlign: 'center', fontWeight: 700, fontSize: '1rem' }}>{item.quantity}</span>
                        <button onClick={() => addToCart(item)} disabled={item.quantity >= item.stock} style={{ width: 34, height: 34, border: '1px solid hsl(262 80% 55% / 0.4)', borderRadius: 8, background: 'none', cursor: 'pointer', color: 'hsl(262 80% 65%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Plus size={14} />
                        </button>
                        <button onClick={() => setCart((p) => p.filter((i) => i.id !== item.id))} style={{ width: 34, height: 34, border: 'none', borderRadius: 8, background: 'none', cursor: 'pointer', color: 'hsl(0 84% 60%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={S.footer}>
            {cart.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ color: 'hsl(220 18% 55%)', fontSize: '0.9rem' }}>{cartCount} ítem{cartCount !== 1 ? 's' : ''}</span>
                <span style={{ fontSize: '1.375rem', fontWeight: 800, color: 'hsl(262 80% 70%)' }}>
                  {subtotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </span>
              </div>
            )}
            <button
              onClick={() => setStep(3)}
              disabled={cart.length === 0}
              style={{ width: '100%', background: cart.length > 0 ? 'hsl(262 80% 55%)' : 'hsl(220 18% 25%)', color: cart.length > 0 ? 'white' : 'hsl(220 18% 45%)', border: 'none', borderRadius: 10, padding: '0.875rem', fontWeight: 600, fontSize: '1rem', cursor: cart.length > 0 ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}
            >
              {cart.length === 0 ? 'Añade productos para continuar' : 'Continuar →'}
            </button>
          </div>
        </>
      )}

      {/* ══════════ STEP 3: CONFIRM ══════════ */}
      {step === 3 && (
        <>
          <div style={S.scroll}>
            <div style={{ padding: '1.25rem' }}>

              {/* Recogida / envío */}
              <div style={{ marginBottom: '1.375rem' }}>
                <button
                  type="button"
                  onClick={() => { setIsPickup((v) => !v); setSelectedRateId(''); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '1rem', background: isPickup ? 'hsl(38 95% 56% / 0.1)' : 'hsl(222 40% 12%)', border: `1px solid ${isPickup ? 'hsl(38 95% 56% / 0.5)' : 'hsl(222 30% 22%)'}`, borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: isPickup ? 'hsl(38 95% 56% / 0.2)' : 'hsl(222 30% 20%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <MapPin size={18} style={{ color: isPickup ? 'hsl(38 95% 56%)' : 'hsl(220 18% 50%)' }} />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, color: isPickup ? 'hsl(38 95% 56%)' : 'hsl(220 18% 85%)' }}>Recoger en local</div>
                      <div style={{ fontSize: '0.8rem', color: 'hsl(220 18% 50%)', marginTop: 2 }}>
                        {isPickup ? 'Pasaré a recogerlo' : 'Envío a domicilio'}
                      </div>
                    </div>
                  </div>
                  <div style={{ width: 44, height: 24, borderRadius: 12, background: isPickup ? 'hsl(38 95% 56%)' : 'hsl(222 30% 28%)', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                    <div style={{ position: 'absolute', top: 2, left: isPickup ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                  </div>
                </button>
              </div>

              {/* Tarifa de envío */}
              {!isPickup && shippingRates.length > 0 && (
                <div style={{ marginBottom: '1.375rem' }}>
                  <div style={S.label}>Tipo de envío</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {[{ id: '', name: 'Sin tarifa de envío', price: 0 }, ...shippingRates].map((rate) => {
                      const sel = selectedRateId === rate.id;
                      return (
                        <button
                          key={rate.id || '__none'}
                          type="button"
                          onClick={() => setSelectedRateId(rate.id)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1rem', background: sel ? 'hsl(262 80% 55% / 0.12)' : 'hsl(222 40% 12%)', border: `1px solid ${sel ? 'hsl(262 80% 55% / 0.4)' : 'hsl(222 30% 22%)'}`, borderRadius: 10, cursor: 'pointer', color: 'inherit', transition: 'all 0.15s' }}
                        >
                          <span style={{ fontWeight: 500, fontSize: '0.9375rem' }}>{rate.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {rate.id && <span style={{ fontWeight: 700, color: 'hsl(262 80% 65%)' }}>{Number(rate.price).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>}
                            {sel && <Check size={16} style={{ color: 'hsl(262 80% 65%)' }} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Forma de pago */}
              <div style={{ marginBottom: '1.375rem' }}>
                <div style={S.label}>Forma de pago</div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['CASH', 'CARD'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      style={{ flex: 1, padding: '0.875rem', border: `1px solid ${paymentMethod === m ? 'hsl(262 80% 55% / 0.5)' : 'hsl(222 30% 22%)'}`, borderRadius: 10, background: paymentMethod === m ? 'hsl(262 80% 55% / 0.12)' : 'hsl(222 40% 12%)', cursor: 'pointer', color: 'inherit', fontWeight: 600, fontSize: '0.9375rem', transition: 'all 0.15s' }}
                    >
                      {m === 'CASH' ? '💵 Efectivo' : '💳 Tarjeta'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notas */}
              <div style={{ marginBottom: '1.375rem' }}>
                <div style={S.label}>Notas (opcional)</div>
                <textarea
                  placeholder="Instrucciones especiales, alérgenos, timbre…"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  rows={2}
                  style={{ resize: 'none', background: 'hsl(222 40% 12%)', fontSize: '0.9375rem', width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              {/* Resumen */}
              <div style={{ background: 'hsl(222 40% 12%)', border: '1px solid hsl(222 30% 20%)', borderRadius: 12, padding: '1rem', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'hsl(220 18% 55%)', marginBottom: '0.75rem' }}>Resumen</div>
                {cart.map((item) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.375rem', color: 'hsl(220 18% 65%)' }}>
                    <span>{item.quantity}× {item.name}</span>
                    <span>{(item.price * item.quantity).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                  </div>
                ))}
                {shippingCost > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'hsl(220 18% 50%)', paddingTop: '0.5rem', marginTop: '0.25rem', borderTop: '1px solid hsl(222 30% 20%)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Truck size={12} /> {selectedRate?.name}</span>
                    <span>{shippingCost.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.625rem', marginTop: '0.5rem', borderTop: '1px solid hsl(222 30% 20%)' }}>
                  <span style={{ fontWeight: 600, color: 'hsl(220 18% 75%)' }}>Total</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'hsl(262 80% 70%)' }}>
                    {total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </span>
                </div>
              </div>

              {/* Info aviso */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem', background: 'hsl(262 80% 45% / 0.08)', border: '1px solid hsl(262 80% 55% / 0.25)', borderRadius: 10, fontSize: '0.8125rem', color: 'hsl(262 80% 65%)', lineHeight: 1.5 }}>
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Recibirás una notificación por <strong>WhatsApp y email</strong> cuando el comercio confirme tu pedido.</span>
              </div>

            </div>
          </div>

          <div style={{ ...S.footer, display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <button
              onClick={submitOrder}
              disabled={submitting}
              style={{ width: '100%', background: 'hsl(262 80% 55%)', color: 'white', border: 'none', borderRadius: 10, padding: '0.875rem', fontWeight: 700, fontSize: '1rem', cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: submitting ? 0.7 : 1 }}
            >
              {submitting
                ? <><span style={{ width: 18, height: 18, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> Enviando…</>
                : '🛒 Confirmar pedido'}
            </button>
            <button
              onClick={() => setStep(2)}
              style={{ background: 'none', border: 'none', color: 'hsl(220 18% 55%)', cursor: 'pointer', fontSize: '0.875rem', padding: '0.5rem' }}
            >
              ← Volver a productos
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }
        * { box-sizing: border-box; }
        input, textarea, select { width: 100%; padding: 0.75rem 1rem; background: hsl(222 40% 13%); border: 1px solid hsl(222 30% 22%); border-radius: 10px; color: inherit; font-family: inherit; font-size: 1rem; outline: none; }
        input:focus, textarea:focus { border-color: hsl(262 80% 55%); }
      `}</style>
    </div>
  );
}

// ─── Store Banner ─────────────────────────────────────────────────────────────
function StoreBanner({ business, compact }: { business: BusinessInfo; compact?: boolean }) {
  return (
    <div style={{ padding: compact ? '0.75rem 1.25rem' : '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: compact ? '1px solid hsl(222 30% 18%)' : 'none' }}>
      {business.logoUrl ? (
        <img src={business.logoUrl} alt={business.name} style={{ width: compact ? 32 : 48, height: compact ? 32 : 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{ width: compact ? 32 : 48, height: compact ? 32 : 48, borderRadius: 8, background: 'hsl(262 80% 45% / 0.2)', border: '1px solid hsl(262 80% 55% / 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: compact ? '0.875rem' : '1.25rem', fontWeight: 700, color: 'hsl(262 80% 65%)' }}>
          {business.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: compact ? '0.9375rem' : '1.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{business.name}</div>
        {!compact && business.address && <div style={{ fontSize: '0.8125rem', color: 'hsl(220 18% 50%)', marginTop: 2 }}>{business.address}</div>}
        {compact && <div style={{ fontSize: '0.7rem', color: 'hsl(262 80% 60%)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Globe size={10} /> Pedidos online</div>}
      </div>
    </div>
  );
}
