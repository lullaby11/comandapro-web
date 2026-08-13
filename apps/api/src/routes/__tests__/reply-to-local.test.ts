import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { prisma } from '../../prisma/client';
import { crearLocal, crearUsuario, cabeceraAuth } from '../../__tests__/setup/factories';

/**
 * Sin buzón propio, la respuesta de un cliente a la confirmación de su pedido llegaba al
 * soporte de la plataforma en lugar de al local que le está haciendo la comida.
 */
async function esperarCorreo(to: string) {
  for (let i = 0; i < 40; i++) {
    const c = await prisma.emailOutbox.findFirst({ where: { to } });
    if (c) return c;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

describe('Reply-To al buzón del local', () => {
  beforeEach(async () => {
    await prisma.emailOutbox.deleteMany({});
  });

  it('el correo de verificación responde al local cuando tiene buzón', async () => {
    const business = await crearLocal({ onlineOrderEnabled: true });
    await prisma.business.update({ where: { id: business.id }, data: { email: 'pedidos@ellocal.com' } });

    await request(app)
      .post(`/api/public/${business.slug}/auth/register`)
      .send({ name: 'Cliente', phone: '600100200', email: 'cliente1@ejemplo.com', address: 'Calle 1', password: 'contrasena', acceptTerms: true })
      .expect(201);

    const correo = await esperarCorreo('cliente1@ejemplo.com');
    expect(correo?.replyTo).toBe('pedidos@ellocal.com');
  });

  it('sin buzón del local, el Reply-To queda a cargo de la plataforma', async () => {
    const business = await crearLocal({ onlineOrderEnabled: true });

    await request(app)
      .post(`/api/public/${business.slug}/auth/register`)
      .send({ name: 'Cliente', phone: '600100201', email: 'cliente2@ejemplo.com', address: 'Calle 1', password: 'contrasena', acceptTerms: true })
      .expect(201);

    const correo = await esperarCorreo('cliente2@ejemplo.com');
    // Sin buzón propio no se guarda ninguno: al enviar se cae a MAIL_REPLY_TO
    expect(correo?.replyTo).toBeNull();
  });

  it('la invitación al equipo también responde al local', async () => {
    const business = await crearLocal();
    await prisma.business.update({ where: { id: business.id }, data: { email: 'jefa@ellocal.com' } });
    const { user } = await crearUsuario(business.id, { role: 'OWNER' });

    await request(app)
      .post('/api/users/invite')
      .set(cabeceraAuth(user.id, business.id, 'OWNER'))
      .send({ email: 'nuevo@ejemplo.com', role: 'STAFF' })
      .expect(201);

    const correo = await esperarCorreo('nuevo@ejemplo.com');
    expect(correo?.replyTo).toBe('jefa@ellocal.com');
  });

  it('un reintento conserva el buzón con el que se encoló', async () => {
    // Si el local cambia su buzón entre el fallo y el reintento, el correo ya enviado a
    // medias no debería cambiar de destinatario de respuestas.
    const registro = await prisma.emailOutbox.create({
      data: {
        to: 'reintento@ejemplo.com',
        subject: 'x',
        html: '<p>x</p>',
        text: 'x',
        businessName: 'Local',
        replyTo: 'elqueera@ellocal.com',
        status: 'PENDING',
        attempts: 1,
        nextAttemptAt: new Date(Date.now() - 1000),
      },
    });

    const { procesarBuzonDeSalida } = await import('../../services/email.service');
    await procesarBuzonDeSalida();

    const tras = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: registro.id } });
    expect(tras.status).toBe('SENT');
    expect(tras.replyTo).toBe('elqueera@ellocal.com');
  });
});

describe('Gestión del buzón del local en ajustes', () => {
  async function ajustes() {
    const business = await crearLocal();
    const { user } = await crearUsuario(business.id, { role: 'OWNER' });
    return { business, auth: cabeceraAuth(user.id, business.id, 'OWNER') };
  }

  it('se puede fijar y consultar', async () => {
    const e = await ajustes();

    const res = await request(app).patch('/api/settings').set(e.auth).send({ email: 'buzon@ellocal.com' }).expect(200);
    expect(res.body.email).toBe('buzon@ellocal.com');

    const leido = await request(app).get('/api/settings').set(e.auth).expect(200);
    expect(leido.body.email).toBe('buzon@ellocal.com');
  });

  it('se puede quitar enviando una cadena vacía', async () => {
    const e = await ajustes();
    await request(app).patch('/api/settings').set(e.auth).send({ email: 'buzon@ellocal.com' }).expect(200);

    const res = await request(app).patch('/api/settings').set(e.auth).send({ email: '' }).expect(200);
    expect(res.body.email).toBeNull();
  });

  it('rechaza direcciones mal formadas', async () => {
    const e = await ajustes();
    expect((await request(app).patch('/api/settings').set(e.auth).send({ email: 'esto-no-es-un-email' })).status).toBe(400);
  });

  it('un empleado no puede cambiarlo', async () => {
    const e = await ajustes();
    const { user: empleado } = await crearUsuario(e.business.id, { role: 'STAFF' });

    const res = await request(app)
      .patch('/api/settings')
      .set(cabeceraAuth(empleado.id, e.business.id, 'STAFF'))
      .send({ email: 'colado@ejemplo.com' });

    expect(res.status).toBe(403);
  });
});
