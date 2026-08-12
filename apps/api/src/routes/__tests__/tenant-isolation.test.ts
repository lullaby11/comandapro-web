import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { crearLocal, crearUsuario, crearProducto, crearCliente, abrirServicio, cabeceraAuth } from '../../__tests__/setup/factories';

/**
 * El aislamiento entre locales depende al 100 % de que cada consulta filtre por
 * businessId. No hay Row Level Security que lo respalde: un `findUnique` por id olvidado
 * filtra datos de un cliente a otro. Estos tests son la única red que lo detecta.
 */
describe('Aislamiento multi-tenant', () => {
  async function dosLocales() {
    const localA = await crearLocal({ name: 'Local A' });
    const localB = await crearLocal({ name: 'Local B' });
    const { user: usuarioA } = await crearUsuario(localA.id);
    const { user: usuarioB } = await crearUsuario(localB.id);

    return {
      localA,
      localB,
      authA: cabeceraAuth(usuarioA.id, localA.id),
      authB: cabeceraAuth(usuarioB.id, localB.id),
    };
  }

  it('no deja ver los productos de otro local', async () => {
    const { localA, localB, authB } = await dosLocales();
    const productoDeA = await crearProducto(localA.id, { name: 'Secreto de A' });
    await crearProducto(localB.id, { name: 'Producto de B' });

    const listado = await request(app).get('/api/products').set(authB);
    expect(listado.status).toBe(200);
    expect(listado.body).toHaveLength(1);
    expect(listado.body[0].name).toBe('Producto de B');

    // Y por id directo: 404, no 403, para no revelar que el recurso existe
    const directo = await request(app).get(`/api/products/${productoDeA.id}`).set(authB);
    expect(directo.status).toBe(404);
  });

  it('no deja modificar ni desactivar un producto de otro local', async () => {
    const { localA, authB } = await dosLocales();
    const productoDeA = await crearProducto(localA.id, { name: 'Secreto de A', stock: 10 });

    const patch = await request(app).patch(`/api/products/${productoDeA.id}`).set(authB).send({ stock: 999 });
    expect(patch.status).toBe(404);

    const del = await request(app).delete(`/api/products/${productoDeA.id}`).set(authB);
    expect(del.status).toBe(404);
  });

  it('no deja ver los clientes de otro local ni buscarlos por teléfono', async () => {
    const { localA, authB } = await dosLocales();
    await crearCliente(localA.id, { name: 'Cliente de A', phone: '600111222' });

    const listado = await request(app).get('/api/customers').set(authB);
    expect(listado.status).toBe(200);
    expect(listado.body.customers).toHaveLength(0);

    const porTelefono = await request(app).get('/api/customers/by-phone/600111222').set(authB);
    expect(porTelefono.status).toBe(404);
  });

  it('no deja ver ni tocar los pedidos de otro local', async () => {
    const { localA, authA, authB } = await dosLocales();
    await abrirServicio(localA.id);
    const cliente = await crearCliente(localA.id);
    const producto = await crearProducto(localA.id, { stock: 5 });

    const creado = await request(app)
      .post('/api/orders')
      .set(authA)
      .send({ customerId: cliente.id, items: [{ productId: producto.id, quantity: 1 }] });
    expect(creado.status).toBe(201);

    const pedidoId = creado.body.id;

    expect((await request(app).get(`/api/orders/${pedidoId}`).set(authB)).status).toBe(404);
    expect((await request(app).patch(`/api/orders/${pedidoId}/status`).set(authB).send({ status: 'PREPARING' })).status).toBe(404);
    expect((await request(app).delete(`/api/orders/${pedidoId}`).set(authB)).status).toBe(404);
    expect((await request(app).post(`/api/orders/${pedidoId}/print`).set(authB)).status).toBe(404);
  });

  it('no deja ver la configuración de otro local', async () => {
    const { localA, localB, authB } = await dosLocales();

    const ajustes = await request(app).get('/api/settings').set(authB);
    expect(ajustes.status).toBe(200);
    expect(ajustes.body.id).toBe(localB.id);
    expect(ajustes.body.id).not.toBe(localA.id);
  });

  it('no deja consultar estadísticas de recursos de otro local', async () => {
    const { localA, authB } = await dosLocales();
    const productoDeA = await crearProducto(localA.id);
    const clienteDeA = await crearCliente(localA.id);
    const servicioDeA = await abrirServicio(localA.id);

    expect((await request(app).get(`/api/stats/product/${productoDeA.id}`).set(authB)).status).toBe(404);
    expect((await request(app).get(`/api/stats/customer/${clienteDeA.id}`).set(authB)).status).toBe(404);
    expect((await request(app).get(`/api/stats/service/${servicioDeA.id}`).set(authB)).status).toBe(404);
  });

  it('rechaza un token cuyo usuario ya no pertenece al local', async () => {
    const local = await crearLocal();
    const { user } = await crearUsuario(local.id);
    const auth = cabeceraAuth(user.id, local.id);

    expect((await request(app).get('/api/products').set(auth)).status).toBe(200);

    // Se revoca el acceso: el token sigue siendo válido criptográficamente, pero el
    // middleware relee la pertenencia en cada petición.
    const { prisma } = await import('../../prisma/client');
    await prisma.businessUser.deleteMany({ where: { userId: user.id, businessId: local.id } });

    expect((await request(app).get('/api/products').set(auth)).status).toBe(403);
  });

  it('rechaza peticiones sin token o con token inválido', async () => {
    expect((await request(app).get('/api/products')).status).toBe(401);
    expect((await request(app).get('/api/products').set({ Authorization: 'Bearer basura' })).status).toBe(401);
  });
});
