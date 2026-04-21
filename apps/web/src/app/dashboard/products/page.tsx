'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Edit2, Trash2, Package, AlertTriangle,
  TrendingUp, TrendingDown, X, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  category?: string;
  imageUrl?: string;
  active: boolean;
}

function apiHeaders() {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

const EMPTY_FORM = { name: '', description: '', price: '', stock: '', category: '', imageUrl: '' };

export default function ProductsPage() {
  const [products, setProducts]   = useState<Product[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [editTarget, setEdit]     = useState<Product | null>(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [updatingStock, setUpdatingStock] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/products?active=true`, { headers: apiHeaders() });
      if (!res.ok) throw new Error();
      setProducts(await res.json());
    } catch {
      toast.error('Error cargando productos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  function openCreate() {
    setEdit(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEdit(p);
    setForm({
      name: p.name,
      description: p.description ?? '',
      price: String(p.price),
      stock: String(p.stock),
      category: p.category ?? '',
      imageUrl: p.imageUrl ?? '',
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name || !form.price) { toast.error('Nombre y precio son requeridos'); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        price: parseFloat(form.price),
        stock: parseInt(form.stock || '0'),
        category: form.category || undefined,
        imageUrl: form.imageUrl || undefined,
      };

      const url    = editTarget ? `${API}/api/products/${editTarget.id}` : `${API}/api/products`;
      const method = editTarget ? 'PATCH' : 'POST';

      const res = await fetch(url, { method, headers: apiHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Error guardando');

      toast.success(editTarget ? 'Producto actualizado' : 'Producto creado');
      setShowForm(false);
      loadProducts();
    } catch {
      toast.error('Error guardando producto');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Desactivar este producto?')) return;
    try {
      await fetch(`${API}/api/products/${id}`, { method: 'DELETE', headers: apiHeaders() });
      toast.success('Producto desactivado');
      loadProducts();
    } catch {
      toast.error('Error');
    }
  }

  async function quickStock(id: string, delta: number) {
    setUpdatingStock(id);
    try {
      const product = products.find((p) => p.id === id)!;
      const newStock = Math.max(0, product.stock + delta);
      const res = await fetch(`${API}/api/products/${id}`, {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify({ stock: newStock }),
      });
      if (!res.ok) throw new Error();
      setProducts((prev) => prev.map((p) => p.id === id ? { ...p, stock: newStock } : p));
    } catch {
      toast.error('Error actualizando stock');
    } finally {
      setUpdatingStock(null);
    }
  }

  const filtered = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.category ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const byCategory = filtered.reduce<Record<string, Product[]>>((acc, p) => {
    const cat = p.category ?? 'Sin categoría';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const totalItems  = products.length;
  const outOfStock  = products.filter((p) => p.stock === 0).length;
  const lowStock    = products.filter((p) => p.stock > 0 && p.stock <= 5).length;

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>Productos & Stock</h1>
          <p style={{ color: 'hsl(220 18% 65%)', fontSize: '0.9rem' }}>{totalItems} productos activos</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} id="create-product-btn">
          <Plus size={16} /> Nuevo producto
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.875rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total productos', value: totalItems, icon: Package, color: 'hsl(262 83% 66%)' },
          { label: 'Stock bajo (≤5)', value: lowStock,   icon: TrendingDown, color: 'hsl(38 95% 56%)' },
          { label: 'Agotados',        value: outOfStock, icon: AlertTriangle, color: 'hsl(0 84% 60%)' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={20} style={{ color }} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{value}</div>
              <div style={{ fontSize: '0.8rem', color: 'hsl(220 18% 60%)' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(220 18% 55%)' }} />
        <input
          type="text"
          placeholder="Buscar por nombre o categoría…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ paddingLeft: '2.25rem', maxWidth: 400 }}
          id="product-search-input"
        />
      </div>

      {/* Products by category */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.875rem' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 100, borderRadius: 12, background: 'hsl(222 40% 13%)', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : Object.keys(byCategory).length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem', color: 'hsl(220 18% 55%)' }}>
          <Package size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
          <p>No hay productos. ¡Crea el primero!</p>
        </div>
      ) : (
        Object.entries(byCategory).map(([cat, prods]) => (
          <div key={cat} style={{ marginBottom: '1.75rem' }}>
            <h2 style={{ fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'hsl(220 18% 55%)', marginBottom: '0.75rem' }}>
              {cat} ({prods.length})
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
              {prods.map((p) => {
                const isOut  = p.stock === 0;
                const isLow  = p.stock > 0 && p.stock <= 5;
                const isUpd  = updatingStock === p.id;

                return (
                  <div
                    key={p.id}
                    className="card animate-fade-up"
                    style={{
                      padding: '1rem',
                      display: 'flex',
                      gap: '0.875rem',
                      alignItems: 'center',
                      borderColor: isOut ? 'hsl(0 84% 60% / 0.4)' : isLow ? 'hsl(38 95% 56% / 0.4)' : undefined,
                    }}
                  >
                    {/* Product info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: 'hsl(262 83% 66%)', marginBottom: '0.375rem' }}>
                        {Number(p.price).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </div>
                      {/* Stock control */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <button
                          onClick={() => quickStock(p.id, -1)}
                          disabled={isUpd || p.stock === 0}
                          style={{ width: 24, height: 24, border: '1px solid hsl(222 30% 25%)', borderRadius: 5, background: 'none', cursor: 'pointer', color: 'hsl(220 18% 65%)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}
                        >
                          <TrendingDown size={11} />
                        </button>
                        <span
                          style={{
                            fontWeight: 700, fontSize: '0.875rem', minWidth: 28, textAlign: 'center',
                            color: isOut ? 'hsl(0 84% 60%)' : isLow ? 'hsl(38 95% 56%)' : 'hsl(142 71% 45%)',
                          }}
                        >
                          {isUpd ? '…' : p.stock}
                        </span>
                        <button
                          onClick={() => quickStock(p.id, 1)}
                          disabled={isUpd}
                          style={{ width: 24, height: 24, border: '1px solid hsl(222 30% 25%)', borderRadius: 5, background: 'none', cursor: 'pointer', color: 'hsl(142 71% 45%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <TrendingUp size={11} />
                        </button>
                        {isOut && <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>Agotado</span>}
                        {isLow && !isOut && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Stock bajo</span>}
                      </div>
                    </div>

                    {/* Edit / Delete */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', flexShrink: 0 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => openEdit(p)}
                        id={`edit-${p.id}`}
                        style={{ padding: '0.3rem 0.6rem' }}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(p.id)}
                        id={`delete-${p.id}`}
                        style={{ padding: '0.3rem 0.6rem' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* ── Modal: Create / Edit Product ── */}
      {showForm && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'hsl(222 47% 5% / 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <div
            className="card animate-fade-up"
            style={{ width: '100%', maxWidth: 500, padding: '1.75rem', position: 'relative' }}
          >
            <button
              onClick={() => setShowForm(false)}
              style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(220 18% 55%)', padding: 4 }}
            >
              <X size={18} />
            </button>
            <h2 style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '1.25rem' }}>
              {editTarget ? 'Editar producto' : 'Nuevo producto'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label htmlFor="p-name">Nombre *</label>
                <input id="p-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label htmlFor="p-price">Precio (€) *</label>
                  <input id="p-price" type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                </div>
                <div>
                  <label htmlFor="p-stock">Stock inicial</label>
                  <input id="p-stock" type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
                </div>
              </div>
              <div>
                <label htmlFor="p-category">Categoría</label>
                <input id="p-category" type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Pizzas, Bebidas, Postres…" />
              </div>
              <div>
                <label htmlFor="p-desc">Descripción</label>
                <textarea id="p-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ resize: 'vertical' }} />
              </div>
              <div>
                <label htmlFor="p-img">URL de imagen (opcional)</label>
                <input id="p-img" type="url" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…/imagen.jpg" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} style={{ flex: 1, justifyContent: 'center' }}>
                <X size={15} /> Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} id="save-product-btn" style={{ flex: 1, justifyContent: 'center' }}>
                <Check size={15} />
                {saving ? 'Guardando…' : editTarget ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }`}</style>
    </div>
  );
}
