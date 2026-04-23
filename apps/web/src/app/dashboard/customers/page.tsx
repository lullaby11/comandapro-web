'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Search, UserPlus, Phone, MapPin, FileText,
  Users, ShoppingBag, X, Check, Edit2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

const API = '';

interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt: string;
}

function apiHeaders() {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

const EMPTY_FORM = { name: '', phone: '', email: '', address: '', notes: '' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [editTarget, setEdit]     = useState<Customer | null>(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);

  const loadCustomers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.match(/^\d+/)) params.set('phone', search);
      else if (search) params.set('name', search);
      params.set('limit', '50');

      const res = await fetch(`${API}/api/customers?${params}`, { headers: apiHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCustomers(data.customers);
      setTotal(data.total);
    } catch {
      toast.error('Error cargando clientes');
    } finally {
      setLoading(false);
    }
  }, [search]);

  // Debounced search
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(loadCustomers, 400);
    return () => clearTimeout(t);
  }, [loadCustomers]);

  function openCreate() {
    setEdit(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(c: Customer) {
    setEdit(c);
    setForm({ name: c.name, phone: c.phone, email: c.email ?? '', address: c.address ?? '', notes: c.notes ?? '' });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name || !form.phone) { toast.error('Nombre y teléfono son requeridos'); return; }
    setSaving(true);
    try {
      const body = { name: form.name, phone: form.phone, email: form.email || undefined, address: form.address || undefined, notes: form.notes || undefined };
      const url    = editTarget ? `${API}/api/customers/${editTarget.id}` : `${API}/api/customers`;
      const method = editTarget ? 'PUT' : 'POST';

      const res = await fetch(url, { method, headers: apiHeaders(), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');

      toast.success(editTarget ? 'Cliente actualizado' : 'Cliente creado');
      setShowForm(false);
      loadCustomers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>Clientes</h1>
          <p style={{ color: 'hsl(220 18% 65%)', fontSize: '0.9rem' }}>{total} cliente{total !== 1 ? 's' : ''} registrados</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} id="create-customer-btn">
          <UserPlus size={16} /> Nuevo cliente
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1.5rem', maxWidth: 420 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 55%)' }} />
        <input
          type="text"
          placeholder="Buscar por nombre o teléfono…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ paddingLeft: '2.25rem' }}
          id="customer-search-input"
        />
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 80, borderRadius: 12, background: 'hsl(222 40% 13%)', animation: 'pulse 1.5s infinite', animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'hsl(220 18% 55%)' }}>
          <Users size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
          <p>{search ? 'Sin resultados para esa búsqueda' : 'No hay clientes aún'}</p>
          {!search && (
            <button className="btn btn-primary btn-sm" onClick={openCreate} style={{ marginTop: '1.25rem', display: 'inline-flex' }}>
              <UserPlus size={14} /> Crear el primero
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {customers.map((c, idx) => (
            <div
              key={c.id}
              className="card animate-fade-up"
              style={{
                padding: '1rem 1.25rem',
                animationDelay: `${idx * 40}ms`,
                display: 'flex',
                gap: '1rem',
                alignItems: 'center',
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: 'hsl(var(--primary) / 0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.1rem', fontWeight: 700, color: 'hsl(var(--primary))',
                }}
              >
                {c.name[0].toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: '0.2rem' }}>{c.name}</div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8125rem', color: 'hsl(220 18% 65%)' }}>
                    <Phone size={11} /> {c.phone}
                  </span>
                  {c.address && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8125rem', color: 'hsl(220 18% 55%)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                      <MapPin size={11} /> {c.address}
                    </span>
                  )}
                  {c.notes && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8125rem', color: 'hsl(38 95% 56%)' }}>
                      <FileText size={11} /> {c.notes.slice(0, 30)}{c.notes.length > 30 ? '…' : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Date */}
              <div style={{ fontSize: '0.75rem', color: 'hsl(220 18% 45%)', flexShrink: 0, textAlign: 'right' }}>
                {new Date(c.createdAt).toLocaleDateString('es-ES')}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <Link
                  href={`/dashboard/orders/new?phone=${c.phone}`}
                  className="btn btn-primary btn-sm"
                  title="Nueva comanda para este cliente"
                  id={`order-for-${c.id}`}
                >
                  <ShoppingBag size={13} />
                </Link>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => openEdit(c)}
                  id={`edit-customer-${c.id}`}
                  style={{ padding: '0.3rem 0.6rem' }}
                >
                  <Edit2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {showForm && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'hsl(222 47% 5% / 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="card animate-fade-up" style={{ width: '100%', maxWidth: 480, padding: '1.75rem', position: 'relative' }}>
            <button onClick={() => setShowForm(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(220 18% 55%)', padding: 4 }}>
              <X size={18} />
            </button>
            <h2 style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '1.25rem' }}>
              {editTarget ? 'Editar cliente' : 'Nuevo cliente'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label htmlFor="c-name">Nombre *</label>
                <input id="c-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label htmlFor="c-phone">Teléfono *</label>
                <input id="c-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
              </div>
              <div>
                <label htmlFor="c-email">Email</label>
                <input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="cliente@email.com" />
              </div>
              <div>
                <label htmlFor="c-address">Dirección de entrega</label>
                <input id="c-address" type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Calle…" />
              </div>
              <div>
                <label htmlFor="c-notes">Notas (alergias, preferencias…)</label>
                <textarea id="c-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} style={{ flex: 1, justifyContent: 'center' }}>
                <X size={15} /> Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} id="save-customer-btn" style={{ flex: 1, justifyContent: 'center' }}>
                <Check size={15} />
                {saving ? 'Guardando…' : editTarget ? 'Guardar' : 'Crear cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }`}</style>
    </div>
  );
}
