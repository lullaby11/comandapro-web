import { describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../index';
import { prisma } from '../../prisma/client';
import { escenarioBase, crearLocal, crearUsuario, cabeceraAuth } from '../../__tests__/setup/factories';

/**
 * Administración de la plataforma.
 *
 * Es el permiso más peligroso del sistema: acceso transversal a todos los locales, justo
 * lo contrario de la regla que sostiene el aislamiento multi-tenant. Los tests que más
 * importan aquí no son los del camino feliz, sino los que comprueban que **nadie más**
 * puede entrar.
 */
async function crearAdminDePlataforma(password = 'contrasenaplataforma') {
  const local = await crearLocal();
  const { user } = await crearUsuario(local.id, { role: 'OWNER', password });
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 4) },
  });
  await prisma.platformAdmin.create({ data: { userId: user.id } });
  return { user, password, local };
}

async function tokenDePlataforma() {
  const { user, password } = await crearAdminDePlataforma();
  const res = await request(app)
    .post('/api/platform/auth/login')
    .send({ email: user.email, password })
    .expect(200);
  return { token: res.body.token, auth: { Authorization: `Bearer ${res.body.token}` }, user };
}

describe('Acceso a la plataforma', () => {
  it('un administrador de plataforma entra sin indicar local', async () => {
    const { user, password } = await crearAdminDePlataforma();

    const res = await request(app)
      .post('/api/platform/auth/login')
      .send({ email: user.email, password })
      .expect(200);

    expect(res.body.token).toBeTruthy();
    expect(res.body.admin.email).toBe(user.email);
  });

  it('un usuario normal NO puede entrar, aunque sea propietario de su local', async () => {
    const local = await crearLocal();
    const { user, password } = await crearUsuario(local.id, { role: 'OWNER' });

    const res = await request(app)
      .post('/api/platform/auth/login')
      .send({ email: user.email, password });

    expect(res.status).toBe(401);
  });

  it('no revela quién es administrador: mismo error en todos los casos', async () => {
    const { user } = await crearAdminDePlataforma();
    const otro = await crearLocal();
    const { user: normal } = await crearUsuario(otro.id);

    const inexistente = await request(app).post('/api/platform/auth/login').send({ email: 'nadie@ejemplo.com', password: 'x' });
    const noAdmin = await request(app).post('/api/platform/auth/login').send({ email: normal.email, password: 'x' });
    const malaClave = await request(app).post('/api/platform/auth/login').send({ email: user.email, password: 'incorrecta' });

    for (const r of [inexistente, noAdmin, malaClave]) {
      expect(r.status).toBe(401);
      expect(r.body.error).toBe('Credenciales incorrectas');
    }
  });

  it('un token de local NO abre la plataforma', async () => {
    // La separación de ejes es el punto crítico: ambos tokens se firman con el mismo
    // secreto, así que lo que los distingue es el scope y el contenido.
    const e = await escenarioBase();

    for (const ruta of ['/api/platform/metrics', '/api/platform/businesses', '/api/platform/audit']) {
      const res = await request(app).get(ruta).set(e.auth);
      expect(res.status, `${ruta} no debería aceptar un token de local`).toBe(403);
    }
  });

  it('un token de plataforma NO sirve para operar un local', async () => {
    const { auth } = await tokenDePlataforma();

    for (const ruta of ['/api/products', '/api/orders', '/api/settings', '/api/users']) {
      const res = await request(app).get(ruta).set(auth);
      expect([401, 403]).toContain(res.status);
    }
  });

  it('revocar el acceso surte efecto de inmediato, con el token aún vigente', async () => {
    const { auth, user } = await tokenDePlataforma();
    await request(app).get('/api/platform/metrics').set(auth).expect(200);

    const admin = await prisma.platformAdmin.findUniqueOrThrow({ where: { userId: user.id } });
    await prisma.platformAdmin.delete({ where: { id: admin.id } });

    const res = await request(app).get('/api/platform/metrics').set(auth);
    expect(res.status).toBe(403);
  });

  it('rechaza peticiones sin token', async () => {
    expect((await request(app).get('/api/platform/metrics')).status).toBe(401);
  });
});

