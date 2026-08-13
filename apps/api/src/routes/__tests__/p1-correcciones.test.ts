import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { prisma } from '../../prisma/client';
import { escenarioBase, crearTarifaEnvio, crearLocal, crearUsuario, cabeceraAuth } from '../../__tests__/setup/factories';

async function pedidoDe(e: Awaited<ReturnType<typeof escenarioBase>>, extra: Record<string, unknown> = {}) {
  const r = await request(app)
    .post('/api/orders')
    .set(e.auth)
    .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 1 }], ...extra })
    .expect(201);
  return r.body.id as string;
}

describe('P1-6 · Retirar una tarifa de envío usada por pedidos', () => {
  it('borra la tarifa si no la usa ningún pedido', async () => {
    const e = await escenarioBase();
    const tarifa = await crearTarifaEnvio(e.business.id, 3);

    await request(app).delete(`/api/shipping-rates/${tarifa.id}`).set(e.auth).expect(204);

    expect(await prisma.shippingRate.count({ where: { id: tarifa.id } })).toBe(0);
  });

  it('la desactiva en lugar de borrarla si hay pedidos que la referencian', async () => {
    const e = await escenarioBase({ stock: 50 });
    const tarifa = await crearTarifaEnvio(e.business.id, 3);
    const orderId = await pedidoDe(e, { shippingRateId: tarifa.id });

    const res = await request(app).delete(`/api/shipping-rates/${tarifa.id}`).set(e.auth);

    // Antes esto reventaba con un 500 por restricción de clave foránea
    expect(res.status).toBe(200);
    expect(res.body.deactivated).toBe(true);
    expect(res.body.ordersAffected).toBe(1);

    // La tarifa sigue existiendo, porque el pedido la necesita para su histórico
    const enBd = await prisma.shippingRate.findUniqueOrThrow({ where: { id: tarifa.id } });
    expect(enBd.active).toBe(false);

    // Y el pedido conserva su coste de envío intacto
    const pedido = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(Number(pedido.shippingCost)).toBe(3);
  });

  it('una tarifa retirada desaparece del listado y no se puede usar en pedidos nuevos', async () => {
    const e = await escenarioBase({ stock: 50 });
    const tarifa = await crearTarifaEnvio(e.business.id, 3);
    await pedidoDe(e, { shippingRateId: tarifa.id });
    await request(app).delete(`/api/shipping-rates/${tarifa.id}`).set(e.auth).expect(200);

    const listado = await request(app).get('/api/shipping-rates').set(e.auth).expect(200);
    expect(listado.body).toHaveLength(0);

    const nuevo = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({
        customerId: e.customer.id,
        items: [{ productId: e.product.id, quantity: 1 }],
        shippingRateId: tarifa.id,
      });
    expect(nuevo.status).toBe(400);
  });
});

