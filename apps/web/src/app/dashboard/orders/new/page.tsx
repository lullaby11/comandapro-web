'use client';

import { Fragment, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Plus, Minus, Trash2, Printer, UserPlus, Check, AlertCircle,
  Phone, X, Truck, User, Play, Package, ChevronLeft, ShoppingCart, MapPin, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiRes } from '@/lib/api';
import { imprimirComanda } from '@/lib/impresion';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Customer     { id: string; name: string; phone: string; address?: string }
interface Product      { id: string; name: string; price: number; stock: number; category?: string; imageUrl?: string; active: boolean }
interface CartItem     extends Product { quantity: number }
interface ShippingRate { id: string; name: string; price: number; active: boolean }
type Step = 1 | 2 | 3;

// ─── Step Indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: Step }) {
  const labels = ['Cliente', 'Productos', 'Pago y envío'];
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
                background: done ? 'hsl(142 71% 45%)' : active ? 'hsl(var(--primary))' : 'hsl(222 30% 18%)',
                border: `2px solid ${done ? 'hsl(142 71% 45%)' : active ? 'hsl(var(--primary))' : 'hsl(222 30% 25%)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: '0.8rem',
                color: done || active ? 'white' : 'hsl(220 18% 45%)',
                transition: 'all 0.25s',
                flexShrink: 0,
              }}>
                {done ? <Check size={14} /> : num}
              </div>
              <span style={{
                fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap',
                color: active ? 'hsl(var(--primary))' : done ? 'hsl(142 71% 45%)' : 'hsl(220 18% 45%)',
                transition: 'color 0.25s',
              }}>
                {label}
              </span>
            </div>
            {i < 2 && (
              <div style={{
                flex: 1, height: 2, minWidth: 20, marginTop: 13,
                background: done ? 'hsl(142 71% 45%)' : 'hsl(222 30% 20%)',
                transition: 'background 0.3s',
              }} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NewOrderPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  // Service check
  const [serviceChecked, setServiceChecked] = useState(false);
  const [hasActiveService, setHasActiveService] = useState(false);

  // Customer
  const [searchMode, setSearchMode]         = useState<'phone' | 'name'>('phone');
  const [searchInput, setSearchInput]       = useState('');
  const [customer, setCustomer]             = useState<Customer | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust]               = useState({ name: '', phone: '', address: '' });
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [suggestions, setSuggestions]       = useState<Customer[]>([]);
  const [showDropdown, setShowDropdown]     = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Products
  const [products, setProducts]             = useState<Product[]>([]);
  const [categories, setCategories]         = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [productSearch, setProductSearch]   = useState('');
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Cart
  const [cart, setCart]                     = useState<CartItem[]>([]);
  const [orderNotes, setOrderNotes]         = useState('');

  // Pickup / delivery
  const [isPickup, setIsPickup]             = useState(false);
  const [shippingRates, setShippingRates]   = useState<ShippingRate[]>([]);
  const [selectedShippingRateId, setSelectedShippingRateId] = useState<string>('');

  // Payment
  const [paymentMethod, setPaymentMethod]   = useState<'CASH' | 'CARD'>('CASH');
  const [cashGiven, setCashGiven]           = useState('');

  // Delivery time
  const [deliveryMode, setDeliveryMode]     = useState<'minutes' | 'time'>('minutes');
  const [deliveryMinutes, setDeliveryMinutes] = useState('');
  const [deliveryTime, setDeliveryTime]     = useState('');

  // UI
  const [submitting, setSubmitting]         = useState(false);
  const [printing, setPrinting]             = useState(false);
  const [orderId, setOrderId]               = useState<string | null>(null);
  const [printerMode, setPrinterMode]       = useState<string>('webusb');
  const [orderDone, setOrderDone]           = useState(false);

  // Stock modal
  const [stockModal, setStockModal]         = useState<Product | null>(null);
  const [stockInput, setStockInput]         = useState('');
  const [savingStock, setSavingStock]       = useState(false);

  const phoneRef = useRef<HTMLInputElement>(null);

  // ── Check active service ─────────────────────────────────────────────────────
  useEffect(() => {
    async function checkService() {
      try {
        const res = await apiRes(`/api/services/active`);
        if (res.ok) {
          const data = await res.json();
          setHasActiveService(!!data.service);
        }
      } finally {
        setServiceChecked(true);
      }
    }
    checkService();

    // El modo de impresión lo decide el local en Ajustes. Esta página lo ignoraba y
    // enviaba siempre por WebUSB, así que un local en Bluetooth no podía imprimir al
    // crear el pedido.
    apiRes('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (s?.printerMode) setPrinterMode(s.printerMode); })
      .catch(() => { /* se queda el valor por defecto */ });
  }, []);

  // ── Load products & shipping rates ───────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        const [prodRes, ratesRes] = await Promise.all([
          apiRes(`/api/products?active=true`),
          apiRes(`/api/shipping-rates`),
        ]);
        if (!prodRes.ok) throw new Error('Error cargando productos');
        const data: Product[] = await prodRes.json();
        setProducts(data);
        setCategories(['all', ...Array.from(new Set(data.map((p) => p.category ?? 'Sin categoría')))]);
        if (ratesRes.ok) {
          const rates: ShippingRate[] = await ratesRes.json();
          setShippingRates(rates.filter((r) => r.active));
        }
      } catch {
        toast.error('Error cargando productos');
      } finally {
        setLoadingProducts(false);
      }
    }
    loadData();
  }, []);

  // ── Focus phone input when arriving at step 1 ────────────────────────────────
  useEffect(() => {
    if (step === 1 && !customer) {
      setTimeout(() => phoneRef.current?.focus(), 80);
    }
  }, [step, customer]);

  // ── Live suggestions ─────────────────────────────────────────────────────────
  useEffect(() => {
    const minLength = searchMode === 'name' ? 2 : 3;
    if (searchInput.length < minLength) { setSuggestions([]); setShowDropdown(false); return; }
    setSearchingCustomer(true);
    const timer = setTimeout(async () => {
      try {
        const param = searchMode === 'name'
          ? `name=${encodeURIComponent(searchInput)}`
          : `phone=${encodeURIComponent(searchInput)}`;
        const res = await apiRes(`/api/customers?${param}&limit=6`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.customers as Customer[]);
          setShowDropdown(true);
        }
      } catch { /* ignore */ } finally {
        setSearchingCustomer(false);
      }
    }, 300);
    return () => { clearTimeout(timer); setSearchingCustomer(false); };
  }, [searchInput, searchMode]);

  // ── Close dropdown on outside click ─────────────────────────────────────────
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // ── Customer handlers ────────────────────────────────────────────────────────
  function selectSuggestion(c: Customer) {
    setCustomer(c);
    setSearchInput(c.phone);
    setShowDropdown(false);
    setSuggestions([]);
    setShowNewCustomer(false);
  }

  const searchCustomerByPhone = useCallback(async (phone: string) => {
    if (phone.length < 6) return;
    const exact = suggestions.find((s) => s.phone === phone);
    if (exact) { selectSuggestion(exact); return; }
    setSearchingCustomer(true);
    setShowDropdown(false);
    try {
      const res = await apiRes(`/api/customers/by-phone/${encodeURIComponent(phone)}`);
      if (res.ok) {
        const data: Customer = await res.json();
        setCustomer(data);
        setShowNewCustomer(false);
        toast.success(`Cliente encontrado: ${data.name}`, { icon: '✅' });
      } else if (res.status === 404) {
        setCustomer(null);
        setShowNewCustomer(true);
        setNewCust((prev) => ({ ...prev, phone }));
      }
    } catch {
      toast.error('Error buscando cliente');
    } finally {
      setSearchingCustomer(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions]);

  async function createCustomer() {
    if (!newCust.name || !newCust.phone) return;
    try {
      const res = await apiRes(`/api/customers`, { method: 'POST', body: newCust });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.customer) { setCustomer(data.customer); setShowNewCustomer(false); return; }
        throw new Error(data.error);
      }
      setCustomer(data);
      setShowNewCustomer(false);
      toast.success('Cliente creado', { icon: '✅' });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error creando cliente');
    }
  }

  // ── Cart handlers ────────────────────────────────────────────────────────────
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

  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const subtotal          = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount         = cart.reduce((s, i) => s + i.quantity, 0);
  const selectedRate      = shippingRates.find((r) => r.id === selectedShippingRateId);
  const shippingCost      = !isPickup && selectedRate ? Number(selectedRate.price) : 0;
  const totalWithShipping = subtotal + shippingCost;

  const filteredProducts = products.filter((p) => {
    const matchCat    = activeCategory === 'all' || (p.category ?? 'Sin categoría') === activeCategory;
    const matchSearch = !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function submitOrder(print = false) {
    if (!customer) { toast.error('Selecciona un cliente'); return; }
    if (cart.length === 0) { toast.error('El carrito está vacío'); return; }
    setSubmitting(true);
    try {
      let estimatedDeliveryAt: string | undefined;
      if (deliveryMode === 'minutes' && deliveryMinutes) {
        estimatedDeliveryAt = new Date(Date.now() + Number(deliveryMinutes) * 60_000).toISOString();
      } else if (deliveryMode === 'time' && deliveryTime) {
        const [h, m] = deliveryTime.split(':').map(Number);
        const d = new Date(); d.setHours(h, m, 0, 0);
        if (d <= new Date()) d.setDate(d.getDate() + 1);
        estimatedDeliveryAt = d.toISOString();
      }
      const res = await apiRes(`/api/orders`, { method: 'POST', body: {
          customerId: customer.id, notes: orderNotes, isPickup, estimatedDeliveryAt, paymentMethod,
          cashGiven: paymentMethod === 'CASH' && cashGiven ? Number(cashGiven) : undefined,
          shippingRateId: !isPickup && selectedShippingRateId ? selectedShippingRateId : undefined,
          items: cart.map((i) => ({ productId: i.id, quantity: i.quantity })),
        },
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.details) {
          throw new Error(`Stock insuficiente: ${data.details.map((d: { productName: string }) => d.productName).join(', ')}`);
        }
        throw new Error(data.error ?? 'Error creando pedido');
      }
      setOrderId(data.id);
      toast.success(`Pedido #${data.id.slice(-8).toUpperCase()} creado`, { icon: '🎉' });
      if (print) await handlePrint(data.id);
      setOrderDone(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error del servidor');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePrint(id: string) {
    setPrinting(true);
    try {
      const res = await apiRes(`/api/orders/${id}/print`, { method: 'POST' });
      if (!res.ok) throw new Error('Error generando comanda');
      await imprimirComanda(new Uint8Array(await res.arrayBuffer()), printerMode);
      // Se confirma solo tras un envío correcto: si el transporte falla, el pedido sigue
      // constando como pendiente y el agente local puede recogerlo.
      await apiRes(`/api/orders/${id}/printed`, { method: 'POST' }).catch(() => {});
      toast.success('¡Comanda enviada a la impresora!', { icon: '🖨️' });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error de impresión');
    } finally {
      setPrinting(false);
    }
  }

  function resetOrder() {
    setCustomer(null); setSearchInput(''); setSuggestions([]); setShowDropdown(false);
    setCart([]); setOrderNotes(''); setIsPickup(false); setSelectedShippingRateId('');
    setDeliveryMode('minutes'); setDeliveryMinutes(''); setDeliveryTime('');
    setOrderId(null); setOrderDone(false); setShowNewCustomer(false);
    setNewCust({ name: '', phone: '', address: '' }); setStep(1);
  }

  async function refreshProducts() {
    try {
      const res = await apiRes(`/api/products?active=true`);
      if (!res.ok) return;
      const data: Product[] = await res.json();
      setProducts(data);
      setCart((prev) => prev.map((item) => {
        const updated = data.find((p) => p.id === item.id);
        return updated ? { ...item, stock: updated.stock } : item;
      }));
    } catch { /* ignore */ }
  }

  function openStockModal(product: Product, e: React.MouseEvent) {
    e.stopPropagation(); setStockModal(product); setStockInput('');
  }

  async function saveStock() {
    if (!stockModal || !stockInput) return;
    const amount = Number(stockInput);
    if (!Number.isInteger(amount) || amount <= 0) { toast.error('Introduce una cantidad válida'); return; }
    setSavingStock(true);
    try {
      const newStock = stockModal.stock + amount;
      const res = await apiRes(`/api/products/${stockModal.id}`, { method: 'PATCH', body: { stock: newStock } });
      if (!res.ok) throw new Error('Error actualizando stock');
      await refreshProducts();
      toast.success(`Stock actualizado: ${newStock} unidades`);
      setStockModal(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error actualizando stock');
    } finally {
      setSavingStock(false);
    }
  }

  // ─── No active service ────────────────────────────────────────────────────────
  if (serviceChecked && !hasActiveService) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '2rem' }}>
        <div className="card animate-fade-up" style={{ maxWidth: 440, width: '100%', textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 1.5rem', background: 'hsl(220 18% 20%)', border: '2px solid hsl(220 18% 30%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Play size={28} style={{ color: 'hsl(220 18% 55%)' }} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>Sin servicio activo</h2>
          <p style={{ fontSize: '0.9rem', color: 'hsl(var(--muted))', marginBottom: '2rem', lineHeight: 1.6 }}>
            No se pueden crear pedidos hasta que se inicie un servicio. Ve a la lista de pedidos para iniciarlo.
          </p>
          <button className="btn btn-primary" onClick={() => router.push('/dashboard/orders')}>Ir a Pedidos</button>
        </div>
      </div>
    );
  }

  // ─── Order done ───────────────────────────────────────────────────────────────
  if (orderDone) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '2rem' }}>
        <div className="card animate-fade-up" style={{ maxWidth: 480, width: '100%', textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto 1.5rem', background: 'hsl(142 71% 45% / 0.2)', border: '2px solid hsl(142 71% 45%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={36} style={{ color: 'hsl(142 71% 45%)' }} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>¡Pedido confirmado!</h2>
          <p style={{ color: 'hsl(220 18% 65%)', marginBottom: '2rem' }}>
            #{orderId?.slice(-8).toUpperCase()} · {customer?.name}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button className="btn btn-ghost" onClick={() => handlePrint(orderId!)} disabled={printing} id="reprint-btn">
              <Printer size={16} />{printing ? 'Imprimiendo…' : 'Reimprimir'}
            </button>
            <button className="btn btn-primary" onClick={resetOrder} id="new-order-btn">
              <Plus size={16} />Nuevo pedido
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Shared styles ─────────────────────────────────────────────────────────────
  const S = {
    page:      { display: 'flex', flexDirection: 'column' as const, height: '100dvh', background: 'hsl(222 47% 9%)', maxWidth: 640, margin: '0 auto', position: 'relative' as const },
    topBar:    { flexShrink: 0, background: 'hsl(222 47% 9%)', borderBottom: '1px solid hsl(222 30% 18%)' },
    navRow:    { display: 'flex', alignItems: 'center', padding: '0.75rem 1rem 0', position: 'relative' as const },
    title:     { position: 'absolute' as const, left: '50%', transform: 'translateX(-50%)', fontWeight: 700, fontSize: '1rem', whiteSpace: 'nowrap' as const },
    scroll:    { flex: 1, overflowY: 'auto' as const },
    body:      { padding: '1.5rem 1.25rem' },
    footer:    { flexShrink: 0, padding: '1rem 1.25rem', borderTop: '1px solid hsl(222 30% 18%)', background: 'hsl(222 47% 8%)' },
    label:     { display: 'block', fontSize: '0.75rem', fontWeight: 600 as const, color: 'hsl(220 18% 55%)', marginBottom: '0.5rem', textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
    card:      { background: 'hsl(222 40% 12%)', border: '1px solid hsl(222 30% 20%)', borderRadius: 12, padding: '1rem' },
    inputBg:   { background: 'hsl(222 40% 13%)' },
    section:   { marginBottom: '1.375rem' },
  };

  // ─── Wizard ───────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* ── Fixed header ── */}
      <div style={S.topBar}>
        <div style={S.navRow}>
          <button
            onClick={() => step > 1 ? setStep((s) => (s - 1) as Step) : router.push('/dashboard/orders')}
            className="btn btn-ghost btn-sm"
            style={{ gap: '0.25rem', zIndex: 1 }}
          >
            <ChevronLeft size={18} />
            {step > 1 ? 'Atrás' : 'Pedidos'}
          </button>
          <span style={S.title}>Nueva Comanda</span>
        </div>
        <StepIndicator step={step} />
      </div>

      {/* ══════════════ STEP 1: CLIENTE ══════════════ */}
      {step === 1 && (
        <>
          <div style={S.scroll}>
            <div style={S.body}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.375rem' }}>
                ¿Para quién es el pedido?
              </h2>
              <p style={{ fontSize: '0.875rem', color: 'hsl(220 18% 50%)', marginBottom: '1.5rem' }}>
                Busca un cliente existente o crea uno nuevo
              </p>

              {customer ? (
                <div className="card animate-fade-up" style={{ padding: '1.25rem', background: 'hsl(142 71% 15% / 0.2)', borderColor: 'hsl(142 71% 45% / 0.4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                        background: 'hsl(142 71% 45% / 0.2)', border: '2px solid hsl(142 71% 45% / 0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.25rem', fontWeight: 700, color: 'hsl(142 71% 45%)',
                      }}>
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>{customer.name}</div>
                        <div style={{ fontSize: '0.875rem', color: 'hsl(220 18% 55%)', marginTop: 3, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Phone size={12} />{customer.phone}
                        </div>
                        {customer.address && (
                          <div style={{ fontSize: '0.8125rem', color: 'hsl(220 18% 48%)', marginTop: 2 }}>{customer.address}</div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => { setCustomer(null); setSearchInput(''); setSuggestions([]); setShowNewCustomer(false); }}
                      className="btn btn-sm btn-ghost"
                      style={{ flexShrink: 0 }}
                    >
                      <X size={14} /> Cambiar
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                  {/* Mode toggle */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {(['phone', 'name'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => { setSearchMode(mode); setSearchInput(''); setSuggestions([]); setShowDropdown(false); setTimeout(() => phoneRef.current?.focus(), 50); }}
                        className={`btn ${searchMode === mode ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        {mode === 'phone' ? <><Phone size={15} /> Teléfono</> : <><User size={15} /> Nombre</>}
                      </button>
                    ))}
                  </div>

                  {/* Search input + dropdown */}
                  <div ref={dropdownRef} style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        {searchMode === 'phone'
                          ? <Phone size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 50%)', pointerEvents: 'none' }} />
                          : <User  size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 50%)', pointerEvents: 'none' }} />
                        }
                        {searchingCustomer && (
                          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid hsl(var(--primary))', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                        )}
                        <input
                          ref={phoneRef}
                          type={searchMode === 'phone' ? 'tel' : 'text'}
                          placeholder={searchMode === 'phone' ? 'Teléfono del cliente' : 'Nombre del cliente'}
                          value={searchInput}
                          onChange={(e) => { setSearchInput(e.target.value); setShowNewCustomer(false); }}
                          onKeyDown={(e) => e.key === 'Enter' && searchMode === 'phone' && searchCustomerByPhone(searchInput)}
                          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                          style={{ paddingLeft: '2.5rem', paddingRight: searchingCustomer ? '2.5rem' : undefined, ...S.inputBg, fontSize: '1rem' }}
                          id="customer-search"
                          autoComplete="off"
                        />
                      </div>
                      {searchMode === 'phone' && (
                        <button
                          className="btn btn-primary"
                          onClick={() => searchCustomerByPhone(searchInput)}
                          disabled={searchingCustomer || searchInput.length < 6}
                          id="search-customer-btn"
                          style={{ flexShrink: 0 }}
                        >
                          <Search size={16} />
                        </button>
                      )}
                    </div>

                    {/* Autocomplete dropdown */}
                    {showDropdown && (suggestions.length > 0 || (searchMode === 'phone' && searchInput.length >= 6)) && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50, background: 'hsl(222 40% 12%)', border: '1px solid hsl(222 30% 22%)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 10px 32px hsl(222 47% 4% / 0.85)' }}>
                        {suggestions.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.875rem 1rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'inherit', borderBottom: '1px solid hsl(222 30% 18%)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--primary) / 0.1)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                          >
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'hsl(var(--primary) / 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, color: 'hsl(var(--primary))' }}>
                              {s.name.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600 }}>{s.name}</div>
                              <div style={{ fontSize: '0.8125rem', color: 'hsl(220 18% 55%)' }}>{s.phone}</div>
                            </div>
                          </button>
                        ))}
                        {suggestions.length === 0 && searchMode === 'phone' && searchInput.length >= 6 && (
                          <button
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); setShowDropdown(false); setShowNewCustomer(true); setNewCust((p) => ({ ...p, phone: searchInput })); }}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', width: '100%', padding: '0.875rem 1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(38 95% 56%)', fontSize: '0.9375rem', fontWeight: 600 }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(38 95% 56% / 0.08)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                          >
                            <UserPlus size={16} />
                            Crear nuevo cliente con este número
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* New customer form */}
                  {showNewCustomer && (
                    <div className="card animate-fade-up" style={{ padding: '1.25rem', ...S.inputBg }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'hsl(38 95% 56%)' }}>
                        <AlertCircle size={16} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Cliente no encontrado. Crear nuevo:</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                        <input
                          type="text"
                          placeholder="Nombre completo *"
                          value={newCust.name}
                          onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
                          style={{ background: 'hsl(222 47% 11%)', fontSize: '1rem' }}
                          id="new-customer-name"
                        />
                        <input
                          type="text"
                          placeholder="Dirección de entrega"
                          value={newCust.address}
                          onChange={(e) => setNewCust({ ...newCust, address: e.target.value })}
                          style={{ background: 'hsl(222 47% 11%)', fontSize: '1rem' }}
                          id="new-customer-address"
                        />
                        <button
                          className="btn btn-accent"
                          onClick={createCustomer}
                          disabled={!newCust.name}
                          id="create-customer-btn"
                          style={{ justifyContent: 'center' }}
                        >
                          <UserPlus size={16} /> Crear cliente
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={S.footer}>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => setStep(2)}
              disabled={!customer}
              style={{ width: '100%', justifyContent: 'center' }}
              id="step1-continue"
            >
              {customer ? `Continuar con ${customer.name.split(' ')[0]}` : 'Selecciona un cliente para continuar'}
              {customer && <ChevronLeft size={18} style={{ transform: 'rotate(180deg)' }} />}
            </button>
          </div>
        </>
      )}

      {/* ══════════════ STEP 2: PRODUCTOS ══════════════ */}
      {step === 2 && (
        <>
          {/* Sticky search + categories */}
          <div style={{ flexShrink: 0, padding: '0.875rem 1.25rem 0', background: 'hsl(222 47% 9%)', borderBottom: '1px solid hsl(222 30% 18%)' }}>
            <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Buscar producto…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                style={{ paddingLeft: '2.5rem', ...S.inputBg }}
                id="product-search"
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.75rem' }}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`btn btn-sm ${activeCategory === cat ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ flexShrink: 0 }}
                >
                  {cat === 'all' ? 'Todos' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable: product grid + cart */}
          <div style={S.scroll}>
            {/* Product grid */}
            <div style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
              {loadingProducts ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ height: 96, borderRadius: 12, background: 'hsl(222 40% 13%)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                ))
              ) : filteredProducts.length === 0 ? (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'hsl(220 18% 50%)' }}>
                  No hay productos
                </div>
              ) : (
                filteredProducts.map((product) => {
                  const inCart = cart.find((i) => i.id === product.id);
                  const isOut  = product.stock === 0;
                  return (
                    <div
                      key={product.id}
                      className={`product-card${isOut ? ' out-of-stock' : ''}${inCart ? ' selected' : ''}`}
                      onClick={() => !isOut && addToCart(product)}
                      id={`product-${product.id}`}
                      style={{ minHeight: 88 }}
                    >
                      {isOut ? (
                        <span className="badge badge-danger" style={{ position: 'absolute', top: 8, right: 8, fontSize: '0.65rem' }}>Agotado</span>
                      ) : product.stock <= 5 ? (
                        <span className="badge badge-warning" style={{ position: 'absolute', top: 8, right: 8, fontSize: '0.65rem' }}>{product.stock} left</span>
                      ) : null}
                      {inCart && (
                        <div style={{ position: 'absolute', top: 8, left: 8, width: 24, height: 24, borderRadius: '50%', background: 'hsl(var(--primary))', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                          {inCart.quantity}
                        </div>
                      )}
                      <div style={{ paddingTop: (inCart || isOut) ? '0.75rem' : 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem', lineHeight: 1.3 }}>{product.name}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'hsl(var(--primary))' }}>
                          {product.price.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                        </div>
                        {isOut && (
                          <button
                            onClick={(e) => openStockModal(product, e)}
                            style={{ marginTop: '0.5rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 600, padding: '0.3rem 0.5rem', background: 'hsl(var(--primary) / 0.15)', border: '1px solid hsl(var(--primary) / 0.35)', color: 'hsl(var(--primary))', borderRadius: 6, cursor: 'pointer' }}
                          >
                            <Plus size={11} /> Añadir stock
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Cart items */}
            {cart.length > 0 && (
              <div style={{ padding: '0 1.25rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.625rem', ...S.label as React.CSSProperties }}>
                  <ShoppingCart size={13} /> Tu pedido · {cartCount} {cartCount === 1 ? 'ítem' : 'ítems'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {cart.map((item) => (
                    <div key={item.id} className="animate-slide-right" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', background: 'hsl(222 40% 13%)', border: '1px solid hsl(222 30% 20%)', borderRadius: 10, padding: '0.625rem 0.75rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                        <div style={{ fontSize: '0.8125rem', color: 'hsl(var(--primary))' }}>
                          {(item.price * item.quantity).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                        <button onClick={() => updateQty(item.id, -1)} style={{ width: 34, height: 34, border: '1px solid hsl(var(--border))', borderRadius: 8, background: 'none', cursor: 'pointer', color: 'hsl(220 18% 65%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Minus size={14} />
                        </button>
                        <span style={{ width: 24, textAlign: 'center', fontWeight: 700, fontSize: '1rem' }}>{item.quantity}</span>
                        <button onClick={() => addToCart(item)} disabled={item.quantity >= item.stock} style={{ width: 34, height: 34, border: '1px solid hsl(var(--border))', borderRadius: 8, background: 'none', cursor: 'pointer', color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Plus size={14} />
                        </button>
                        <button onClick={() => removeFromCart(item.id)} style={{ width: 34, height: 34, border: 'none', borderRadius: 8, background: 'none', cursor: 'pointer', color: 'hsl(0 84% 60%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}>
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
                <span style={{ color: 'hsl(220 18% 55%)', fontSize: '0.9rem' }}>{cartCount} {cartCount === 1 ? 'ítem' : 'ítems'}</span>
                <span style={{ fontSize: '1.375rem', fontWeight: 800, color: 'hsl(var(--primary))' }}>
                  {subtotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </span>
              </div>
            )}
            <button
              className="btn btn-primary btn-lg"
              onClick={() => setStep(3)}
              disabled={cart.length === 0}
              style={{ width: '100%', justifyContent: 'center' }}
              id="step2-continue"
            >
              {cart.length === 0 ? 'Añade productos para continuar' : 'Continuar al pago y envío'}
              {cart.length > 0 && <ChevronLeft size={18} style={{ transform: 'rotate(180deg)' }} />}
            </button>
          </div>
        </>
      )}

      {/* ══════════════ STEP 3: PAGO Y ENVÍO ══════════════ */}
      {step === 3 && (
        <>
          <div style={S.scroll}>
            <div style={S.body}>

              {/* Pickup / envío */}
              <div style={S.section}>
                <button
                  type="button"
                  onClick={() => { setIsPickup((v) => !v); setSelectedShippingRateId(''); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '1rem', background: isPickup ? 'hsl(38 95% 56% / 0.1)' : 'hsl(222 40% 12%)', border: `1px solid ${isPickup ? 'hsl(38 95% 56% / 0.5)' : 'hsl(222 30% 22%)'}`, borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: isPickup ? 'hsl(38 95% 56% / 0.2)' : 'hsl(222 30% 20%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <MapPin size={18} style={{ color: isPickup ? 'hsl(38 95% 56%)' : 'hsl(220 18% 50%)' }} />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, color: isPickup ? 'hsl(38 95% 56%)' : 'hsl(220 18% 85%)' }}>Recogida en local</div>
                      <div style={{ fontSize: '0.8rem', color: 'hsl(220 18% 50%)', marginTop: 2 }}>
                        {isPickup ? 'El cliente recoge en tienda' : 'Se enviará a domicilio'}
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
                <div style={S.section}>
                  <div style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '0.375rem' } as React.CSSProperties}>
                    <Truck size={13} /> Tipo de envío
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {[{ id: '', name: 'Sin tarifa de envío', price: 0 }, ...shippingRates].map((rate) => {
                      const sel = selectedShippingRateId === rate.id;
                      return (
                        <button
                          key={rate.id || '__none'}
                          type="button"
                          onClick={() => setSelectedShippingRateId(rate.id)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1rem', background: sel ? 'hsl(var(--primary) / 0.12)' : 'hsl(222 40% 12%)', border: `1px solid ${sel ? 'hsl(var(--primary) / 0.4)' : 'hsl(222 30% 22%)'}`, borderRadius: 10, cursor: 'pointer', color: 'inherit', transition: 'all 0.15s' }}
                        >
                          <span style={{ fontSize: '0.9375rem', fontWeight: 500 }}>{rate.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                            {rate.id && <span style={{ fontWeight: 700, color: 'hsl(var(--primary))' }}>{Number(rate.price).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>}
                            {sel && <Check size={16} style={{ color: 'hsl(var(--primary))' }} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tiempo de entrega */}
              <div style={S.section}>
                <div style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '0.375rem' } as React.CSSProperties}>
                  <Clock size={13} /> Tiempo de entrega
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.625rem' }}>
                  {(['minutes', 'time'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDeliveryMode(mode)}
                      className={`btn ${deliveryMode === mode ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      {mode === 'minutes' ? 'En X minutos' : 'A las HH:MM'}
                    </button>
                  ))}
                </div>
                {deliveryMode === 'minutes' ? (
                  <input
                    type="number"
                    placeholder="Minutos para la entrega (ej: 45)"
                    min="1" max="240"
                    value={deliveryMinutes}
                    onChange={(e) => setDeliveryMinutes(e.target.value)}
                    style={{ ...S.inputBg, fontSize: '1rem' }}
                    id="delivery-minutes"
                  />
                ) : (
                  <input
                    type="time"
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(e.target.value)}
                    style={{ ...S.inputBg, fontSize: '1rem' }}
                    id="delivery-time"
                  />
                )}
              </div>

              {/* Forma de pago */}
              <div style={S.section}>
                <div style={S.label}>Forma de pago</div>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.625rem' }}>
                  <button
                    type="button"
                    onClick={() => { setPaymentMethod('CASH'); setCashGiven(''); }}
                    className={`btn ${paymentMethod === 'CASH' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, justifyContent: 'center' }}
                    id="payment-cash"
                  >
                    💵 Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPaymentMethod('CARD'); setCashGiven(''); }}
                    className={`btn ${paymentMethod === 'CARD' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, justifyContent: 'center' }}
                    id="payment-card"
                  >
                    💳 Tarjeta
                  </button>
                </div>
                {paymentMethod === 'CASH' && (
                  <>
                    <input
                      type="number"
                      placeholder="Importe que entrega el cliente (€)"
                      min="0" step="0.01"
                      value={cashGiven}
                      onChange={(e) => setCashGiven(e.target.value)}
                      style={{ ...S.inputBg, fontSize: '1rem', marginBottom: '0.5rem' }}
                      id="cash-given"
                    />
                    {cashGiven && Number(cashGiven) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderRadius: 10, background: Number(cashGiven) >= totalWithShipping ? 'hsl(142 71% 15% / 0.3)' : 'hsl(0 84% 20% / 0.3)', border: `1px solid ${Number(cashGiven) >= totalWithShipping ? 'hsl(142 71% 45% / 0.4)' : 'hsl(0 84% 60% / 0.4)'}` }}>
                        <span style={{ color: 'hsl(var(--muted))', fontWeight: 500 }}>Cambio</span>
                        <span style={{ fontWeight: 700, fontSize: '1.125rem', color: Number(cashGiven) >= totalWithShipping ? 'hsl(142 71% 45%)' : 'hsl(0 84% 60%)' }}>
                          {Number(cashGiven) >= totalWithShipping
                            ? (Number(cashGiven) - totalWithShipping).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
                            : 'Importe insuficiente'}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Notas */}
              <div style={S.section}>
                <div style={S.label}>Notas del pedido (opcional)</div>
                <textarea
                  placeholder="Instrucciones especiales, alérgenos, etc."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  rows={2}
                  style={{ resize: 'none', ...S.inputBg, fontSize: '0.9375rem' }}
                  id="order-notes"
                />
              </div>

              {/* Resumen */}
              <div style={{ ...S.card, marginBottom: '0.5rem' }}>
                <div style={{ ...S.label, marginBottom: '0.75rem' }}>Resumen del pedido</div>
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
                  <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'hsl(var(--primary))' }}>
                    {totalWithShipping.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </span>
                </div>
              </div>

            </div>
          </div>

          <div style={{ ...S.footer, display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <button
              className="btn btn-accent btn-lg"
              onClick={() => submitOrder(true)}
              disabled={submitting || printing}
              id="confirm-print-btn"
              style={{ justifyContent: 'center' }}
            >
              <Printer size={18} />
              {submitting ? 'Confirmando…' : 'Confirmar e Imprimir'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => submitOrder(false)}
              disabled={submitting}
              id="confirm-only-btn"
              style={{ justifyContent: 'center' }}
            >
              <Check size={16} /> Solo confirmar
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      {/* ── Stock Modal ── */}
      {stockModal && (
        <div
          onClick={() => !savingStock && setStockModal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'hsl(222 47% 5% / 0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div onClick={(e) => e.stopPropagation()} className="card animate-fade-up" style={{ width: '100%', maxWidth: 360, padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: 'hsl(var(--primary) / 0.15)', border: '1px solid hsl(var(--primary) / 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Package size={18} style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>Añadir stock</div>
                <div style={{ fontSize: '0.8125rem', color: 'hsl(220 18% 55%)' }}>{stockModal.name}</div>
              </div>
              <button onClick={() => setStockModal(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(220 18% 55%)', display: 'flex', padding: '0.25rem' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0.875rem', borderRadius: 8, marginBottom: '1rem', background: 'hsl(222 40% 13%)', border: '1px solid hsl(222 30% 20%)', fontSize: '0.875rem' }}>
              <span style={{ color: 'hsl(220 18% 65%)' }}>Stock actual</span>
              <span style={{ fontWeight: 700, color: stockModal.stock === 0 ? 'hsl(0 84% 60%)' : 'hsl(220 18% 80%)' }}>{stockModal.stock} unidades</span>
            </div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'hsl(220 18% 65%)', marginBottom: '0.375rem' }}>
              Unidades a añadir
            </label>
            <input
              type="number"
              placeholder="Ej: 10"
              min="1" step="1"
              value={stockInput}
              onChange={(e) => setStockInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveStock()}
              autoFocus
              style={{ background: 'hsl(222 40% 13%)', marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 600 }}
            />
            {stockInput && Number(stockInput) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.875rem', borderRadius: 8, marginBottom: '1rem', background: 'hsl(142 71% 15% / 0.3)', border: '1px solid hsl(142 71% 45% / 0.4)', fontSize: '0.875rem' }}>
                <span style={{ color: 'hsl(220 18% 65%)' }}>Nuevo stock</span>
                <span style={{ fontWeight: 700, color: 'hsl(142 71% 45%)' }}>{stockModal.stock + Number(stockInput)} unidades</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.625rem' }}>
              <button className="btn btn-ghost" onClick={() => setStockModal(null)} disabled={savingStock} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveStock} disabled={savingStock || !stockInput || Number(stockInput) <= 0} style={{ flex: 1, justifyContent: 'center' }}>
                {savingStock ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