describe('Métricas y listado de locales', () => {
  it('cuenta locales y pedidos de toda la plataforma', async () => {
    const { auth } = await tokenDePlataforma();
    const a = await escenarioBase({ stock: 50 });
    await request(app)
      .post('/api/orders')
      .set(a.auth)
      .send({ customerId: a.customer.id, items: [{ productId: a.product.id, quantity: 1 }] })
      .expect(201);

    const res = await request(app).get('/api/platform/metrics').set(auth).expect(200);

    expect(res.body.locales.total).toBeGreaterThanOrEqual(2);
    expect(res.body.pedidos.ultimos30d).toBe(1);
    // "Activo" es haber pedido algo, no estar dado de alta
    expect(res.body.locales.activos30d).toBe(1);
  });

  it('lista los locales con su actividad', async () => {
    const { auth } = await tokenDePlataforma();
    const e = await escenarioBase({ stock: 50 });
    await request(app)
      .post('/api/orders')
      .set(e.auth)
      .send({ customerId: e.customer.id, items: [{ productId: e.product.id, quantity: 1 }] })
      .expect(201);

    const res = await request(app).get('/api/platform/businesses').set(auth).expect(200);

    const local = res.body.businesses.find((b: { id: string }) => b.id === e.business.id);
    expect(local.pedidos30d).toBe(1);
    expect(local.usuarios).toBe(1);
    expect(local.ultimoPedido).not.toBeNull();
  });

  it('busca por nombre y por identificador', async () => {
    const { auth } = await tokenDePlataforma();
    await crearLocal({ name: 'Pizzería Buscable', slug: 'buscable-abc' });

    const porNombre = await request(app).get('/api/platform/businesses?q=Buscable').set(auth).expect(200);
    expect(porNombre.body.businesses).toHaveLength(1);

    const porSlug = await request(app).get('/api/platform/businesses?q=buscable-abc').set(auth).expect(200);
    expect(porSlug.body.businesses).toHaveLength(1);
  });
});

describe('Suspensión de un local', () => {
  it('suspende, y su equipo deja de poder operar de inmediato', async () => {
    const { auth } = await tokenDePlataforma();
    const e = await escenarioBase();

    // Antes de suspender, el equipo trabaja con normalidad
    await request(app).get('/api/products').set(e.auth).expect(200);

    const res = await request(app)
      .post(`/api/platform/businesses/${e.business.id}/suspend`)
      .set(auth)
      .send({ reason: 'Impago de la cuota de julio' })
      .expect(200);
    expect(res.body.suspended).toBe(true);

    // Con la sesión ya abierta: la suspensión no espera a que caduque el token
    const bloqueado = await request(app).get('/api/products').set(e.auth);
    expect(bloqueado.status).toBe(403);
    expect(bloqueado.body.suspended).toBe(true);
  });

  it('cierra la tienda online del local suspendido', async () => {
    const { auth } = await tokenDePlataforma();
    const business = await crearLocal({ onlineOrderEnabled: true });

    await request(app).get(`/api/public/${business.slug}`).expect(200);

    await request(app)
      .post(`/api/platform/businesses/${business.id}/suspend`)
      .set(auth)
      .send({ reason: 'Incumplimiento' })
      .expect(200);

    // Deja de existir de cara al público: no se revela ni que el local existe
    await request(app).get(`/api/public/${business.slug}`).expect(404);
    await request(app).get(`/api/public/${business.slug}/products`).expect(404);
  });

  it('exige un motivo', async () => {
    const { auth } = await tokenDePlataforma();
    const business = await crearLocal();

    expect((await request(app).post(`/api/platform/businesses/${business.id}/suspend`).set(auth).send({})).status).toBe(400);
    expect((await request(app).post(`/api/platform/businesses/${business.id}/suspend`).set(auth).send({ reason: 'x' })).status).toBe(400);
  });

  it('reactivar devuelve el local a la normalidad', async () => {
    const { auth } = await tokenDePlataforma();
    const e = await escenarioBase();

    await request(app).post(`/api/platform/businesses/${e.business.id}/suspend`).set(auth).send({ reason: 'Prueba' }).expect(200);
    expect((await request(app).get('/api/products').set(e.auth)).status).toBe(403);

    await request(app).post(`/api/platform/businesses/${e.business.id}/reactivate`).set(auth).expect(200);
    await request(app).get('/api/products').set(e.auth).expect(200);
  });

  it('no deja suspender dos veces ni reactivar lo que no está suspendido', async () => {
    const { auth } = await tokenDePlataforma();
    const business = await crearLocal();

    expect((await request(app).post(`/api/platform/businesses/${business.id}/reactivate`).set(auth)).status).toBe(409);
    await request(app).post(`/api/platform/businesses/${business.id}/suspend`).set(auth).send({ reason: 'Motivo' }).expect(200);
    expect((await request(app).post(`/api/platform/businesses/${business.id}/suspend`).set(auth).send({ reason: 'Otro' })).status).toBe(409);
  });

  it('un local suspendido no puede recibir pedidos online', async () => {
    const { auth } = await tokenDePlataforma();
    const business = await crearLocal({ onlineOrderEnabled: true });
    await request(app).post(`/api/platform/businesses/${business.id}/suspend`).set(auth).send({ reason: 'Impago' }).expect(200);

    const res = await request(app)
      .post(`/api/public/${business.slug}/auth/register`)
      .send({ name: 'Cliente', phone: '600123999', email: 'x@ejemplo.com', address: 'Calle 1', password: 'contrasena', acceptTerms: true });

    expect(res.status).toBe(404);
  });
});

