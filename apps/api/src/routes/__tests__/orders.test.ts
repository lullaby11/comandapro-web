import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { prisma } from '../../prisma/client';
import { escenarioBase, crearProducto, crearTarifaEnvio } from '../../__tests__/setup/factories';

async function stockDe(productId: string): Promise<number> {
  const p = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  return p.stock;
}

describe('POST /api/orders — creación', () => {
  it('rechaza el pedido si no hay servicio abierto', async () => {
    const e = await escenarioBase();
    await prisma.service.update({ where: { id: e.service.id }, data: { endedAt: new Date() } });

    const res = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 1 }] });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/servicio activo/i);
  });

  it('rechaza el pedido si falta stock y detalla qué falta', async () => {
    const e = await escenarioBase({ stock: 3 });

    const res = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 5 }] });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/stock/i);
    expect(res.body.details[0]).toMatchObject({ available: 3, requested: 5 });
  });

  it('descuenta exactamente el stock pedido', async () => {
    const e = await escenarioBase({ stock: 10 });

    await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 3 }] })
      .expect(201);

    expect(await stockDe(e.product.id)).toBe(7);
  });

  it('con dos pedidos simultáneos del último artículo, solo uno prospera', async () => {
    const e = await escenarioBase({ stock: 1 });

    const pedir = () =>
      request(app)
        .post('/api/orders')
        .set(e.auth)
        .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 1 }] });

    const [a, b] = await Promise.all([pedir(), pedir()]);
    const codigos = [a.status, b.status].sort();

    // Uno crea el pedido; el otro debe fallar, nunca dejar el stock en negativo
    expect(codigos[0]).toBe(201);
    expect(codigos[1]).toBeGreaterThanOrEqual(400);
    expect(await stockDe(e.product.id)).toBe(0);
  });

  it('rechaza productos desactivados', async () => {
    const e = await escenarioBase();
    const inactivo = await crearProducto(e.business.id, { active: false, stock: 50 });

    const res = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({ customerId: e.customer.id, items: [{ productId: inactivo.id, quantity: 1 }] });

    expect(res.status).toBe(409);
  });

  it('congela el precio: cambiarlo después no altera el pedido', async () => {
    const e = await escenarioBase({ precio: 10 });

    const creado = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 2 }] })
      .expect(201);

    await request(app).patch(`/api/products/${e.product.id}`).set(e.auth).send({ price: 99 }).expect(200);

    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: creado.body.id } });
    expect(Number(item.unitPrice)).toBe(10);
    expect(Number(item.subtotal)).toBe(20);
  });

  it('ignora el precio que envíe el cliente y usa el de la base de datos', async () => {
    const e = await escenarioBase({ precio: 10 });

    const creado = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({
        customerId: e.customer.id,
        items: [{ productId: e.product.id, quantity: 1, unitPrice: 0.01, price: 0.01 }],
        total: 0.01,
      })
      .expect(201);

    expect(Number(creado.body.total)).toBe(10);
  });
});

describe('Importes', () => {
  it('total = subtotal + IVA + envío', async () => {
    const e = await escenarioBase({ taxRate: 10, precio: 10 });
    const tarifa = await crearTarifaEnvio(e.business.id, 3);

    const res = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({
        customerId: e.customer.id,
        items: [{ productId: e.product.id, quantity: 2 }],
        shippingRateId: tarifa.id,
      })
      .expect(201);

    expect(Number(res.body.subtotal)).toBe(20);
    expect(Number(res.body.tax)).toBe(2);
    expect(Number(res.body.shippingCost)).toBe(3);
    expect(Number(res.body.total)).toBe(25);
  });

  it('el IVA se aplica al subtotal y no al envío', async () => {
    const e = await escenarioBase({ taxRate: 21, precio: 100 });
    const tarifa = await crearTarifaEnvio(e.business.id, 10);

    const res = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({
        customerId: e.customer.id,
        items: [{ productId: e.product.id, quantity: 1 }],
        shippingRateId: tarifa.id,
      })
      .expect(201);

    expect(Number(res.body.tax)).toBe(21); // 21 % de 100, no de 110
    expect(Number(res.body.total)).toBe(131);
  });

  it('los importes guardados cuadran con precios que arrastran decimales', async () => {
    // 3 × 10,55 = 31,65 con IVA 10 % → 3,165 que redondea a 3,17 (o 3,16)
    const e = await escenarioBase({ taxRate: 10, precio: 10.55 });

    const res = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 3 }] })
      .expect(201);

    const guardado = await prisma.order.findUniqueOrThrow({ where: { id: res.body.id } });
    const subtotal = Number(guardado.subtotal);
    const tax = Number(guardado.tax);
    const envio = Number(guardado.shippingCost);
    const total = Number(guardado.total);

    // Lo que se persiste debe cuadrar consigo mismo: si no, la suma del ticket no
    // coincide con el total cobrado.
    expect(total).toBe(Number((subtotal + tax + envio).toFixed(2)));
    // Y cada importe debe tener como mucho 2 decimales
    for (const importe of [subtotal, tax, envio, total]) {
      expect(Math.round(importe * 100)).toBeCloseTo(importe * 100, 6);
    }
  });
});

describe('Cancelación y borrado', () => {
  it('borrar un pedido restaura el stock', async () => {
    const e = await escenarioBase({ stock: 10 });

    const creado = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 4 }] })
      .expect(201);

    expect(await stockDe(e.product.id)).toBe(6);

    await request(app).delete(`/api/orders/${creado.body.id}`).set(e.auth).expect(204);

    expect(await stockDe(e.product.id)).toBe(10);
  });

  it('cancelar un pedido restaura el stock', async () => {
    const e = await escenarioBase({ stock: 10 });

    const creado = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 4 }] })
      .expect(201);

    expect(await stockDe(e.product.id)).toBe(6);

    await request(app)
      .patch(`/api/orders/${creado.body.id}/status`)
      .set(e.auth)
      .send({ status: 'CANCELLED' })
      .expect(200);

    expect(await stockDe(e.product.id)).toBe(10);
  });

  it('cancelar dos veces no duplica la devolución de stock', async () => {
    const e = await escenarioBase({ stock: 10 });

    const creado = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 4 }] })
      .expect(201);

    const cancelar = () =>
      request(app).patch(`/api/orders/${creado.body.id}/status`).set(e.auth).send({ status: 'CANCELLED' });

    await cancelar();
    await cancelar();

    expect(await stockDe(e.product.id)).toBe(10);
  });

  it('borrar un pedido ya cancelado no devuelve el stock por segunda vez', async () => {
    const e = await escenarioBase({ stock: 10 });

    const creado = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 4 }] })
      .expect(201);

    await request(app)
      .patch(`/api/orders/${creado.body.id}/status`)
      .set(e.auth)
      .send({ status: 'CANCELLED' })
      .expect(200);

    await request(app).delete(`/api/orders/${creado.body.id}`).set(e.auth);

    expect(await stockDe(e.product.id)).toBe(10);
  });
});
