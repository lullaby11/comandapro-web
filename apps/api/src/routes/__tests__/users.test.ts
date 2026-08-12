import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { prisma } from '../../prisma/client';
import { crearLocal, crearUsuario, cabeceraAuth } from '../../__tests__/setup/factories';

/**
 * Hasta v1.1 el único usuario que existía era el OWNER creado en el registro: dar de alta
 * a un empleado obligaba a tocar la base de datos a mano. Era el hueco funcional más
 * grande para poder vender el producto.
 */
async function localConDueno() {
  const business = await crearLocal();
  const { user } = await crearUsuario(business.id, { role: 'OWNER' });
  return { business, owner: user, auth: cabeceraAuth(user.id, business.id, 'OWNER') };
}

async function tokenDeInvitacion(businessId: string) {
  const inv = await prisma.teamInvitation.findFirstOrThrow({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
  });
  return inv.token;
}

describe('GET /api/users — equipo del local', () => {
  it('lista los miembros y marca cuál soy yo', async () => {
    const e = await localConDueno();
    const { user: otro } = await crearUsuario(e.business.id, { role: 'STAFF', name: 'Empleada' });

    const res = await request(app).get('/api/users').set(e.auth).expect(200);

    expect(res.body.members).toHaveLength(2);
    const yo = res.body.members.find((m: { userId: string }) => m.userId === e.owner.id);
    const ella = res.body.members.find((m: { userId: string }) => m.userId === otro.id);
    expect(yo.isMe).toBe(true);
    expect(ella.isMe).toBe(false);
    expect(ella.role).toBe('STAFF');
  });

  it('no deja ver el equipo a un empleado', async () => {
    const e = await localConDueno();
    const { user: empleado } = await crearUsuario(e.business.id, { role: 'STAFF' });

    const res = await request(app).get('/api/users').set(cabeceraAuth(empleado.id, e.business.id, 'STAFF'));
    expect(res.status).toBe(403);
  });

  it('no mezcla el equipo de otro local', async () => {
    const a = await localConDueno();
    const b = await localConDueno();
    await crearUsuario(b.business.id, { role: 'STAFF' });

    const res = await request(app).get('/api/users').set(a.auth).expect(200);
    expect(res.body.members).toHaveLength(1);
  });
});

describe('Invitaciones', () => {
  it('invita a alguien y aparece como pendiente', async () => {
    const e = await localConDueno();

    const res = await request(app)
      .post('/api/users/invite')
      .set(e.auth)
      .send({ email: 'nueva@ejemplo.com', role: 'STAFF' })
      .expect(201);

    expect(res.body.email).toBe('nueva@ejemplo.com');

    const equipo = await request(app).get('/api/users').set(e.auth).expect(200);
    expect(equipo.body.invitations).toHaveLength(1);
    expect(equipo.body.invitations[0].email).toBe('nueva@ejemplo.com');
  });

  it('no permite invitar como propietario', async () => {
    const e = await localConDueno();
    const res = await request(app).post('/api/users/invite').set(e.auth).send({ email: 'x@ejemplo.com', role: 'OWNER' });
    expect(res.status).toBe(400);
  });

  it('rechaza invitar a quien ya está en el equipo', async () => {
    const e = await localConDueno();
    const { user } = await crearUsuario(e.business.id, { role: 'STAFF', email: 'ya@ejemplo.com' });
    expect(user.email).toBe('ya@ejemplo.com');

    const res = await request(app).post('/api/users/invite').set(e.auth).send({ email: 'ya@ejemplo.com', role: 'STAFF' });
    expect(res.status).toBe(409);
  });

  it('reactiva en lugar de invitar si la persona estaba desactivada', async () => {
    const e = await localConDueno();
    const { user, businessUser } = await crearUsuario(e.business.id, { role: 'STAFF', email: 'vuelve@ejemplo.com' });
    await prisma.businessUser.update({ where: { id: businessUser.id }, data: { disabledAt: new Date() } });

    const res = await request(app)
      .post('/api/users/invite')
      .set(e.auth)
      .send({ email: 'vuelve@ejemplo.com', role: 'ADMIN' })
      .expect(200);

    expect(res.body.reactivated).toBe(true);
    const actualizado = await prisma.businessUser.findUniqueOrThrow({ where: { id: businessUser.id } });
    expect(actualizado.disabledAt).toBeNull();
    expect(actualizado.role).toBe('ADMIN');
    expect(user.email).toBe('vuelve@ejemplo.com');
  });

  it('reinvitar sustituye la invitación anterior en lugar de duplicarla', async () => {
    const e = await localConDueno();

    await request(app).post('/api/users/invite').set(e.auth).send({ email: 'dup@ejemplo.com', role: 'STAFF' }).expect(201);
    const primerToken = await tokenDeInvitacion(e.business.id);

    await request(app).post('/api/users/invite').set(e.auth).send({ email: 'dup@ejemplo.com', role: 'ADMIN' }).expect(201);
    const segundoToken = await tokenDeInvitacion(e.business.id);

    expect(segundoToken).not.toBe(primerToken);
    expect(await prisma.teamInvitation.count({ where: { businessId: e.business.id } })).toBe(1);
  });

  it('un empleado no puede invitar', async () => {
    const e = await localConDueno();
    const { user: empleado } = await crearUsuario(e.business.id, { role: 'STAFF' });

    const res = await request(app)
      .post('/api/users/invite')
      .set(cabeceraAuth(empleado.id, e.business.id, 'STAFF'))
      .send({ email: 'x@ejemplo.com', role: 'STAFF' });

    expect(res.status).toBe(403);
  });

  it('se puede revocar una invitación pendiente', async () => {
    const e = await localConDueno();
    const creada = await request(app)
      .post('/api/users/invite')
      .set(e.auth)
      .send({ email: 'revocar@ejemplo.com', role: 'STAFF' })
      .expect(201);

    await request(app).delete(`/api/users/invitations/${creada.body.id}`).set(e.auth).expect(204);

    const equipo = await request(app).get('/api/users').set(e.auth);
    expect(equipo.body.invitations).toHaveLength(0);
  });
});

