import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { escenarioBase, crearProducto, crearCliente } from '../../__tests__/setup/factories';

/**
 * `/stats/product/:id` cruzaba pedidos y clientes en memoria, con un `orders.find()`
 * dentro de un bucle. Además de degradarse con el histórico, no estaba cubierto: estos
 * tests fijan el resultado antes y después de pasarlo a SQL agregado.
 */
async function pedidoDe(
  e: Awaited<ReturnType<typeof escenarioBase>>,
  customerId: string,
  productId: string,
  quantity: number
) {
  const r = await request(app)
    .post('/api/orders')
    .set(e.auth)
    .send({ customerId, items: [{ productId, quantity }] })
    .expect(201);
  return r.body.id as string;
}

describe('GET /stats/product/:id', () => {
  it('suma las unidades y el importe de un producto', async () => {
    const e = await escenarioBase({ stock: 100, precio: 10 });
    await pedidoDe(e, e.customer.id, e.product.id, 3);
    await pedidoDe(e, e.customer.id, e.product.id, 2);

    const res = await request(app).get(`/api/stats/product/${e.product.id}`).set(e.auth).expect(200);

    expect(res.body.summary.totalSold).toBe(5);
    expect(res.body.summary.totalRevenue).toBe(50);
  });

  it('agrupa por cliente y ordena por unidades', async () => {
    const e = await escenarioBase({ stock: 100, precio: 10 });
    const otro = await crearCliente(e.business.id, { name: 'Compra Mucho', phone: '600777888' });

    await pedidoDe(e, e.customer.id, e.product.id, 1);
    await pedidoDe(e, otro.id, e.product.id, 4);
    await pedidoDe(e, otro.id, e.product.id, 2);

    const res = await request(app).get(`/api/stats/product/${e.product.id}`).set(e.auth).expect(200);

    expect(res.body.topCustomers).toHaveLength(2);
    // El que más compró va primero, y sus dos pedidos aparecen sumados
    expect(res.body.topCustomers[0]).toMatchObject({
      customerId: otro.id,
      name: 'Compra Mucho',
      phone: '600777888',
      totalQty: 6,
      totalSpent: 60,
    });
    expect(res.body.topCustomers[1].totalQty).toBe(1);
  });

  it('no cuenta pedidos cancelados ni borrados', async () => {
    const e = await escenarioBase({ stock: 100, precio: 10 });
    await pedidoDe(e, e.customer.id, e.product.id, 1);

    const cancelado = await pedidoDe(e, e.customer.id, e.product.id, 5);
    await request(app).patch(`/api/orders/${cancelado}/status`).set(e.auth).send({ status: 'CANCELLED' }).expect(200);

    const borrado = await pedidoDe(e, e.customer.id, e.product.id, 7);
    await request(app).delete(`/api/orders/${borrado}`).set(e.auth).expect(204);

    const res = await request(app).get(`/api/stats/product/${e.product.id}`).set(e.auth).expect(200);

    expect(res.body.summary.totalSold).toBe(1);
    expect(res.body.topCustomers[0].totalQty).toBe(1);
  });

  it('no mezcla clientes de otro local', async () => {
    const a = await escenarioBase({ stock: 100, precio: 10 });
    const b = await escenarioBase({ stock: 100, precio: 10 });

    await pedidoDe(a, a.customer.id, a.product.id, 2);
    await pedidoDe(b, b.customer.id, b.product.id, 9);

    const res = await request(app).get(`/api/stats/product/${a.product.id}`).set(a.auth).expect(200);

    expect(res.body.topCustomers).toHaveLength(1);
    expect(res.body.topCustomers[0].customerId).toBe(a.customer.id);
  });

  it('devuelve listas vacías para un producto sin ventas', async () => {
    const e = await escenarioBase();
    const sinVender = await crearProducto(e.business.id, { name: 'Nunca pedido' });

    const res = await request(app).get(`/api/stats/product/${sinVender.id}`).set(e.auth).expect(200);

    expect(res.body.summary.totalSold).toBe(0);
    expect(res.body.summary.totalRevenue).toBe(0);
    expect(res.body.topCustomers).toEqual([]);
  });
});

describe('GET /stats/categories', () => {
  it('agrupa por categoría y ordena por facturación', async () => {
    const e = await escenarioBase({ stock: 100, precio: 10 });
    const bebida = await crearProducto(e.business.id, { name: 'Refresco', price: 2, stock: 100 });
    const postre = await crearProducto(e.business.id, { name: 'Tarta', price: 30, stock: 100 });

    const { prisma } = await import('../../prisma/client');
    await prisma.product.update({ where: { id: bebida.id }, data: { category: 'Bebidas' } });
    await prisma.product.update({ where: { id: postre.id }, data: { category: 'Postres' } });

    await pedidoDe(e, e.customer.id, bebida.id, 5);   // 10 €
    await pedidoDe(e, e.customer.id, postre.id, 2);   // 60 €

    const res = await request(app).get('/api/stats/categories').set(e.auth).expect(200);

    const categorias = res.body.categories.filter((c: { category: string }) =>
      ['Bebidas', 'Postres'].includes(c.category)
    );
    expect(categorias[0].category).toBe('Postres'); // más facturación primero
    expect(categorias[0].totalRevenue).toBe(60);
    expect(categorias.find((c: { category: string }) => c.category === 'Bebidas').totalSold).toBe(5);
  });

  it('agrupa los productos sin categoría bajo una etiqueta propia', async () => {
    const e = await escenarioBase({ stock: 100, precio: 10 });
    await pedidoDe(e, e.customer.id, e.product.id, 1);

    const res = await request(app).get('/api/stats/categories').set(e.auth).expect(200);
    expect(res.body.categories.some((c: { category: string }) => c.category === 'Sin categoría')).toBe(true);
  });
});
