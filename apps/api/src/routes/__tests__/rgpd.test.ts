import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { prisma } from '../../prisma/client';
import { escenarioBase, crearLocal, crearUsuario, cabeceraAuth } from '../../__tests__/setup/factories';

/**
 * Derecho de supresión y de portabilidad.
 *
 * Un borrado que deje datos personales atrás es peor que no tenerlo: da por cumplida una
 * obligación que no se ha cumplido. Estos tests recorren los tres sitios donde vive el
 * dato del cliente.
 */
describe('Derecho de supresión', () => {
  async function clienteConPedidos() {
    const e = await escenarioBase({ stock: 100, precio: 10 });

    await prisma.customer.update({
      where: { id: e.customer.id },
      data: {
        name: 'Ana Pérez',
        email: 'ana@ejemplo.com',
        address: 'Calle Real 5, 3º B',
        notes: 'Llamar al telefonillo de la vecina',
      },
    });

    const pedidos: string[] = [];
    for (const cantidad of [1, 2]) {
      const r = await request(app)
        .post('/api/orders')
        .set(e.auth)
        .send({
          customerId: e.customer.id,
          items: [{ productId: e.product.id, quantity: cantidad }],
          deliveryAddress: 'Calle Real 5, 3º B',
          notes: 'Dejar en portería',
        })
        .expect(201);
      pedidos.push(r.body.id);
    }

    return { ...e, pedidos };
  }

  it('vacía los datos de la ficha pero la conserva', async () => {
    const e = await clienteConPedidos();

    const res = await request(app).delete(`/api/customers/${e.customer.id}`).set(e.auth).expect(200);
    expect(res.body.anonymized).toBe(true);
    expect(res.body.pedidosAfectados).toBe(2);

    const ficha = await prisma.customer.findUniqueOrThrow({ where: { id: e.customer.id } });
    expect(ficha.name).toBe('Cliente eliminado');
    expect(ficha.email).toBeNull();
    expect(ficha.address).toBeNull();
    expect(ficha.notes).toBeNull();
    expect(ficha.phone).toMatch(/^eliminado-/);
    expect(ficha.anonymizedAt).toBeInstanceOf(Date);
  });

  it('vacía también los datos personales de los pedidos', async () => {
    const e = await clienteConPedidos();
    await request(app).delete(`/api/customers/${e.customer.id}`).set(e.auth).expect(200);

    const pedidos = await prisma.order.findMany({ where: { customerId: e.customer.id } });
    for (const p of pedidos) {
      expect(p.deliveryAddress).toBeNull();
      // Las notas suelen llevar datos personales: "llamar al telefonillo de la vecina"
      expect(p.notes).toBeNull();
    }
  });

  it('invalida los enlaces públicos de seguimiento', async () => {
    const e = await clienteConPedidos();

    const antes = await prisma.order.findUniqueOrThrow({ where: { id: e.pedidos[0] } });
    // El enlace funciona antes de ejercer el derecho
    await request(app).get(`/api/tracking/${antes.trackingToken}`).expect(200);

    await request(app).delete(`/api/customers/${e.customer.id}`).set(e.auth).expect(200);

    // El token impreso en el ticket deja de servir
    expect((await request(app).get(`/api/tracking/${antes.trackingToken}`)).status).toBe(404);

    const despues = await prisma.order.findUniqueOrThrow({ where: { id: e.pedidos[0] } });
    expect(despues.trackingToken).not.toBe(antes.trackingToken);
  });

  it('conserva los importes de los pedidos, que hay obligación de guardar', async () => {
    const e = await clienteConPedidos();
    const antes = await prisma.order.findMany({
      where: { customerId: e.customer.id },
      select: { id: true, total: true },
      orderBy: { createdAt: 'asc' },
    });

    await request(app).delete(`/api/customers/${e.customer.id}`).set(e.auth).expect(200);

    const despues = await prisma.order.findMany({
      where: { customerId: e.customer.id },
      select: { id: true, total: true },
      orderBy: { createdAt: 'asc' },
    });

    expect(despues).toHaveLength(antes.length);
    expect(despues.map((o) => Number(o.total))).toEqual(antes.map((o) => Number(o.total)));
    // Y las líneas siguen ahí
    expect(await prisma.orderItem.count({ where: { orderId: { in: antes.map((o) => o.id) } } })).toBe(2);
  });

  it('inutiliza la cuenta de la tienda online del cliente', async () => {
    const business = await crearLocal({ onlineOrderEnabled: true });
    const { user } = await crearUsuario(business.id, { role: 'OWNER' });
    const auth = cabeceraAuth(user.id, business.id, 'OWNER');

    const cliente = await prisma.customer.create({
      data: { businessId: business.id, name: 'Con Cuenta', phone: '600321321', email: 'concuenta@ejemplo.com' },
    });
    const cuenta = await prisma.customerAccount.create({
      data: {
        businessId: business.id,
        name: 'Con Cuenta',
        phone: '600321321',
        email: 'concuenta@ejemplo.com',
        address: 'Calle 9',
        passwordHash: 'hash-original',
        emailVerified: true,
      },
    });

    const res = await request(app).delete(`/api/customers/${cliente.id}`).set(auth).expect(200);
    expect(res.body.cuentaOnline).toBe(true);

    const tras = await prisma.customerAccount.findUniqueOrThrow({ where: { id: cuenta.id } });
    expect(tras.name).toBe('Cliente eliminado');
    expect(tras.email).toMatch(/@invalid$/);
    expect(tras.address).toBe('');
    // La contraseña se sustituye: la cuenta ya no puede iniciar sesión
    expect(tras.passwordHash).not.toBe('hash-original');
    expect(tras.anonymizedAt).toBeInstanceOf(Date);
  });

  it('no deja ejercerlo dos veces sobre el mismo cliente', async () => {
    const e = await clienteConPedidos();
    await request(app).delete(`/api/customers/${e.customer.id}`).set(e.auth).expect(200);
    expect((await request(app).delete(`/api/customers/${e.customer.id}`).set(e.auth)).status).toBe(409);
  });

  it('solo la administración puede ejercerlo', async () => {
    const e = await clienteConPedidos();
    const { user: empleado } = await crearUsuario(e.business.id, { role: 'STAFF' });

    const res = await request(app)
      .delete(`/api/customers/${e.customer.id}`)
      .set(cabeceraAuth(empleado.id, e.business.id, 'STAFF'));
    expect(res.status).toBe(403);
  });

  it('no deja tocar un cliente de otro local', async () => {
    const e = await clienteConPedidos();
    const otro = await crearLocal();
    const { user } = await crearUsuario(otro.id);

    const res = await request(app)
      .delete(`/api/customers/${e.customer.id}`)
      .set(cabeceraAuth(user.id, otro.id));
    expect(res.status).toBe(404);
  });
});

