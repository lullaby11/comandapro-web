import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { prisma } from '../../prisma/client';
import { escenarioBase } from '../../__tests__/setup/factories';

/**
 * Antes, PATCH /orders/:id/status aceptaba cualquier valor del enum: se podía saltar de
 * PENDING a DELIVERED sin pasar por cocina, o resucitar un pedido cancelado —que además
 * ya había devuelto su stock, con lo que el inventario quedaba descuadrado—.
 */
async function pedidoEnEstado(estado: string, opciones: { isPickup?: boolean } = {}) {
  const e = await escenarioBase({ stock: 50 });

  const creado = await request(app)
    .post('/api/orders')
    .set(e.auth)
    .send({
      customerId: e.customer.id,
      items: [{ productId: e.product.id, quantity: 1 }],
      isPickup: opciones.isPickup ?? false,
    })
    .expect(201);

  if (estado !== 'PENDING') {
    await prisma.order.update({ where: { id: creado.body.id }, data: { status: estado as never } });
  }

  return { ...e, orderId: creado.body.id as string };
}

function cambiar(orderId: string, auth: Record<string, string>, status: string) {
  return request(app).patch(`/api/orders/${orderId}/status`).set(auth).send({ status });
}

describe('Transiciones de estado', () => {
  it('recorre el ciclo completo de un pedido a domicilio', async () => {
    const e = await pedidoEnEstado('PENDING');

    for (const estado of ['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
      const res = await cambiar(e.orderId, e.auth, estado);
      expect(res.status, `fallo al pasar a ${estado}`).toBe(200);
      expect(res.body.status).toBe(estado);
    }
  });

  it('permite a un pedido de recogida saltar de READY a DELIVERED', async () => {
    const e = await pedidoEnEstado('READY', { isPickup: true });
    await expect(cambiar(e.orderId, e.auth, 'DELIVERED')).resolves.toMatchObject({ status: 200 });
  });

  it('impide que un pedido de recogida salga a reparto', async () => {
    const e = await pedidoEnEstado('READY', { isPickup: true });
    const res = await cambiar(e.orderId, e.auth, 'OUT_FOR_DELIVERY');
    expect(res.status).toBe(409);
  });

  it('rechaza saltarse pasos del flujo', async () => {
    const casos: Array<[string, string]> = [
      ['PENDING', 'DELIVERED'],
      ['PENDING', 'READY'],
      ['PENDING', 'OUT_FOR_DELIVERY'],
      ['PREPARING', 'DELIVERED'],
    ];

    for (const [desde, hasta] of casos) {
      const e = await pedidoEnEstado(desde);
      const res = await cambiar(e.orderId, e.auth, hasta);
      expect(res.status, `${desde} → ${hasta} debería rechazarse`).toBe(409);
      expect(res.body).toMatchObject({ from: desde, to: hasta });
    }
  });

  it('rechaza retroceder a un estado anterior', async () => {
    const e = await pedidoEnEstado('READY');
    expect((await cambiar(e.orderId, e.auth, 'PREPARING')).status).toBe(409);
    expect((await cambiar(e.orderId, e.auth, 'PENDING')).status).toBe(409);
  });

  it('trata entregado y cancelado como estados finales', async () => {
    const entregado = await pedidoEnEstado('DELIVERED');
    expect((await cambiar(entregado.orderId, entregado.auth, 'PREPARING')).status).toBe(409);
    expect((await cambiar(entregado.orderId, entregado.auth, 'CANCELLED')).status).toBe(409);

    const cancelado = await pedidoEnEstado('CANCELLED');
    expect((await cambiar(cancelado.orderId, cancelado.auth, 'PENDING')).status).toBe(409);
  });

  it('permite cancelar desde cualquier estado en curso', async () => {
    for (const desde of ['RECEIVED_ONLINE', 'PENDING', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']) {
      const e = await pedidoEnEstado(desde);
      const res = await cambiar(e.orderId, e.auth, 'CANCELLED');
      expect(res.status, `debería poder cancelarse desde ${desde}`).toBe(200);
    }
  });

  it('acepta reenviar el mismo estado, para que un doble clic no dé error', async () => {
    const e = await pedidoEnEstado('PREPARING');
    expect((await cambiar(e.orderId, e.auth, 'PREPARING')).status).toBe(200);
  });

  it('un pedido online se acepta pasándolo a pendiente', async () => {
    const e = await pedidoEnEstado('RECEIVED_ONLINE');
    expect((await cambiar(e.orderId, e.auth, 'PENDING')).status).toBe(200);
  });

  it('devuelve los estados permitidos al rechazar una transición', async () => {
    const e = await pedidoEnEstado('PENDING');
    const res = await cambiar(e.orderId, e.auth, 'DELIVERED');

    expect(res.body.allowed).toEqual(expect.arrayContaining(['PREPARING', 'CANCELLED']));
    expect(res.body.error).toMatch(/Pendiente.*Entregado/);
  });
});
