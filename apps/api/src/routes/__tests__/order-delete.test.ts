import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { prisma } from '../../prisma/client';
import { escenarioBase, crearUsuario, cabeceraAuth } from '../../__tests__/setup/factories';

/**
 * El borrado era físico: se perdía el histórico contable, las estadísticas cambiaban de
 * forma retroactiva y no quedaba rastro de quién lo había hecho.
 */
async function pedidoDe(e: Awaited<ReturnType<typeof escenarioBase>>, cantidad = 2) {
  const creado = await request(app)
    .post('/api/orders')
    .set(e.auth)
    .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: cantidad }] })
    .expect(201);
  return creado.body.id as string;
}

describe('Borrado lógico de pedidos', () => {
  it('marca el pedido en lugar de borrarlo, dejando rastro de quién y cuándo', async () => {
    const e = await escenarioBase({ stock: 10 });
    const orderId = await pedidoDe(e);

    await request(app).delete(`/api/orders/${orderId}`).set(e.auth).expect(204);

    const enBd = await prisma.order.findUnique({ where: { id: orderId } });
    expect(enBd).not.toBeNull();
    expect(enBd!.deletedAt).toBeInstanceOf(Date);
    expect(enBd!.deletedBy).toBe(e.user.id);
  });

  it('el pedido borrado desaparece del listado y del detalle', async () => {
    const e = await escenarioBase({ stock: 10 });
    const orderId = await pedidoDe(e);

    const antes = await request(app).get('/api/orders').set(e.auth);
    expect(antes.body.orders).toHaveLength(1);

    await request(app).delete(`/api/orders/${orderId}`).set(e.auth).expect(204);

    const despues = await request(app).get('/api/orders').set(e.auth);
    expect(despues.body.orders).toHaveLength(0);
    expect(despues.body.total).toBe(0);

    expect((await request(app).get(`/api/orders/${orderId}`).set(e.auth)).status).toBe(404);
  });

  it('el pedido borrado deja de contar en las estadísticas', async () => {
    const e = await escenarioBase({ stock: 100, precio: 10 });
    const conservado = await pedidoDe(e, 1);
    const borrado = await pedidoDe(e, 5);

    const antes = await request(app).get(`/api/stats/service/${e.service.id}`).set(e.auth);
    expect(antes.body.summary.totalOrders).toBe(2);
    expect(antes.body.summary.totalRevenue).toBe(60);

    await request(app).delete(`/api/orders/${borrado}`).set(e.auth).expect(204);

    const despues = await request(app).get(`/api/stats/service/${e.service.id}`).set(e.auth);
    expect(despues.body.summary.totalOrders).toBe(1);
    expect(despues.body.summary.totalRevenue).toBe(10);

    // El conservado sigue intacto
    expect((await request(app).get(`/api/orders/${conservado}`).set(e.auth)).status).toBe(200);
  });

  it('no cuenta en las estadísticas de producto ni de cliente', async () => {
    const e = await escenarioBase({ stock: 100, precio: 10 });
    const orderId = await pedidoDe(e, 3);

    await request(app).delete(`/api/orders/${orderId}`).set(e.auth).expect(204);

    const producto = await request(app).get(`/api/stats/product/${e.product.id}`).set(e.auth);
    expect(producto.body.summary.totalSold).toBe(0);

    const cliente = await request(app).get(`/api/stats/customer/${e.customer.id}`).set(e.auth);
    expect(cliente.body.summary.totalOrders).toBe(0);
  });

  it('devuelve el stock al borrar, y solo una vez si ya se había cancelado', async () => {
    const e = await escenarioBase({ stock: 10 });

    const soloBorrado = await pedidoDe(e, 3);
    await request(app).delete(`/api/orders/${soloBorrado}`).set(e.auth).expect(204);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: e.product.id } })).stock).toBe(10);

    const canceladoYBorrado = await pedidoDe(e, 4);
    await request(app)
      .patch(`/api/orders/${canceladoYBorrado}/status`)
      .set(e.auth)
      .send({ status: 'CANCELLED' })
      .expect(200);
    await request(app).delete(`/api/orders/${canceladoYBorrado}`).set(e.auth).expect(204);

    expect((await prisma.product.findUniqueOrThrow({ where: { id: e.product.id } })).stock).toBe(10);
  });

  it('solo los administradores pueden borrar pedidos', async () => {
    const e = await escenarioBase({ stock: 10 });
    const orderId = await pedidoDe(e);

    const { user: empleado } = await crearUsuario(e.business.id, { role: 'STAFF' });
    const authStaff = cabeceraAuth(empleado.id, e.business.id, 'STAFF');

    expect((await request(app).delete(`/api/orders/${orderId}`).set(authStaff)).status).toBe(403);

    // Pero sí puede seguir trabajando con el pedido
    expect((await request(app).patch(`/api/orders/${orderId}/status`).set(authStaff).send({ status: 'PREPARING' })).status).toBe(200);
  });

  it('borrar dos veces el mismo pedido devuelve 404 la segunda', async () => {
    const e = await escenarioBase({ stock: 10 });
    const orderId = await pedidoDe(e);

    await request(app).delete(`/api/orders/${orderId}`).set(e.auth).expect(204);
    expect((await request(app).delete(`/api/orders/${orderId}`).set(e.auth)).status).toBe(404);
  });
});
