import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { prisma } from '../../prisma/client';
import { crearLocal, crearUsuario, crearProducto, cabeceraAuth } from '../../__tests__/setup/factories';

/**
 * Un empleado no debe poder tocar los precios, pero SÍ reponer stock: lo hace a diario, y
 * el flujo de nueva comanda incluye un modal para ajustarlo sin salir del pedido. Por eso
 * la autorización es por campo y no por ruta.
 */
async function escenario() {
  const business = await crearLocal();
  const { user: dueno } = await crearUsuario(business.id, { role: 'OWNER' });
  const { user: encargada } = await crearUsuario(business.id, { role: 'ADMIN' });
  const { user: empleado } = await crearUsuario(business.id, { role: 'STAFF' });
  const producto = await crearProducto(business.id, { price: 10, stock: 5 });

  return {
    business,
    producto,
    admin: cabeceraAuth(dueno.id, business.id, 'OWNER'),
    encargada: cabeceraAuth(encargada.id, business.id, 'ADMIN'),
    empleado: cabeceraAuth(empleado.id, business.id, 'STAFF'),
  };
}

describe('Quién puede tocar el catálogo', () => {
  it('un empleado puede reponer stock', async () => {
    const e = await escenario();

    const res = await request(app).patch(`/api/products/${e.producto.id}`).set(e.empleado).send({ stock: 42 });

    expect(res.status).toBe(200);
    expect(res.body.stock).toBe(42);
  });

  it('un empleado NO puede cambiar el precio', async () => {
    const e = await escenario();

    const res = await request(app).patch(`/api/products/${e.producto.id}`).set(e.empleado).send({ price: 1 });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/precio/i);
    expect(res.body.fields).toContain('price');

    const sinCambios = await prisma.product.findUniqueOrThrow({ where: { id: e.producto.id } });
    expect(Number(sinCambios.price)).toBe(10);
  });

  it('un empleado no puede colar el precio junto a un cambio de stock', async () => {
    const e = await escenario();

    const res = await request(app)
      .patch(`/api/products/${e.producto.id}`)
      .set(e.empleado)
      .send({ stock: 99, price: 1 });

    expect(res.status).toBe(403);

    // Y no se aplica NADA: ni siquiera la parte que sí tenía permitida
    const sinCambios = await prisma.product.findUniqueOrThrow({ where: { id: e.producto.id } });
    expect(sinCambios.stock).toBe(5);
    expect(Number(sinCambios.price)).toBe(10);
  });

  it('un empleado tampoco puede renombrar, ocultar ni publicar productos', async () => {
    const e = await escenario();

    for (const cambio of [{ name: 'Otro nombre' }, { active: false }, { onlineVisible: true }, { category: 'X' }]) {
      const res = await request(app).patch(`/api/products/${e.producto.id}`).set(e.empleado).send(cambio);
      expect(res.status, `debería rechazar ${JSON.stringify(cambio)}`).toBe(403);
    }
  });

  it('un empleado no puede crear productos, que es fijar un precio por la puerta de atrás', async () => {
    const e = await escenario();

    const res = await request(app)
      .post('/api/products')
      .set(e.empleado)
      .send({ name: 'Duplicado barato', price: 0.01, stock: 10 });

    expect(res.status).toBe(403);
  });

  it('un empleado no puede retirar un producto del catálogo', async () => {
    const e = await escenario();
    expect((await request(app).delete(`/api/products/${e.producto.id}`).set(e.empleado)).status).toBe(403);
  });

  it('la administración puede con todo', async () => {
    const e = await escenario();

    for (const auth of [e.admin, e.encargada]) {
      expect((await request(app).patch(`/api/products/${e.producto.id}`).set(auth).send({ price: 12.5 })).status).toBe(200);
      expect((await request(app).patch(`/api/products/${e.producto.id}`).set(auth).send({ name: 'Renombrado' })).status).toBe(200);
      expect((await request(app).patch(`/api/products/${e.producto.id}`).set(auth).send({ stock: 7 })).status).toBe(200);
    }

    const creado = await request(app)
      .post('/api/products')
      .set(e.admin)
      .send({ name: 'Nuevo', price: 5, stock: 3 });
    expect(creado.status).toBe(201);

    expect((await request(app).delete(`/api/products/${creado.body.id}`).set(e.admin)).status).toBe(204);
  });

  it('un empleado sigue viendo el catálogo completo', async () => {
    const e = await escenario();

    expect((await request(app).get('/api/products').set(e.empleado)).status).toBe(200);
    expect((await request(app).get(`/api/products/${e.producto.id}`).set(e.empleado)).status).toBe(200);
  });

  it('el flujo de nueva comanda sigue funcionando para un empleado', async () => {
    // Reproduce lo que hace el modal de reponer stock del flujo de comanda: envía
    // únicamente { stock }. Si esto se rompe, el personal no puede cerrar un pedido
    // cuando falta género.
    const e = await escenario();

    const res = await request(app)
      .patch(`/api/products/${e.producto.id}`)
      .set(e.empleado)
      .send({ stock: 20 });

    expect(res.status).toBe(200);
    expect(res.body.stock).toBe(20);
  });
});
