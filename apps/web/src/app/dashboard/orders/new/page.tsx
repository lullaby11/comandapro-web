'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Minus, Trash2, Printer, UserPlus, Check, AlertCircle, Phone, X, Truck } from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Customer     { id: string; name: string; phone: string; address?: string }
interface Product      { id: string; name: string; price: number; stock: number; category?: string; imageUrl?: string; active: boolean }
interface CartItem     extends Product { quantity: number }
interface ShippingRate { id: string; name: string; price: number; active: boolean }

// ─── API Helper ──────────────────────────────────────────────────────────────
function apiHeaders() {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}
const API = '';

// ─── WebUSB Print ────────────────────────────────────────────────────────────
async function printViaWebUSB(buffer: Uint8Array) {
  if (!navigator.usb) throw new Error('WebUSB no soportado. Usa Chrome o Edge.');
  const device = await navigator.usb.requestDevice({ filters: [{ classCode: 0x07 }] });
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  await device.claimInterface(0);
  await device.transferOut(1, buffer);
  await device.close();
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NewOrderPage() {
  // Customer
  const [phoneInput, setPhoneInput]     = useState('');
  const [customer, setCustomer]         = useState<Customer | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust]           = useState({ name: '', phone: '', address: '' });
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [suggestions, setSuggestions]   = useState<Customer[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Products
  const [products, setProducts]         = useState<Product[]>([]);
  const [categories, setCategories]     = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [productSearch, setProductSearch] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Cart
  const [cart, setCart]                 = useState<CartItem[]>([]);
  const [orderNotes, setOrderNotes]     = useState('');

  // Pickup / delivery
  const [isPickup, setIsPickup] = useState(false);
  const [shippingRates, setShippingRates]       = useState<ShippingRate[]>([]);
  const [selectedShippingRateId, setSelectedShippingRateId] = useState<string>('');

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [cashGiven, setCashGiven]         = useState('');

  // Delivery time
  const [deliveryMode, setDeliveryMode] = useState<'minutes' | 'time'>('minutes');
  const [deliveryMinutes, setDeliveryMinutes] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');

  // UI states
  const [submitting, setSubmitting]     = useState(false);
  const [printing, setPrinting]         = useState(false);
  const [orderId, setOrderId]           = useState<string | null>(null);
  const [orderDone, setOrderDone]       = useState(false);

  const phoneRef = useRef<HTMLInputElement>(null);

  // ── Load products & shipping rates ────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        const [prodRes, ratesRes] = await Promise.all([
          fetch(`${API}/api/products?active=true`, { headers: apiHeaders() }),
          fetch(`${API}/api/shipping-rates`, { headers: apiHeaders() }),
        ]);
        if (!prodRes.ok) throw new Error('Error cargando productos');
        const data: Product[] = await prodRes.json();
        setProducts(data);
        const cats = ['all', ...Array.from(new Set(data.map((p) => p.category ?? 'Sin categoría')))];
        setCategories(cats);
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
    phoneRef.current?.focus();
  }, []);

  // ── Live suggestions as user types ─────────────────────────────────────────
  useEffect(() => {
    if (phoneInput.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    setSearchingCustomer(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API}/api/customers?phone=${encodeURIComponent(phoneInput)}&limit=6`,
          { headers: apiHeaders() },
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.customers as Customer[]);
          setShowDropdown(true);
        }
      } catch {
        // silently ignore network errors during typing
      } finally {
        setSearchingCustomer(false);
      }
    }, 300);
    return () => { clearTimeout(timer); setSearchingCustomer(false); };
  }, [phoneInput]);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function selectSuggestion(c: Customer) {
    setCustomer(c);
    setPhoneInput(c.phone);
    setShowDropdown(false);
    setSuggestions([]);
    setShowNewCustomer(false);
  }

  // ── Exact search (Enter / button) ──────────────────────────────────────────
  const searchCustomer = useCallback(async (phone: string) => {
    if (phone.length < 6) return;
    // If we already have an exact suggestion, just use it
    const exact = suggestions.find((s) => s.phone === phone);
    if (exact) { selectSuggestion(exact); return; }

    setSearchingCustomer(true);
    setShowDropdown(false);
    try {
      const res = await fetch(`${API}/api/customers/by-phone/${encodeURIComponent(phone)}`, {
        headers: apiHeaders(),
      });
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

  // ── Create new customer ────────────────────────────────────────────────────
  async function createCustomer() {
    if (!newCust.name || !newCust.phone) return;
    try {
      const res = await fetch(`${API}/api/customers`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(newCust),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.customer) {
          setCustomer(data.customer);
          setShowNewCustomer(false);
          return;
        }
        throw new Error(data.error);
      }
      setCustomer(data);
      setShowNewCustomer(false);
      toast.success('Cliente creado', { icon: '✅' });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error creando cliente');
    }
  }

  // ── Cart operations ────────────────────────────────────────────────────────
  function addToCart(product: Product) {
    if (product.stock === 0) return;
    setCart((prev) => {
      const exists = prev.find((i) => i.id === product.id);
      if (exists) {
        if (exists.quantity >= product.stock) {
          toast.error(`Stock máximo: ${product.stock}`);
          return prev;
        }
        return prev.map((i) => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }

  function updateQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)
        .filter((i) => i.quantity > 0)
    );
  }

  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const selectedRate = shippingRates.find((r) => r.id === selectedShippingRateId);
  const shippingCost = !isPickup && selectedRate ? selectedRate.price : 0;
  const totalWithShipping = subtotal + shippingCost;

  // ── Submit order ────────────────────────────────────────────────────────────
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
        const d = new Date();
        d.setHours(h, m, 0, 0);
        if (d <= new Date()) d.setDate(d.getDate() + 1);
        estimatedDeliveryAt = d.toISOString();
      }

      const res = await fetch(`${API}/api/orders`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          customerId: customer.id,
          notes: orderNotes,
          isPickup,
          estimatedDeliveryAt,
          paymentMethod,
          cashGiven: paymentMethod === 'CASH' && cashGiven ? Number(cashGiven) : undefined,
          shippingRateId: !isPickup && selectedShippingRateId ? selectedShippingRateId : undefined,
          items: cart.map((i) => ({ productId: i.id, quantity: i.quantity })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.details) {
          const names = data.details.map((d: { productName: string }) => d.productName).join(', ');
          throw new Error(`Stock insuficiente: ${names}`);
        }
        throw new Error(data.error ?? 'Error creando pedido');
      }

      setOrderId(data.id);
      toast.success(`Pedido #${data.id.slice(-8).toUpperCase()} creado`, { icon: '🎉' });

      if (print) {
        await handlePrint(data.id);
      }

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
      const res = await fetch(`${API}/api/orders/${id}/print`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      if (!res.ok) throw new Error('Error generando comanda');
      const buffer = new Uint8Array(await res.arrayBuffer());
      await printViaWebUSB(buffer);
      toast.success('¡Comanda enviada a la impresora!', { icon: '🖨️' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error de impresión';
      toast.error(msg);
    } finally {
      setPrinting(false);
    }
  }

  function resetOrder() {
    setCustomer(null);
    setPhoneInput('');
    setSuggestions([]);
    setShowDropdown(false);
    setCart([]);
    setOrderNotes('');
    setIsPickup(false);
    setSelectedShippingRateId('');
    setDeliveryMode('minutes');
    setDeliveryMinutes('');
    setDeliveryTime('');
    setOrderId(null);
    setOrderDone(false);
    setShowNewCustomer(false);
    setNewCust({ name: '', phone: '', address: '' });
    phoneRef.current?.focus();
  }

  // ── Filtered products ───────────────────────────────────────────────────────
  const filteredProducts = products.filter((p) => {
    const matchCat = activeCategory === 'all' || (p.category ?? 'Sin categoría') === activeCategory;
    const matchSearch = !productSearch ||
      p.name.toLowerCase().includes(productSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ORDER DONE STATE
  // ─────────────────────────────────────────────────────────────────────────
  if (orderDone) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '2rem' }}>
        <div className="card animate-fade-up" style={{ maxWidth: 480, width: '100%', textAlign: 'center', padding: '3rem 2rem' }}>
          <div
            style={{
              width: 72, height: 72, borderRadius: '50%', margin: '0 auto 1.5rem',
              background: 'hsl(142 71% 45% / 0.2)', border: '2px solid hsl(142 71% 45%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Check size={36} style={{ color: 'hsl(142 71% 45%)' }} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            ¡Pedido confirmado!
          </h2>
          <p style={{ color: 'hsl(220 18% 65%)', marginBottom: '2rem' }}>
            #{orderId?.slice(-8).toUpperCase()} · {customer?.name}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              className="btn btn-ghost"
              onClick={() => handlePrint(orderId!)}
              disabled={printing}
              id="reprint-btn"
            >
              <Printer size={16} />
              {printing ? 'Imprimiendo…' : 'Reimprimir'}
            </button>
            <button className="btn btn-primary" onClick={resetOrder} id="new-order-btn">
              <Plus size={16} />
              Nuevo pedido
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN ORDER FORM
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      {/* ── LEFT: Products ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid hsl(222 30% 20%)' }}>
        
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid hsl(222 30% 20%)', background: 'hsl(222 47% 9%)' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.875rem' }}>Nueva Comanda</h1>
          
          {/* Product search */}
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 55%)' }} />
            <input
              type="text"
              placeholder="Buscar producto…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              style={{ paddingLeft: '2.25rem', background: 'hsl(222 40% 13%)' }}
              id="product-search"
            />
          </div>
        </div>

        {/* Categories */}
        <div
          style={{
            display: 'flex', gap: '0.5rem', padding: '0.875rem 1.5rem',
            overflowX: 'auto', borderBottom: '1px solid hsl(222 30% 20%)',
            background: 'hsl(222 47% 9%)',
          }}
        >
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

        {/* Product Grid */}
        <div
          style={{
            flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '0.875rem',
            alignContent: 'start',
          }}
        >
          {loadingProducts ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 120, borderRadius: 12, background: 'hsl(222 40% 13%)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))
          ) : filteredProducts.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'hsl(220 18% 55%)' }}>
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
                >
                  {/* Stock badge */}
                  {isOut ? (
                    <span className="badge badge-danger" style={{ position: 'absolute', top: 8, right: 8, fontSize: '0.65rem' }}>
                      Agotado
                    </span>
                  ) : product.stock <= 5 ? (
                    <span className="badge badge-warning" style={{ position: 'absolute', top: 8, right: 8, fontSize: '0.65rem' }}>
                      {product.stock} left
                    </span>
                  ) : null}

                  {/* Cart count */}
                  {inCart && (
                    <div
                      style={{
                        position: 'absolute', top: 8, left: 8,
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'hsl(var(--primary))', color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.75rem', fontWeight: 700,
                      }}
                    >
                      {inCart.quantity}
                    </div>
                  )}

                  <div style={{ paddingTop: inCart || isOut ? '0.5rem' : 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem', lineHeight: 1.3 }}>
                      {product.name}
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'hsl(var(--primary))' }}>
                      {product.price.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── RIGHT: Customer + Cart ── */}
      <div
        style={{
          width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: 'hsl(222 47% 9%)', overflow: 'hidden',
        }}
      >
        {/* ── Customer Section ── */}
        <div style={{ padding: '1.25rem', borderBottom: '1px solid hsl(222 30% 20%)' }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'hsl(220 18% 65%)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Cliente
          </div>

          {customer ? (
            <div
              className="card"
              style={{ padding: '0.875rem', background: 'hsl(142 71% 15% / 0.3)', borderColor: 'hsl(142 71% 45% / 0.3)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '0.5rem' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{customer.name}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'hsl(220 18% 65%)', marginTop: 3 }}>
                    <Phone size={11} style={{ display: 'inline', marginRight: 4 }} />{customer.phone}
                  </div>
                  {customer.address && (
                    <div style={{ fontSize: '0.75rem', color: 'hsl(220 18% 55%)', marginTop: 2 }}>{customer.address}</div>
                  )}
                </div>
                <button
                  onClick={() => { setCustomer(null); setPhoneInput(''); setSuggestions([]); setTimeout(() => phoneRef.current?.focus(), 50); }}
                  className="btn btn-sm btn-ghost"
                  style={{ padding: '0.25rem 0.5rem', flexShrink: 0 }}
                >
                  <X size={13} /> Cambiar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {/* Phone input with live-search dropdown */}
              <div ref={dropdownRef} style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <Phone size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 55%)' }} />
                    {searchingCustomer && (
                      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, border: '2px solid hsl(var(--primary))', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                    )}
                    <input
                      ref={phoneRef}
                      type="tel"
                      placeholder="Teléfono del cliente"
                      value={phoneInput}
                      onChange={(e) => { setPhoneInput(e.target.value); setShowNewCustomer(false); }}
                      onKeyDown={(e) => e.key === 'Enter' && searchCustomer(phoneInput)}
                      onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                      style={{ paddingLeft: '2rem', paddingRight: searchingCustomer ? '2rem' : undefined, background: 'hsl(222 40% 13%)' }}
                      id="customer-phone"
                      autoComplete="off"
                    />
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => searchCustomer(phoneInput)}
                    disabled={searchingCustomer || phoneInput.length < 6}
                    id="search-customer-btn"
                    style={{ flexShrink: 0 }}
                  >
                    <Search size={14} />
                  </button>
                </div>

                {/* Autocomplete dropdown */}
                {showDropdown && (suggestions.length > 0 || phoneInput.length >= 6) && (
                  <div
                    style={{
                      position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
                      background: 'hsl(222 40% 12%)', border: '1px solid hsl(222 30% 22%)',
                      borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 24px hsl(222 47% 5% / 0.7)',
                    }}
                  >
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.625rem',
                          width: '100%', padding: '0.625rem 0.875rem',
                          background: 'none', border: 'none', cursor: 'pointer',
                          textAlign: 'left', color: 'inherit', borderBottom: '1px solid hsl(222 30% 18%)',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--primary) / 0.1)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'hsl(var(--primary) / 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--primary))' }}>
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'hsl(220 18% 55%)' }}>{s.phone}</div>
                        </div>
                      </button>
                    ))}
                    {suggestions.length === 0 && phoneInput.length >= 6 && (
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setShowDropdown(false); setShowNewCustomer(true); setNewCust((p) => ({ ...p, phone: phoneInput })); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          width: '100%', padding: '0.75rem 0.875rem',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'hsl(38 95% 56%)', fontSize: '0.875rem', fontWeight: 600,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(38 95% 56% / 0.08)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >
                        <UserPlus size={14} />
                        Crear nuevo cliente con este número
                      </button>
                    )}
                  </div>
                )}
              </div>

              {showNewCustomer && (
                <div className="card animate-fade-up" style={{ padding: '1rem', background: 'hsl(222 40% 13%)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: 'hsl(38 95% 56%)' }}>
                    <AlertCircle size={14} />
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Cliente no encontrado. Crear nuevo:</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="Nombre completo"
                      value={newCust.name}
                      onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
                      style={{ background: 'hsl(222 47% 11%)' }}
                      id="new-customer-name"
                    />
                    <input
                      type="text"
                      placeholder="Dirección de entrega"
                      value={newCust.address}
                      onChange={(e) => setNewCust({ ...newCust, address: e.target.value })}
                      style={{ background: 'hsl(222 47% 11%)' }}
                      id="new-customer-address"
                    />
                    <button
                      className="btn btn-accent btn-sm"
                      onClick={createCustomer}
                      disabled={!newCust.name}
                      id="create-customer-btn"
                      style={{ justifyContent: 'center' }}
                    >
                      <UserPlus size={14} />
                      Crear cliente
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Cart ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'hsl(220 18% 65%)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Carrito
            </span>
            {cart.length > 0 && (
              <span className="badge badge-primary">{cartCount} ítem{cartCount !== 1 ? 's' : ''}</span>
            )}
          </div>

          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'hsl(220 18% 50%)' }}>
              <ShoppingBagIcon size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
              <p style={{ fontSize: '0.875rem' }}>Toca un producto para añadirlo</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="animate-slide-right"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.625rem',
                    background: 'hsl(222 40% 13%)', border: '1px solid hsl(222 30% 20%)',
                    borderRadius: '0.625rem', padding: '0.625rem 0.75rem',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'hsl(var(--primary))' }}>
                      {(item.price * item.quantity).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      style={{ width: 26, height: 26, border: '1px solid hsl(var(--border))', borderRadius: 6, background: 'none', cursor: 'pointer', color: 'hsl(220 18% 65%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Minus size={12} />
                    </button>
                    <span style={{ width: 20, textAlign: 'center', fontWeight: 700, fontSize: '0.9375rem' }}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => addToCart(item)}
                      disabled={item.quantity >= item.stock}
                      style={{ width: 26, height: 26, border: '1px solid hsl(var(--border))', borderRadius: 6, background: 'none', cursor: 'pointer', color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Plus size={12} />
                    </button>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      style={{ width: 26, height: 26, border: 'none', borderRadius: 6, background: 'none', cursor: 'pointer', color: 'hsl(0 84% 60%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer: Total + Actions ── */}
        <div style={{ padding: '1.25rem', borderTop: '1px solid hsl(222 30% 20%)', background: 'hsl(222 47% 8%)' }}>
          {/* Pickup toggle */}
          <button
            type="button"
            onClick={() => setIsPickup((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '0.625rem 0.875rem', marginBottom: '0.75rem',
              background: isPickup ? 'hsl(38 95% 56% / 0.12)' : 'hsl(222 40% 12%)',
              border: `1px solid ${isPickup ? 'hsl(38 95% 56% / 0.5)' : 'hsl(222 30% 22%)'}`,
              borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: isPickup ? 'hsl(38 95% 56%)' : 'hsl(220 18% 70%)' }}>
              🏪 Recogida en local
            </span>
            <div style={{
              width: 36, height: 20, borderRadius: 10, transition: 'background 0.2s',
              background: isPickup ? 'hsl(38 95% 56%)' : 'hsl(222 30% 28%)',
              position: 'relative', flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute', top: 2, left: isPickup ? 18 : 2,
                width: 16, height: 16, borderRadius: '50%', background: 'white',
                transition: 'left 0.2s',
              }} />
            </div>
          </button>

          {/* Shipping rate selector (solo si no es recogida y hay tarifas) */}
          {!isPickup && shippingRates.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--muted))', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <Truck size={12} />
                Tipo de envío
              </div>
              <select
                value={selectedShippingRateId}
                onChange={(e) => setSelectedShippingRateId(e.target.value)}
                style={{ background: 'hsl(222 40% 12%)', fontSize: '0.875rem' }}
                id="shipping-rate-select"
              >
                <option value="">Sin tarifa de envío</option>
                {shippingRates.map((rate) => (
                  <option key={rate.id} value={rate.id}>
                    {rate.name} — {rate.price.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Delivery time */}
          <div style={{ marginBottom: '0.875rem' }}>
            <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setDeliveryMode('minutes')}
                className={`btn btn-sm ${deliveryMode === 'minutes' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1, justifyContent: 'center', fontSize: '0.8rem' }}
              >
                En X minutos
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMode('time')}
                className={`btn btn-sm ${deliveryMode === 'time' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1, justifyContent: 'center', fontSize: '0.8rem' }}
              >
                A las HH:MM
              </button>
            </div>
            {deliveryMode === 'minutes' ? (
              <input
                type="number"
                placeholder="Minutos para la entrega (ej: 45)"
                min="1"
                max="240"
                value={deliveryMinutes}
                onChange={(e) => setDeliveryMinutes(e.target.value)}
                style={{ background: 'hsl(222 40% 12%)', fontSize: '0.875rem' }}
                id="delivery-minutes"
              />
            ) : (
              <input
                type="time"
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                style={{ background: 'hsl(222 40% 12%)', fontSize: '0.875rem' }}
                id="delivery-time"
              />
            )}
          </div>

          {/* Notes */}
          <textarea
            placeholder="Notas del pedido (opcional)"
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            rows={2}
            style={{ resize: 'none', marginBottom: '0.875rem', background: 'hsl(var(--surface2))', fontSize: '0.875rem' }}
            id="order-notes"
          />

          {/* Payment method */}
          <div style={{ marginBottom: '0.875rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--muted))', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Forma de pago
            </div>
            <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.5rem' }}>
              <button
                type="button"
                onClick={() => { setPaymentMethod('CASH'); setCashGiven(''); }}
                className={`btn btn-sm ${paymentMethod === 'CASH' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1, justifyContent: 'center', fontSize: '0.8rem' }}
                id="payment-cash"
              >
                💵 Efectivo
              </button>
              <button
                type="button"
                onClick={() => { setPaymentMethod('CARD'); setCashGiven(''); }}
                className={`btn btn-sm ${paymentMethod === 'CARD' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1, justifyContent: 'center', fontSize: '0.8rem' }}
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
                  min="0"
                  step="0.01"
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                  style={{ background: 'hsl(var(--surface2))', fontSize: '0.875rem', marginBottom: '0.375rem' }}
                  id="cash-given"
                />
                {cashGiven && Number(cashGiven) > 0 && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.5rem 0.75rem', borderRadius: 8, fontSize: '0.875rem',
                    background: Number(cashGiven) >= totalWithShipping ? 'hsl(142 71% 15% / 0.3)' : 'hsl(0 84% 20% / 0.3)',
                    border: `1px solid ${Number(cashGiven) >= totalWithShipping ? 'hsl(142 71% 45% / 0.4)' : 'hsl(0 84% 60% / 0.4)'}`,
                  }}>
                    <span style={{ color: 'hsl(var(--muted))', fontWeight: 500 }}>Cambio</span>
                    <span style={{ fontWeight: 700, color: Number(cashGiven) >= totalWithShipping ? 'hsl(142 71% 45%)' : 'hsl(0 84% 60%)' }}>
                      {Number(cashGiven) >= totalWithShipping
                        ? (Number(cashGiven) - totalWithShipping).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
                        : 'Importe insuficiente'}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Total */}
          <div style={{ marginBottom: '1rem' }}>
            {shippingCost > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'hsl(220 18% 55%)', marginBottom: '0.25rem' }}>
                <span>Productos</span>
                <span>{subtotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
              </div>
            )}
            {shippingCost > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'hsl(220 18% 55%)', marginBottom: '0.375rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Truck size={11} /> {selectedRate?.name}
                </span>
                <span>{shippingCost.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'hsl(220 18% 65%)', fontWeight: 600 }}>Total estimado</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'hsl(var(--primary))' }}>
                {totalWithShipping.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <button
              className="btn btn-accent btn-lg"
              onClick={() => submitOrder(true)}
              disabled={submitting || printing || cart.length === 0 || !customer}
              id="confirm-print-btn"
              style={{ justifyContent: 'center' }}
            >
              <Printer size={18} />
              {submitting ? 'Confirmando…' : 'Confirmar e Imprimir'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => submitOrder(false)}
              disabled={submitting || cart.length === 0 || !customer}
              id="confirm-only-btn"
              style={{ justifyContent: 'center', fontSize: '0.875rem' }}
            >
              <Check size={16} />
              Solo confirmar
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}

// Simple inline icon
function ShoppingBagIcon({ size, style }: { size: number; style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      display="block"
    >
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 01-8 0"/>
    </svg>
  );
}
