'use client';

import { useState, useEffect } from 'react';
import { Save, Printer, Globe, Layers } from 'lucide-react';
import toast from 'react-hot-toast';

const API = '';

interface BusinessSettings {
  id: string;
  name: string;
  logoUrl?: string;
  phone?: string;
  address?: string;
  paperWidth: number;
  printerMode: string;
  printServerUrl?: string;
  currency: string;
  taxRate: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  function apiHeaders() {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/api/settings`, { headers: apiHeaders() });
        if (!res.ok) throw new Error('Error cargando ajustes');
        setSettings(await res.json());
      } catch {
        toast.error('Error cargando ajustes');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
          phone: settings.phone,
          address: settings.address,
          logoUrl: settings.logoUrl,
          paperWidth: String(settings.paperWidth),
          printerMode: settings.printerMode,
          printServerUrl: settings.printServerUrl,
          currency: settings.currency,
          taxRate: settings.taxRate,
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
        <div style={{ height: 24, width: 200, background: 'hsl(222 40% 15%)', borderRadius: 8, marginBottom: '2rem' }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ height: 44, borderRadius: 10, background: 'hsl(222 40% 15%)', marginBottom: '1rem', animation: 'pulse 1.5s infinite' }} />
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
        <p style={{ color: 'hsl(220 18% 65%)', fontSize: '0.9rem' }}>Configura la información de tu restaurante, impresión y pagos.</p>
      </div>

      <form onSubmit={handleSave}>
        {/* ── Info del local ── */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.25rem' }}>
            <Globe size={18} style={{ color: 'hsl(262 83% 66%)' }} />
            <h2 style={{ fontWeight: 700 }}>Información del local</h2>
          </div>
          {field('Nombre del local', 'name', (
            <input id="name" type="text" value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} required />
          ))}
          {field('Teléfono', 'phone', (
            <input id="phone" type="tel" value={settings.phone ?? ''} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} placeholder="+34 912 345 678" />
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
            <Printer size={18} style={{ color: 'hsl(262 83% 66%)' }} />
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
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              {[
                { value: 'webusb', label: '🔌 WebUSB (Chrome)' },
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
            <Layers size={18} style={{ color: 'hsl(262 83% 66%)' }} />
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

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; } }`}</style>
    </div>
  );
}