describe('Caducidad del enlace de seguimiento', () => {
  it('un pedido reciente se puede consultar', async () => {
    const e = await escenarioBase({ stock: 10 });
    const r = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 1 }] })
      .expect(201);

    await request(app).get(`/api/tracking/${r.body.trackingToken}`).expect(200);
  });

  it('pasados 30 días el enlace deja de servir', async () => {
    // El token viaja impreso en el ticket y muestra nombre y dirección sin pedir
    // contraseña: que no caducara convertía cada ticket viejo en una filtración latente.
    const e = await escenarioBase({ stock: 10 });
    const r = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 1 }] })
      .expect(201);

    await prisma.order.update({
      where: { id: r.body.id },
      data: { createdAt: new Date(Date.now() - 31 * 24 * 3600_000) },
    });

    const res = await request(app).get(`/api/tracking/${r.body.trackingToken}`);
    expect(res.status).toBe(410);
    expect(res.body.expired).toBe(true);
  });

  it('justo antes del límite sigue funcionando', async () => {
    const e = await escenarioBase({ stock: 10 });
    const r = await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 1 }] })
      .expect(201);

    await prisma.order.update({
      where: { id: r.body.id },
      data: { createdAt: new Date(Date.now() - 29 * 24 * 3600_000) },
    });

    await request(app).get(`/api/tracking/${r.body.trackingToken}`).expect(200);
  });
});

describe('Consentimiento en el registro de la tienda online', () => {
  async function tienda() {
    return crearLocal({ onlineOrderEnabled: true });
  }

  const datos = {
    name: 'Cliente Nuevo',
    phone: '600555444',
    email: 'consentimiento@ejemplo.com',
    address: 'Calle 1',
    password: 'contrasena',
  };

  it('rechaza el registro sin aceptar la política', async () => {
    const business = await tienda();
    const res = await request(app).post(`/api/public/${business.slug}/auth/register`).send(datos);
    expect(res.status).toBe(400);
  });

  it('rechaza aceptarla con un valor que no sea true', async () => {
    const business = await tienda();
    for (const valor of [false, 'sí', 1, null]) {
      const res = await request(app)
        .post(`/api/public/${business.slug}/auth/register`)
        .send({ ...datos, acceptTerms: valor });
      expect(res.status, `acceptTerms=${JSON.stringify(valor)} debería rechazarse`).toBe(400);
    }
  });

  it('guarda cuándo se aceptó, para poder acreditarlo', async () => {
    const business = await tienda();
    await request(app)
      .post(`/api/public/${business.slug}/auth/register`)
      .send({ ...datos, acceptTerms: true })
      .expect(201);

    const cuenta = await prisma.customerAccount.findFirstOrThrow({
      where: { businessId: business.id, email: datos.email },
    });
    expect(cuenta.acceptedTermsAt).toBeInstanceOf(Date);
  });
});

describe('Portabilidad de los datos del local', () => {
  it('exporta todo lo del local en JSON', async () => {
    const e = await escenarioBase({ stock: 50, precio: 10 });
    await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 2 }] })
      .expect(201);

    const res = await request(app).get('/api/export').set(e.auth).expect(200);

    expect(res.headers['content-disposition']).toMatch(/attachment; filename=".*\.json"/);
    expect(res.body.formato).toBe('olyda-export-v1');
    expect(res.body.local.id).toBe(e.business.id);
    expect(res.body.productos).toHaveLength(1);
    expect(res.body.clientes).toHaveLength(1);
    expect(res.body.pedidos).toHaveLength(1);
    // Los pedidos llevan sus líneas, no solo la cabecera
    expect(res.body.pedidos[0].items).toHaveLength(1);
    expect(res.body.resumen.pedidos).toBe(1);
  });

  it('no incluye datos de otro local', async () => {
    const a = await escenarioBase();
    const b = await escenarioBase();

    const res = await request(app).get('/api/export').set(a.auth).expect(200);

    expect(res.body.local.id).toBe(a.business.id);
    expect(res.body.clientes.every((c: { businessId: string }) => c.businessId === a.business.id)).toBe(true);
    expect(res.body.productos.every((p: { businessId: string }) => p.businessId === b.business.id)).toBe(false);
  });

  it('solo la administración puede exportar', async () => {
    const e = await escenarioBase();
    const { user: empleado } = await crearUsuario(e.business.id, { role: 'STAFF' });

    const res = await request(app).get('/api/export').set(cabeceraAuth(empleado.id, e.business.id, 'STAFF'));
    expect(res.status).toBe(403);
  });
});
