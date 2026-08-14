import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { prisma } from '../../prisma/client';
import {
  crearLocal, crearUsuario, crearCliente, abrirServicio, cabeceraAuth,
} from '../../__tests__/setup/factories';

/**
 * El rol de reparto es distinto a los demás: no restringe qué puede hacer alguien dentro
 * del local, sino que lo saca del local por completo. Un repartidor suele ser personal
 * rotativo, así que estas pruebas fijan las dos cosas que importan — que no ve la gestión
 * y que no ve los pedidos de otros — y no solo el camino feliz.
 */

async function crearPedido(
  businessId: string,
  serviceId: string,
  customerId: string,
  datos: Partial<{ status: string; isPickup: boolean; assignedToId: string }> = {},
) {
  return prisma.order.create({
    data: {
      businessId,
      serviceId,
      customerId,
      status: (datos.status ?? 'READY') as never,
      isPickup: datos.isPickup ?? false,
      assignedToId: datos.assignedToId ?? null,
      deliveryAddress: 'Calle Mayor 3',
      total: 20, subtotal: 20, tax: 0,
    },
  });
}

async function escenario() {
  const business = await crearLocal();
  const service = await abrirServicio(business.id);
  const customer = await crearCliente(business.id);

  const { user: dueno }    = await crearUsuario(business.id, { role: 'OWNER' });
  const { user: ana }      = await crearUsuario(business.id, { role: 'DELIVERY', name: 'Ana' });
  const { user: bruno }    = await crearUsuario(business.id, { role: 'DELIVERY', name: 'Bruno' });

  return {
    business, service, customer, ana, bruno, dueno,
    local:    cabeceraAuth(dueno.id, business.id, 'OWNER'),
    anaAuth:  cabeceraAuth(ana.id, business.id, 'DELIVERY'),
    brunoAuth: cabeceraAuth(bruno.id, business.id, 'DELIVERY'),
    pedido: (d: Parameters<typeof crearPedido>[3] = {}) =>
      crearPedido(business.id, service.id, customer.id, d),
  };
}

describe('Un repartidor no entra en la gestión del local', () => {
  // Lo que de verdad protege esto no es una lista de rutas, sino que authMiddleware
  // rechaza el rol por defecto. Se comprueban varias rutas para verificar que el bloqueo
  // es del middleware compartido y no de una comprobación suelta en cada una.
  it.each([
    ['/api/products',       'get'],
    ['/api/customers',      'get'],
    ['/api/stats/resumen',  'get'],
    ['/api/settings',       'get'],
    ['/api/orders',         'get'],
    ['/api/users',          'get'],
    ['/api/export/datos',   'get'],
  ])('%s le devuelve 403', async (ruta, metodo) => {
    const e = await escenario();

    const res = await (request(app) as never as Record<string, (r: string) => request.Test>)
      [metodo](ruta).set(e.anaAuth);

    expect(res.status).toBe(403);
    expect(res.body.soloReparto).toBe(true);
  });

  it('tampoco puede cambiar el estado por la vía del dashboard', async () => {
    const e = await escenario();
    const pedido = await e.pedido({ assignedToId: e.ana.id });

    const res = await request(app)
      .patch(`/api/orders/${pedido.id}/status`)
      .set(e.anaAuth)
      .send({ status: 'CANCELLED' });

    expect(res.status).toBe(403);
  });

  it('el rol se lee de la base de datos, así que degradar a alguien surte efecto ya', async () => {
    const e = await escenario();
    // Token emitido cuando todavía era encargado
    const tokenAntiguo = cabeceraAuth(e.dueno.id, e.business.id, 'ADMIN');

    await prisma.businessUser.updateMany({
      where: { userId: e.dueno.id, businessId: e.business.id },
      data: { role: 'DELIVERY' },
    });

    const res = await request(app).get('/api/products').set(tokenAntiguo);
    expect(res.status).toBe(403);
  });
});

