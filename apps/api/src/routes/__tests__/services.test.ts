import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { prisma } from '../../prisma/client';
import { crearLocal, crearUsuario, cabeceraAuth, crearCliente, crearProducto } from '../../__tests__/setup/factories';

async function local() {
  const business = await crearLocal();
  const { user } = await crearUsuario(business.id);
  return { business, user, auth: cabeceraAuth(user.id, business.id) };
}

describe('Servicios (turnos)', () => {
  it('abre y cierra un servicio', async () => {
    const e = await local();

    const abierto = await request(app).post('/api/services/start').set(e.auth).expect(201);
    expect(abierto.body.service.endedAt).toBeNull();

    const activo = await request(app).get('/api/services/active').set(e.auth).expect(200);
    expect(activo.body.service.id).toBe(abierto.body.service.id);

    const cerrado = await request(app).post('/api/services/end').set(e.auth).expect(200);
    expect(cerrado.body.service.endedAt).not.toBeNull();

    const trasCerrar = await request(app).get('/api/services/active').set(e.auth).expect(200);
    expect(trasCerrar.body.service).toBeNull();
  });

  it('rechaza abrir un segundo servicio', async () => {
    const e = await local();
    await request(app).post('/api/services/start').set(e.auth).expect(201);

    const segundo = await request(app).post('/api/services/start').set(e.auth);
    expect(segundo.status).toBe(409);
  });

  it('la base de datos impide dos servicios activos aunque falle la comprobación', async () => {
    // La invariante la garantizaba solo la aplicación, lo que deja la puerta abierta a
    // una condición de carrera entre dos peticiones simultáneas. El índice único parcial
    // la cierra a nivel de motor.
    const e = await local();
    await prisma.service.create({ data: { businessId: e.business.id } });

    await expect(
      prisma.service.create({ data: { businessId: e.business.id } })
    ).rejects.toThrow();
  });

  it('permite servicios activos simultáneos en locales distintos', async () => {
    const a = await local();
    const b = await local();

    await request(app).post('/api/services/start').set(a.auth).expect(201);
    await request(app).post('/api/services/start').set(b.auth).expect(201);
  });

  it('permite reabrir tras cerrar', async () => {
    const e = await local();
    await request(app).post('/api/services/start').set(e.auth).expect(201);
    await request(app).post('/api/services/end').set(e.auth).expect(200);
    await request(app).post('/api/services/start').set(e.auth).expect(201);
  });

  it('cerrar el servicio marca como entregados los pedidos en curso, pero no los cancelados', async () => {
    const e = await local();
    await request(app).post('/api/services/start').set(e.auth).expect(201);

    const cliente = await crearCliente(e.business.id);
    const producto = await crearProducto(e.business.id, { stock: 100 });

    const pedir = async () => {
      const r = await request(app)
        .post('/api/orders')
        .set(e.auth)
        .send({ customerId: cliente.id, items: [{ productId: producto.id, quantity: 1 }] })
        .expect(201);
      return r.body.id as string;
    };

    const enCurso = await pedir();
    const cancelado = await pedir();

    await request(app).patch(`/api/orders/${cancelado}/status`).set(e.auth).send({ status: 'CANCELLED' }).expect(200);
    await request(app).post('/api/services/end').set(e.auth).expect(200);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: enCurso } })).status).toBe('DELIVERED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: cancelado } })).status).toBe('CANCELLED');
  });

  it('devuelve 404 al cerrar si no hay servicio abierto', async () => {
    const e = await local();
    expect((await request(app).post('/api/services/end').set(e.auth)).status).toBe(404);
  });
});