describe('Aceptar una invitación', () => {
  it('quien no tiene cuenta la crea y entra con sesión iniciada', async () => {
    const e = await localConDueno();
    await request(app).post('/api/users/invite').set(e.auth).send({ email: 'nuevo@ejemplo.com', role: 'STAFF' }).expect(201);
    const token = await tokenDeInvitacion(e.business.id);

    const previo = await request(app).get(`/api/invitations/${token}`).expect(200);
    expect(previo.body).toMatchObject({ email: 'nuevo@ejemplo.com', role: 'STAFF', hasAccount: false });

    const aceptada = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send({ name: 'Persona Nueva', password: 'contrasenasegura' })
      .expect(201);

    expect(aceptada.body.token).toBeTruthy();
    expect(aceptada.body.user.role).toBe('STAFF');

    // El token devuelto sirve para operar de inmediato
    const conSesion = await request(app).get('/api/products').set({ Authorization: `Bearer ${aceptada.body.token}` });
    expect(conSesion.status).toBe(200);
  });

  it('quien ya tiene cuenta no necesita crear contraseña', async () => {
    const e = await localConDueno();
    const otroLocal = await crearLocal();
    const { user } = await crearUsuario(otroLocal.id, { email: 'veterana@ejemplo.com', name: 'Veterana' });

    await request(app).post('/api/users/invite').set(e.auth).send({ email: 'veterana@ejemplo.com', role: 'ADMIN' }).expect(201);
    const token = await tokenDeInvitacion(e.business.id);

    const previo = await request(app).get(`/api/invitations/${token}`).expect(200);
    expect(previo.body.hasAccount).toBe(true);
    expect(previo.body.name).toBe('Veterana');

    await request(app).post(`/api/invitations/${token}/accept`).send({}).expect(201);

    // Ahora pertenece a los dos locales
    expect(await prisma.businessUser.count({ where: { userId: user.id } })).toBe(2);
  });

  it('exige nombre y contraseña a quien no tiene cuenta', async () => {
    const e = await localConDueno();
    await request(app).post('/api/users/invite').set(e.auth).send({ email: 'sin@ejemplo.com', role: 'STAFF' }).expect(201);
    const token = await tokenDeInvitacion(e.business.id);

    expect((await request(app).post(`/api/invitations/${token}/accept`).send({})).status).toBe(400);
    expect((await request(app).post(`/api/invitations/${token}/accept`).send({ name: 'X', password: 'corta' })).status).toBe(400);
  });

  it('una invitación no se puede usar dos veces', async () => {
    const e = await localConDueno();
    await request(app).post('/api/users/invite').set(e.auth).send({ email: 'unavez@ejemplo.com', role: 'STAFF' }).expect(201);
    const token = await tokenDeInvitacion(e.business.id);

    await request(app).post(`/api/invitations/${token}/accept`).send({ name: 'Una Vez', password: 'contrasenasegura' }).expect(201);
    expect((await request(app).post(`/api/invitations/${token}/accept`).send({ name: 'Nombre Valido', password: 'contrasenasegura' })).status).toBe(404);
  });

  it('una invitación caducada no sirve', async () => {
    const e = await localConDueno();
    await request(app).post('/api/users/invite').set(e.auth).send({ email: 'tarde@ejemplo.com', role: 'STAFF' }).expect(201);

    await prisma.teamInvitation.updateMany({
      where: { businessId: e.business.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const token = await tokenDeInvitacion(e.business.id);

    expect((await request(app).get(`/api/invitations/${token}`)).status).toBe(404);
    expect((await request(app).post(`/api/invitations/${token}/accept`).send({ name: 'Nombre Valido', password: 'contrasenasegura' })).status).toBe(404);
  });

  it('un token inventado no revela nada', async () => {
    expect((await request(app).get('/api/invitations/token-que-no-existe')).status).toBe(404);
  });
});

describe('Cambiar rol y revocar acceso', () => {
  it('cambia el rol de un miembro', async () => {
    const e = await localConDueno();
    const { businessUser } = await crearUsuario(e.business.id, { role: 'STAFF' });

    const res = await request(app).patch(`/api/users/${businessUser.id}`).set(e.auth).send({ role: 'ADMIN' }).expect(200);
    expect(res.body.role).toBe('ADMIN');
  });

  it('solo un propietario puede nombrar a otro propietario', async () => {
    const e = await localConDueno();
    const { user: admin, businessUser: buAdmin } = await crearUsuario(e.business.id, { role: 'ADMIN' });
    const { businessUser: buStaff } = await crearUsuario(e.business.id, { role: 'STAFF' });

    const comoAdmin = cabeceraAuth(admin.id, e.business.id, 'ADMIN');
    expect((await request(app).patch(`/api/users/${buStaff.id}`).set(comoAdmin).send({ role: 'OWNER' })).status).toBe(403);
    expect((await request(app).patch(`/api/users/${buStaff.id}`).set(e.auth).send({ role: 'OWNER' })).status).toBe(200);
    expect(buAdmin.role).toBe('ADMIN');
  });

  it('impide que el local se quede sin propietario activo', async () => {
    const e = await localConDueno();
    const miPertenencia = await prisma.businessUser.findFirstOrThrow({
      where: { userId: e.owner.id, businessId: e.business.id },
    });

    // Degradarse siendo el único propietario
    const degradar = await request(app).patch(`/api/users/${miPertenencia.id}`).set(e.auth).send({ role: 'STAFF' });
    expect(degradar.status).toBe(409);

    // Desactivarse siendo el único propietario
    const desactivar = await request(app).patch(`/api/users/${miPertenencia.id}`).set(e.auth).send({ disabled: true });
    expect(desactivar.status).toBe(409);
  });

  it('permite degradarse si hay otro propietario', async () => {
    const e = await localConDueno();
    await crearUsuario(e.business.id, { role: 'OWNER' });
    const miPertenencia = await prisma.businessUser.findFirstOrThrow({
      where: { userId: e.owner.id, businessId: e.business.id },
    });

    expect((await request(app).patch(`/api/users/${miPertenencia.id}`).set(e.auth).send({ role: 'ADMIN' })).status).toBe(200);
  });

  it('desactivar corta el acceso de inmediato, aunque el token siga vigente', async () => {
    const e = await localConDueno();
    const { user: empleado, businessUser } = await crearUsuario(e.business.id, { role: 'STAFF' });
    const suAuth = cabeceraAuth(empleado.id, e.business.id, 'STAFF');

    expect((await request(app).get('/api/products').set(suAuth)).status).toBe(200);

    await request(app).patch(`/api/users/${businessUser.id}`).set(e.auth).send({ disabled: true }).expect(200);

    const trasDesactivar = await request(app).get('/api/products').set(suAuth);
    expect(trasDesactivar.status).toBe(403);
    expect(trasDesactivar.body.error).toMatch(/desactivado/i);
  });

  it('reactivar devuelve el acceso', async () => {
    const e = await localConDueno();
    const { user: empleado, businessUser } = await crearUsuario(e.business.id, { role: 'STAFF' });
    const suAuth = cabeceraAuth(empleado.id, e.business.id, 'STAFF');

    await request(app).patch(`/api/users/${businessUser.id}`).set(e.auth).send({ disabled: true }).expect(200);
    await request(app).patch(`/api/users/${businessUser.id}`).set(e.auth).send({ disabled: false }).expect(200);

    expect((await request(app).get('/api/products').set(suAuth)).status).toBe(200);
  });

  it('no deja quitarse a uno mismo del local', async () => {
    const e = await localConDueno();
    const miPertenencia = await prisma.businessUser.findFirstOrThrow({
      where: { userId: e.owner.id, businessId: e.business.id },
    });

    const res = await request(app).delete(`/api/users/${miPertenencia.id}`).set(e.auth);
    expect(res.status).toBe(409);
  });

  it('revoca el acceso de otro miembro sin borrar su cuenta', async () => {
    const e = await localConDueno();
    const { user: empleado, businessUser } = await crearUsuario(e.business.id, { role: 'STAFF' });

    await request(app).delete(`/api/users/${businessUser.id}`).set(e.auth).expect(204);

    // La pertenencia desaparece, pero el usuario sigue existiendo: puede estar en otros locales
    expect(await prisma.businessUser.count({ where: { id: businessUser.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: empleado.id } })).toBe(1);
  });

  it('no deja tocar a un miembro de otro local', async () => {
    const a = await localConDueno();
    const b = await localConDueno();
    const { businessUser: deB } = await crearUsuario(b.business.id, { role: 'STAFF' });

    expect((await request(app).patch(`/api/users/${deB.id}`).set(a.auth).send({ role: 'ADMIN' })).status).toBe(404);
    expect((await request(app).delete(`/api/users/${deB.id}`).set(a.auth)).status).toBe(404);
  });
});