describe('Un repartidor solo ve sus pedidos', () => {
  it('no aparecen los de otro repartidor', async () => {
    const e = await escenario();
    const mio   = await e.pedido({ assignedToId: e.ana.id });
    await e.pedido({ assignedToId: e.bruno.id });
    await e.pedido(); // sin asignar

    const res = await request(app).get('/api/delivery/orders').set(e.anaAuth);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(mio.id);
  });

  it('no ve los pedidos de otro local aunque le hayan asignado el id', async () => {
    const e = await escenario();
    const otro = await crearLocal();
    const otroService = await abrirServicio(otro.id);
    const otroCliente = await crearCliente(otro.id);
    // Mismo usuario, pedido de otro local: no debe verlo con el token de este
    await crearPedido(otro.id, otroService.id, otroCliente.id, { assignedToId: e.ana.id });

    const res = await request(app).get('/api/delivery/orders').set(e.anaAuth);

    expect(res.body).toHaveLength(0);
  });

  it('no expone datos que no necesita para repartir', async () => {
    const e = await escenario();
    await e.pedido({ assignedToId: e.ana.id });

    const res = await request(app).get('/api/delivery/orders').set(e.anaAuth);
    const pedido = res.body[0];

    // Lo que sí necesita
    expect(pedido.deliveryAddress).toBeTruthy();
    expect(pedido.customer.phone).toBeTruthy();
    expect(pedido.total).toBeTruthy();
    // Lo que no: el token de seguimiento público y el identificador de la cuenta del
    // cliente no pintan nada en la calle y son datos personales de más.
    expect(pedido.trackingToken).toBeUndefined();
    expect(pedido.customerAccountId).toBeUndefined();
    expect(pedido.customerId).toBeUndefined();
  });
});