describe('Registro de auditoría', () => {
  it('deja constancia de quién suspendió, cuándo y por qué', async () => {
    const { auth, user } = await tokenDePlataforma();
    const e = await escenarioBase();

    await request(app)
      .post(`/api/platform/businesses/${e.business.id}/suspend`)
      .set(auth)
      .send({ reason: 'Impago reiterado' })
      .expect(200);

    const res = await request(app).get('/api/platform/audit').set(auth).expect(200);
    const registro = res.body.entries.find((x: { action: string }) => x.action === 'suspender_local');

    expect(registro).toBeDefined();
    expect(registro.adminEmail).toBe(user.email);
    expect(registro.businessId).toBe(e.business.id);
    expect(registro.businessName).toBe(e.business.name);
    expect(registro.detail).toBe('Impago reiterado');
  });

  it('registra también los inicios de sesión y las reactivaciones', async () => {
    const { auth } = await tokenDePlataforma();
    const business = await crearLocal();

    await request(app).post(`/api/platform/businesses/${business.id}/suspend`).set(auth).send({ reason: 'Prueba' });
    await request(app).post(`/api/platform/businesses/${business.id}/reactivate`).set(auth);

    const res = await request(app).get('/api/platform/audit').set(auth).expect(200);
    const acciones = res.body.entries.map((x: { action: string }) => x.action);

    expect(acciones).toContain('login');
    expect(acciones).toContain('reactivar_local');
  });

  it('el registro no lo puede leer un usuario de local', async () => {
    const e = await escenarioBase();
    expect((await request(app).get('/api/platform/audit').set(e.auth)).status).toBe(403);
  });
});

describe('Arranque del primer administrador', () => {
  const TOKEN = 'token-de-arranque-de-prueba';

  async function conSecreto<T>(fn: () => Promise<T>): Promise<T> {
    process.env.PLATFORM_BOOTSTRAP_TOKEN = TOKEN;
    try {
      return await fn();
    } finally {
      delete process.env.PLATFORM_BOOTSTRAP_TOKEN;
    }
  }

  it('eleva a un usuario existente cuando no hay ningún administrador', async () => {
    const local = await crearLocal();
    const { user } = await crearUsuario(local.id, { role: 'OWNER' });

    const res = await conSecreto(() =>
      request(app).post('/api/platform/bootstrap').send({ token: TOKEN, email: user.email })
    );

    expect(res.status).toBe(201);
    expect(res.body.granted).toBe(true);
    expect(await prisma.platformAdmin.count({ where: { userId: user.id } })).toBe(1);
  });

  it('SE AUTODESACTIVA en cuanto existe un administrador', async () => {
    // Es la propiedad que lo hace seguro: no es una puerta trasera permanente
    await crearAdminDePlataforma();
    const local = await crearLocal();
    const { user } = await crearUsuario(local.id);

    const res = await conSecreto(() =>
      request(app).post('/api/platform/bootstrap').send({ token: TOKEN, email: user.email })
    );

    expect(res.status).toBe(409);
  });

  it('no existe si no está configurado el secreto', async () => {
    const local = await crearLocal();
    const { user } = await crearUsuario(local.id);

    // Sin PLATFORM_BOOTSTRAP_TOKEN la ruta responde 404, como si no existiera
    const res = await request(app).post('/api/platform/bootstrap').send({ token: 'x', email: user.email });
    expect(res.status).toBe(404);
  });

  it('rechaza un token incorrecto', async () => {
    const local = await crearLocal();
    const { user } = await crearUsuario(local.id);

    const res = await conSecreto(() =>
      request(app).post('/api/platform/bootstrap').send({ token: 'incorrecto', email: user.email })
    );

    expect(res.status).toBe(401);
    expect(await prisma.platformAdmin.count()).toBe(0);
  });

  it('no crea usuarios: solo eleva los que existen', async () => {
    const res = await conSecreto(() =>
      request(app).post('/api/platform/bootstrap').send({ token: TOKEN, email: 'nadie@ejemplo.com' })
    );

    expect(res.status).toBe(404);
    expect(await prisma.user.count({ where: { email: 'nadie@ejemplo.com' } })).toBe(0);
  });

  it('deja constancia en la auditoría', async () => {
    const local = await crearLocal();
    const { user } = await crearUsuario(local.id);

    await conSecreto(() =>
      request(app).post('/api/platform/bootstrap').send({ token: TOKEN, email: user.email }).expect(201)
    );

    const registro = await prisma.platformAuditLog.findFirstOrThrow({
      where: { action: 'conceder_acceso_plataforma' },
    });
    expect(registro.adminEmail).toBe('bootstrap');
    expect(registro.detail).toBe(user.email);
  });
});