describe('P1-9 · La marca de impresión refleja lo que se imprimió', () => {
  it('pedir el ticket no lo marca como impreso', async () => {
    const e = await escenarioBase({ stock: 10 });
    const orderId = await pedidoDe(e);

    await request(app).post(`/api/orders/${orderId}/print`).set(e.auth).expect(200);

    const pedido = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(pedido.printRequestedAt).toBeInstanceOf(Date);
    expect(pedido.printedAt).toBeNull(); // aún no hay confirmación
  });

  it('se marca como impreso al confirmarlo', async () => {
    const e = await escenarioBase({ stock: 10 });
    const orderId = await pedidoDe(e);

    await request(app).post(`/api/orders/${orderId}/print`).set(e.auth).expect(200);
    const res = await request(app).post(`/api/orders/${orderId}/printed`).set(e.auth).expect(200);

    expect(res.body.alreadyPrinted).toBe(false);
    const pedido = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(pedido.printedAt).toBeInstanceOf(Date);
  });

  it('confirmar dos veces no altera la marca original', async () => {
    const e = await escenarioBase({ stock: 10 });
    const orderId = await pedidoDe(e);

    await request(app).post(`/api/orders/${orderId}/print`).set(e.auth).expect(200);
    const primera = await request(app).post(`/api/orders/${orderId}/printed`).set(e.auth).expect(200);
    const segunda = await request(app).post(`/api/orders/${orderId}/printed`).set(e.auth).expect(200);

    expect(segunda.body.alreadyPrinted).toBe(true);
    expect(segunda.body.printedAt).toBe(primera.body.printedAt);
  });

  it('un pedido cuyo envío a la impresora falló se vuelve a ofrecer pasado el margen', async () => {
    const e = await escenarioBase({ stock: 10 });
    const orderId = await pedidoDe(e);

    await request(app).post(`/api/orders/${orderId}/print`).set(e.auth).expect(200);

    // Recién intentado: no se ofrece, para que el agente no reimprima en bucle mientras
    // el trabajo está en camino
    const enseguida = await request(app).get('/api/orders?notPrinted=true').set(e.auth).expect(200);
    expect(enseguida.body.orders.map((o: { id: string }) => o.id)).not.toContain(orderId);

    // Simula que pasó el margen sin llegar confirmación
    await prisma.order.update({
      where: { id: orderId },
      data: { printRequestedAt: new Date(Date.now() - 5 * 60_000) },
    });

    const despues = await request(app).get('/api/orders?notPrinted=true').set(e.auth).expect(200);
    expect(despues.body.orders.map((o: { id: string }) => o.id)).toContain(orderId);
  });

  it('un pedido ya confirmado no vuelve a ofrecerse nunca', async () => {
    const e = await escenarioBase({ stock: 10 });
    const orderId = await pedidoDe(e);

    await request(app).post(`/api/orders/${orderId}/print`).set(e.auth).expect(200);
    await request(app).post(`/api/orders/${orderId}/printed`).set(e.auth).expect(200);

    await prisma.order.update({
      where: { id: orderId },
      data: { printRequestedAt: new Date(Date.now() - 60 * 60_000) },
    });

    const pendientes = await request(app).get('/api/orders?notPrinted=true').set(e.auth).expect(200);
    expect(pendientes.body.orders.map((o: { id: string }) => o.id)).not.toContain(orderId);
  });

  it('no deja confirmar la impresión de un pedido de otro local', async () => {
    const e = await escenarioBase({ stock: 10 });
    const orderId = await pedidoDe(e);

    const otro = await crearLocal();
    const { user } = await crearUsuario(otro.id);

    const res = await request(app)
      .post(`/api/orders/${orderId}/printed`)
      .set(cabeceraAuth(user.id, otro.id));
    expect(res.status).toBe(404);
  });
});

