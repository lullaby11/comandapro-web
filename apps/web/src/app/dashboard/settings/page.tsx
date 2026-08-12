'use client';

import { useState, useEffect } from 'react';
import { Save, Printer, Globe, Layers, Truck, Plus, Trash2, Pencil, Check, X, ShoppingBag, Copy, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

const API = '';

interface BusinessSettings {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  phone?: string;
  /** Buzón del local: recibe las respuestas de los clientes a sus correos. */
  email?: string | null;
  address?: string;
  paperWidth: number;
  printerMode: string;
  printServerUrl?: string;
  currency: string;
  taxRate: number;
  onlineOrderEnabled: boolean;
}

interface ShippingRate {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  const [shippingRates, setShippingRates]       = useState<ShippingRate[]>([]);
  const [loadingRates, setLoadingRates]         = useState(true);
  const [newRate, setNewRate]                   = useState({ name: '', price: '' });
  const [addingRate, setAddingRate]             = useState(false);
  const [editingRateId, setEditingRateId]       = useState<string | null>(null);
  const [editingRate, setEditingRate]           = useState({ name: '', price: '' });

  function apiHeaders() {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, ratesRes] = await Promise.all([
          fetch(`${API}/api/settings`, { headers: apiHeaders() }),
          fetch(`${API}/api/shipping-rates`, { headers: apiHeaders() }),
        ]);
        if (!settingsRes.ok) throw new Error('Error cargando ajustes');
        setSettings(await settingsRes.json());
        if (ratesRes.ok) setShippingRates(await ratesRes.json());
      } catch {
        toast.error('Error cargando ajustes');
      } finally {
        setLoading(false);
        setLoadingRates(false);
      }
    }
    load();
  }, []);

  async function addShippingRate() {
    if (!newRate.name || newRate.price === '') return;
    setAddingRate(true);
    try {
      const res = await fetch(`${API}/api/shipping-rates`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ name: newRate.name, price: Number(newRate.price) }),
      });
      if (!res.ok) throw new Error('Error creando tarifa');
      const rate = await res.json();
      setShippingRates((prev) => [...prev, rate]);
      setNewRate({ name: '', price: '' });
      toast.success('Tarifa añadida');
    } catch {
      toast.error('Error creando tarifa');
    } finally {
      setAddingRate(false);
    }
  }

  async function saveEditingRate() {
    if (!editingRateId) return;
    try {
      const res = await fetch(`${API}/api/shipping-rates/${editingRateId}`, {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify({ name: editingRate.name, price: Number(editingRate.price) }),
      });
      if (!res.ok) throw new Error('Error actualizando tarifa');
      const updated = await res.json();
      setShippingRates((prev) => prev.map((r) => (r.id === editingRateId ? updated : r)));
      setEditingRateId(null);
      toast.success('Tarifa actualizada');
    } catch {
      toast.error('Error actualizando tarifa');
    }
  }

  async function deleteShippingRate(id: string) {
    try {
      const res = await fetch(`${API}/api/shipping-rates/${id}`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });
      if (!res.ok) throw new Error('Error eliminando tarifa');
      setShippingRates((prev) => prev.filter((r) => r.id !== id));

      // Si la tarifa la usan pedidos anteriores, la API la desactiva en lugar de
      // borrarla para no romper su histórico. Conviene decirlo, no fingir un borrado.
      const data = res.status === 204 ? null : await res.json().catch(() => null);
      toast.success(data?.deactivated ? data.message : 'Tarifa eliminada');
    } catch {
      toast.error('Error eliminando tarifa');
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/settings`, {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify({
          name: settings.name,
          phone: settings.phone || undefined,
          email: settings.email ?? '',
          address: settings.address || undefined,
          logoUrl: settings.logoUrl || null,
          paperWidth: String(settings.paperWidth),
          printerMode: settings.printerMode,
          printServerUrl: settings.printServerUrl || null,
          currency: settings.currency,
          taxRate: settings.taxRate,
          onlineOrderEnabled: settings.onlineOrderEnabled,
        }),
      });
      if (!res.ok) throw new Error('Error guardando ajustes');
      const updated = await res.json();
      setSettings(updated);
      toast.success('Ajustes guardados');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ height: 24, width: 200, background: 'hsl(var(--surface2))', borderRadius: 8, marginBottom: '2rem' }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ height: 44, borderRadius: 10, background: 'hsl(var(--surface2))', marginBottom: '1rem', animation: 'pulse 1.5s infinite' }} />
        ))}
        <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }`}</style>
      </div>
    );
  }

  function field(label: string, id: string, element: React.ReactNode) {
    return (
      <div style={{ marginBottom: '1.25rem' }}>
        <label htmlFor={id}>{label}</label>
        {element}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>Ajustes del local</h1>
        <p style={{ color: 'hsl(var(--muted))', fontSize: '0.9rem' }}>Configura la información de tu restaurante, impresión y pagos.</p>
      </div>

      <form onSubmit={handleSave}>
        {/* ── Info del local ── */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.25rem' }}>
            <Globe size={18} style={{ color: 'hsl(var(--primary))' }} />
            <h2 style={{ fontWeight: 700 }}>Información del local</h2>
          </div>
          {field('Nombre del local', 'name', (
            <input id="name" type="text" value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} required />
          ))}
          {field('Teléfono', 'phone', (
            <input id="phone" type="tel" value={settings.phone ?? ''} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} placeholder="+34 912 345 678" />
          ))}
          {field('Email del local', 'email', (
            <>
              <input
                id="email"
                type="email"
                value={settings.email ?? ''}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                placeholder="pedidos@milocal.com"
              />
              <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted))', marginTop: '0.375rem', lineHeight: 1.5 }}>
                Cuando un cliente responda a un correo de tu local —la confirmación de un
                pedido, por ejemplo— su respuesta llegará aquí. Si lo dejas vacío, irá al
                soporte de Olyda.
              </p>
            </>
          ))}
          {field('Dirección', 'address', (
            <input id="address" type="text" value={settings.address ?? ''} onChange={(e) => setSettings({ ...settings, address: e.target.value })} placeholder="Calle Principal 1, Madrid" />
          ))}
          {field('URL del logo (opcional)', 'logoUrl', (
            <input id="logoUrl" type="url" value={settings.logoUrl ?? ''} onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })} placeholder="https://…/logo.png" />
          ))}
        </div>

        {/* ── Impresión ── */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.25rem' }}>
            <Printer size={18} style={{ color: 'hsl(var(--primary))' }} />
            <h2 style={{ fontWeight: 700 }}>Configuración de impresión</h2>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label>Ancho de papel</label>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              {[58, 80].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setSettings({ ...settings, paperWidth: w })}
                  className={`btn ${settings.paperWidth === w ? 'btn-primary' : 'btn-ghost'}`}
                  id={`paper-${w}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {w}mm
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label>Modo de impresión</label>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              {[
                { value: 'webusb',      label: '🔌 USB (Chrome)' },
                { value: 'bluetooth',   label: '📶 Bluetooth' },
                { value: 'printserver', label: '🖧 Servidor local' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSettings({ ...settings, printerMode: value })}
                  className={`btn ${settings.printerMode === value ? 'btn-primary' : 'btn-ghost'}`}
                  id={`mode-${value}`}
                  style={{ flex: 1, justifyContent: 'center', fontSize: '0.875rem' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {settings.printerMode === 'bluetooth' && (
            <div style={{
              background: 'hsl(220 80% 50% / 0.08)',
              border: '1px solid hsl(220 80% 55% / 0.3)',
              borderRadius: 10,
              padding: '0.75rem 1rem',
              fontSize: '0.8125rem',
              color: 'hsl(var(--muted))',
              marginBottom: '0.5rem',
            }}>
              La conexión Bluetooth se establece al pulsar el botón de imprimir en cada pedido.
              Compatible con Chrome en Android y Chrome/Edge en escritorio.
              No funciona en Safari ni en iOS.
            </div>
          )}

          {settings.printerMode === 'printserver' && (
            <div style={{ marginBottom: '0.5rem', animation: 'fadeIn 0.2s ease' }}>
              {field('URL del servidor de impresión local', 'printServerUrl', (
                <input
                  id="printServerUrl"
                  type="url"
                  value={settings.printServerUrl ?? ''}
                  onChange={(e) => setSettings({ ...settings, printServerUrl: e.target.value })}
                  placeholder="http://192.168.1.100:3001"
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Facturación ── */}
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.25rem' }}>
            <Layers size={18} style={{ color: 'hsl(var(--primary))' }} />
            <h2 style={{ fontWeight: 700 }}>Moneda e impuestos</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {field('Moneda (ISO 4217)', 'currency', (
              <select
                id="currency"
                value={settings.currency}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
              >
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — Dólar</option>
                <option value="GBP">GBP — Libra</option>
                <option value="MXN">MXN — Peso mexicano</option>
                <option value="COP">COP — Peso colombiano</option>
                <option value="ARS">ARS — Peso argentino</option>
              </select>
            ))}
            {field('Tipo IVA (%)', 'taxRate', (
              <input
                id="taxRate"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={settings.taxRate}
                onChange={(e) => setSettings({ ...settings, taxRate: Number(e.target.value) })}
              />
            ))}
          </div>
        </div>

        {/* ── Venta online ── */}
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.25rem' }}>
            <ShoppingBag size={18} style={{ color: 'hsl(var(--primary))' }} />
            <h2 style={{ fontWeight: 700 }}>Venta online</h2>
          </div>

          {/* Toggle */}
          <button
            type="button"
            onClick={() => setSettings({ ...settings, onlineOrderEnabled: !settings.onlineOrderEnabled })}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '1rem', marginBottom: '1rem',
              background: settings.onlineOrderEnabled ? 'hsl(262 80% 45% / 0.1)' : 'hsl(var(--surface2))',
              border: `1px solid ${settings.onlineOrderEnabled ? 'hsl(262 80% 55% / 0.5)' : 'hsl(var(--border))'}`,
              borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, color: settings.onlineOrderEnabled ? 'hsl(262 80% 75%)' : 'hsl(var(--text))' }}>
                Aceptar pedidos online
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted))', marginTop: 3 }}>
                {settings.onlineOrderEnabled
                  ? 'Los clientes pueden hacer pedidos desde la URL pública del comercio'
                  : 'La tienda online está desactivada'}
              </div>
            </div>
            <div style={{
              width: 48, height: 26, borderRadius: 13, flexShrink: 0, marginLeft: '1rem',
              background: settings.onlineOrderEnabled ? 'hsl(262 80% 55%)' : 'hsl(220 18% 30%)',
              position: 'relative', transition: 'background 0.2s',
            }}>
              <div style={{
                position: 'absolute', top: 3, left: settings.onlineOrderEnabled ? 25 : 3,
                width: 20, height: 20, borderRadius: '50%', background: 'white',
                transition: 'left 0.2s',
              }} />
            </div>
          </button>

          {/* URL pública */}
          {settings.onlineOrderEnabled && (
            <div style={{ background: 'hsl(262 80% 45% / 0.08)', border: '1px solid hsl(262 80% 55% / 0.3)', borderRadius: 10, padding: '0.875rem 1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(262 80% 65%)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                URL pública de pedidos
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <code style={{ flex: 1, fontSize: '0.875rem', color: 'hsl(262 80% 80%)', wordBreak: 'break-all' }}>
                  {typeof window !== 'undefined' ? window.location.origin : 'https://olyda.app'}/{settings.slug}/pedidos
                </code>
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/${settings.slug}/pedidos`;
                    navigator.clipboard.writeText(url);
                    toast.success('URL copiada');
                  }}
                  className="btn btn-ghost btn-sm"
                  title="Copiar URL"
                  style={{ flexShrink: 0, color: 'hsl(262 80% 65%)' }}
                >
                  <Copy size={14} />
                </button>
                <a
                  href={`/${settings.slug}/pedidos`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm"
                  title="Abrir tienda"
                  style={{ flexShrink: 0, color: 'hsl(262 80% 65%)' }}
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-lg"
          disabled={saving}
          id="save-settings-btn"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          <Save size={18} />
          {saving ? 'Guardando…' : 'Guardar ajustes'}
        </button>
      </form>

      {/* ── Tarifas de envío ── */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.25rem' }}>
          <Truck size={18} style={{ color: 'hsl(var(--primary))' }} />
          <h2 style={{ fontWeight: 700 }}>Tarifas de envío</h2>
        </div>

        {loadingRates ? (
          <div style={{ color: 'hsl(var(--muted))', fontSize: '0.875rem' }}>Cargando tarifas…</div>
        ) : (
          <>
            {shippingRates.length === 0 && (
              <p style={{ color: 'hsl(var(--muted))', fontSize: '0.875rem', marginBottom: '1rem' }}>
                No hay tarifas de envío configuradas.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1.25rem' }}>
              {shippingRates.map((rate) => (
                <div
                  key={rate.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    background: 'hsl(var(--surface2))', borderRadius: 10,
                    padding: '0.75rem 1rem', border: '1px solid hsl(var(--border))',
                  }}
                >
                  {editingRateId === rate.id ? (
                    <>
                      <input
                        type="text"
                        value={editingRate.name}
                        onChange={(e) => setEditingRate({ ...editingRate, name: e.target.value })}
                        style={{ flex: 1, fontSize: '0.875rem' }}
                        id={`edit-rate-name-${rate.id}`}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editingRate.price}
                        onChange={(e) => setEditingRate({ ...editingRate, price: e.target.value })}
                        style={{ width: 90, fontSize: '0.875rem' }}
                        id={`edit-rate-price-${rate.id}`}
                      />
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={saveEditingRate}
                        id={`save-rate-${rate.id}`}
                        style={{ padding: '0.25rem 0.5rem' }}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => setEditingRateId(null)}
                        style={{ padding: '0.25rem 0.5rem' }}
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontWeight: 600, fontSize: '0.875rem' }}>{rate.name}</span>
                      <span style={{ fontSize: '0.875rem', color: 'hsl(var(--primary))', fontWeight: 700, minWidth: 60, textAlign: 'right' }}>
                        {Number(rate.price).toLocaleString('es-ES', { style: 'currency', currency: settings?.currency ?? 'EUR' })}
                      </span>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => { setEditingRateId(rate.id); setEditingRate({ name: rate.name, price: String(rate.price) }); }}
                        id={`edit-rate-${rate.id}`}
                        style={{ padding: '0.25rem 0.5rem' }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => deleteShippingRate(rate.id)}
                        id={`delete-rate-${rate.id}`}
                        style={{ padding: '0.25rem 0.5rem', color: 'hsl(0 84% 60%)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Añadir nueva tarifa */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted))' }}>Nombre</label>
                <input
                  type="text"
                  placeholder="Ej: Zona centro, Express…"
                  value={newRate.name}
                  onChange={(e) => setNewRate({ ...newRate, name: e.target.value })}
                  style={{ marginTop: '0.25rem' }}
                  id="new-rate-name"
                />
              </div>
              <div style={{ width: 100 }}>
                <label style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted))' }}>Precio</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={newRate.price}
                  onChange={(e) => setNewRate({ ...newRate, price: e.target.value })}
                  style={{ marginTop: '0.25rem' }}
                  id="new-rate-price"
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={addShippingRate}
                disabled={addingRate || !newRate.name || newRate.price === ''}
                id="add-rate-btn"
                style={{ flexShrink: 0 }}
              >
                <Plus size={16} />
                Añadir
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; } }`}</style>
    </div>
  );
}