describe('Transiciones que puede hacer el repartidor', () => {
  it('listo → en reparto → entregado', async () => {
    const e = await escenario();
    const pedido = await e.pedido({ assignedToId: e.ana.id, status: 'READY' });

    const salida = await request(app)
      .patch(`/api/delivery/orders/${pedido.id}/status`)
      .set(e.anaAuth).send({ status: 'OUT_FOR_DELIVERY' });
    expect(salida.status).toBe(200);

    const entrega = await request(app)
      .patch(`/api/delivery/orders/${pedido.id}/status`)
      .set(e.anaAuth).send({ status: 'DELIVERED' });
    expect(entrega.status).toBe(200);
    expect(entrega.body.status).toBe('DELIVERED');
  });

  it('no puede saltarse la salida a reparto', async () => {
    const e = await escenario();
    const pedido = await e.pedido({ assignedToId: e.ana.id, status: 'READY' });

    const res = await request(app)
      .patch(`/api/delivery/orders/${pedido.id}/status`)
      .set(e.anaAuth).send({ status: 'DELIVERED' });

    expect(res.status).toBe(409);
  });

  it('no puede sacar un pedido que cocina no ha terminado', async () => {
    const e = await escenario();
    const pedido = await e.pedido({ assignedToId: e.ana.id, status: 'PREPARING' });

    const res = await request(app)
      .patch(`/api/delivery/orders/${pedido.id}/status`)
      .set(e.anaAuth).send({ status: 'OUT_FOR_DELIVERY' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/listo/i);
  });

  it.each(['CANCELLED', 'PREPARING', 'READY', 'PENDING'])(
    'no puede poner el pedido en %s', async (estado) => {
      const e = await escenario();
      const pedido = await e.pedido({ assignedToId: e.ana.id, status: 'OUT_FOR_DELIVERY' });

      const res = await request(app)
        .patch(`/api/delivery/orders/${pedido.id}/status`)
        .set(e.anaAuth).send({ status: estado });

      expect(res.status).toBe(400);
    });

  it('no puede tocar el pedido de otro repartidor, y recibe 404 en vez de 403', async () => {
    const e = await escenario();
    const ajeno = await e.pedido({ assignedToId: e.bruno.id, status: 'READY' });

    const res = await request(app)
      .patch(`/api/delivery/orders/${ajeno.id}/status`)
      .set(e.anaAuth).send({ status: 'OUT_FOR_DELIVERY' });

    // 404 y no 403: un 403 confirmaría que ese pedido existe
    expect(res.status).toBe(404);

    const sinTocar = await prisma.order.findUniqueOrThrow({ where: { id: ajeno.id } });
    expect(sinTocar.status).toBe('READY');
  });

  it('pulsar dos veces el mismo botón no da error', async () => {
    const e = await escenario();
    const pedido = await e.pedido({ assignedToId: e.ana.id, status: 'OUT_FOR_DELIVERY' });

    const res = await request(app)
      .patch(`/api/delivery/orders/${pedido.id}/status`)
      .set(e.anaAuth).send({ status: 'OUT_FOR_DELIVERY' });

    expect(res.status).toBe(200);
  });
});

describe('Asignación desde el local', () => {
  it('el mostrador asigna y desasigna', async () => {
    const e = await escenario();
    const pedido = await e.pedido();

    const asignar = await request(app)
      .patch(`/api/orders/${pedido.id}/assign`)
      .set(e.local).send({ repartidorId: e.ana.id });
    expect(asignar.status).toBe(200);
    expect(asignar.body.assignedTo.name).toBe('Ana');
    expect(asignar.body.assignedAt).toBeTruthy();

    const quitar = await request(app)
      .patch(`/api/orders/${pedido.id}/assign`)
      .set(e.local).send({ repartidorId: null });
    expect(quitar.status).toBe(200);
    expect(quitar.body.assignedToId).toBeNull();
    expect(quitar.body.assignedAt).toBeNull();
  });

  it('reasignar se lo quita al anterior', async () => {
    const e = await escenario();
    const pedido = await e.pedido({ assignedToId: e.ana.id });

    await request(app).patch(`/api/orders/${pedido.id}/assign`)
      .set(e.local).send({ repartidorId: e.bruno.id });

    const deAna = await request(app).get('/api/delivery/orders').set(e.anaAuth);
    expect(deAna.body).toHaveLength(0);

    const deBruno = await request(app).get('/api/delivery/orders').set(e.brunoAuth);
    expect(deBruno.body).toHaveLength(1);
  });

  it('no se asigna un pedido de recogida', async () => {
    const e = await escenario();
    const pedido = await e.pedido({ isPickup: true });

    const res = await request(app)
      .patch(`/api/orders/${pedido.id}/assign`)
      .set(e.local).send({ repartidorId: e.ana.id });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/recogida/i);
  });

  it('no se asigna a alguien de otro local', async () => {
    const e = await escenario();
    const otro = await crearLocal();
    const { user: intruso } = await crearUsuario(otro.id, { role: 'DELIVERY' });
    const pedido = await e.pedido();

    const res = await request(app)
      .patch(`/api/orders/${pedido.id}/assign`)
      .set(e.local).send({ repartidorId: intruso.id });

    expect(res.status).toBe(404);

    const sinAsignar = await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(sinAsignar.assignedToId).toBeNull();
  });

  it('no se asigna a alguien con el acceso desactivado', async () => {
    const e = await escenario();
    await prisma.businessUser.updateMany({
      where: { userId: e.ana.id, businessId: e.business.id },
      data: { disabledAt: new Date() },
    });
    const pedido = await e.pedido();

    const res = await request(app)
      .patch(`/api/orders/${pedido.id}/assign`)
      .set(e.local).send({ repartidorId: e.ana.id });

    expect(res.status).toBe(404);
  });

  it('no se reabre un pedido ya entregado asignándolo', async () => {
    const e = await escenario();
    const pedido = await e.pedido({ status: 'DELIVERED' });

    const res = await request(app)
      .patch(`/api/orders/${pedido.id}/assign`)
      .set(e.local).send({ repartidorId: e.ana.id });

    expect(res.status).toBe(409);
  });
});