describe('P1-8 · Los correos no se pierden si falla el proveedor', () => {
  beforeEach(async () => {
    await prisma.emailOutbox.deleteMany({});
  });

  it('cada correo queda registrado en el buzón de salida', async () => {
    const business = await crearLocal({ onlineOrderEnabled: true });

    await request(app)
      .post(`/api/public/${business.slug}/auth/register`)
      .send({
        name: 'Cliente Nuevo',
        phone: '600111333',
        email: 'buzon@ejemplo.com',
        address: 'Calle X 1',
        password: 'contrasena', acceptTerms: true },
      )
      .expect(201);

    // El envío es fire-and-forget: la respuesta HTTP vuelve antes de que el correo salga,
    // así que se espera al desenlace en lugar de mirar el estado justo después.
    let correo = null;
    for (let i = 0; i < 40; i++) {
      correo = await prisma.emailOutbox.findFirst({ where: { to: 'buzon@ejemplo.com' } });
      if (correo?.status === 'SENT') break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(correo, 'debería haberse encolado el correo de verificación').not.toBeNull();
    expect(correo!.subject).toMatch(/Verifica tu email/);
    // En tests el transporte es `log`, que no falla: acaba enviado
    expect(correo!.status).toBe('SENT');
    expect(correo!.sentAt).toBeInstanceOf(Date);
  });

  it('un fallo del proveedor deja el correo pendiente en lugar de perderlo', async () => {
    // Se registra un correo como si el primer intento hubiese fallado
    const pendiente = await prisma.emailOutbox.create({
      data: {
        to: 'reintento@ejemplo.com',
        subject: 'Prueba de reintento',
        html: '<p>hola</p>',
        text: 'hola',
        businessName: 'Local de prueba',
        status: 'PENDING',
        attempts: 1,
        lastError: 'Error simulado del proveedor',
        nextAttemptAt: new Date(Date.now() - 1000), // ya toca reintentarlo
      },
    });

    const { procesarBuzonDeSalida } = await import('../../services/email.service');
    const procesados = await procesarBuzonDeSalida();

    expect(procesados).toBe(1);
    const tras = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: pendiente.id } });
    expect(tras.status).toBe('SENT');
    expect(tras.attempts).toBe(2);
  });

  it('no reintenta antes de que llegue su momento', async () => {
    await prisma.emailOutbox.create({
      data: {
        to: 'todavia-no@ejemplo.com',
        subject: 'Aún no',
        html: '<p>x</p>',
        text: 'x',
        businessName: 'Local',
        status: 'PENDING',
        attempts: 1,
        nextAttemptAt: new Date(Date.now() + 60 * 60_000),
      },
    });

    const { procesarBuzonDeSalida } = await import('../../services/email.service');
    expect(await procesarBuzonDeSalida()).toBe(0);
  });

  it('no reintenta los que ya se enviaron ni los abandonados', async () => {
    for (const status of ['SENT', 'FAILED'] as const) {
      await prisma.emailOutbox.create({
        data: {
          to: `${status.toLowerCase()}@ejemplo.com`,
          subject: 'x',
          html: '<p>x</p>',
          text: 'x',
          businessName: 'Local',
          status,
          attempts: 3,
          nextAttemptAt: new Date(Date.now() - 1000),
        },
      });
    }

    const { procesarBuzonDeSalida } = await import('../../services/email.service');
    expect(await procesarBuzonDeSalida()).toBe(0);
  });
});

describe('P1-7 · Enlace de seguimiento en el correo de confirmación', () => {
  it('usa APP_URL tal cual, sin reescribir puertos', async () => {
    const business = await crearLocal({ onlineOrderEnabled: true });
    const { user } = await crearUsuario(business.id);
    const auth = cabeceraAuth(user.id, business.id);
    await prisma.service.create({ data: { businessId: business.id } });

    const cliente = await prisma.customer.create({
      data: { businessId: business.id, name: 'C', phone: '600999888' },
    });
    const cuenta = await prisma.customerAccount.create({
      data: {
        businessId: business.id,
        name: 'C',
        phone: '600999888',
        email: 'seguimiento@ejemplo.com',
        passwordHash: 'x',
        address: 'Calle 1',
        emailVerified: true,
      },
    });
    const producto = await prisma.product.create({
      data: { businessId: business.id, name: 'P', price: 10, stock: 5 },
    });

    const pedido = await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: cliente.id,
        customerAccountId: cuenta.id,
        status: 'RECEIVED_ONLINE',
        subtotal: 10, tax: 0, total: 10,
        items: { create: [{ productId: producto.id, quantity: 1, unitPrice: 10, subtotal: 10 }] },
      },
    });

    await prisma.emailOutbox.deleteMany({});
    await request(app).patch(`/api/orders/${pedido.id}/status`).set(auth).send({ status: 'PENDING' }).expect(200);

    // El envío es fire-and-forget: se espera a que el registro aparezca
    let correo = null;
    for (let i = 0; i < 40 && !correo; i++) {
      correo = await prisma.emailOutbox.findFirst({ where: { to: 'seguimiento@ejemplo.com' } });
      if (!correo) await new Promise((r) => setTimeout(r, 50));
    }

    expect(correo, 'debería haberse encolado el correo de confirmación').not.toBeNull();
    expect(correo!.html).toContain(`${process.env.APP_URL}/tracking/${pedido.trackingToken}`);
    expect(correo!.html).not.toContain(':4000');
  });
});
