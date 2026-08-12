import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma/client';
import { authMiddleware, requireAdmin, AuthenticatedRequest } from '../middleware/auth.middleware';
import { sendTeamInvitationEmail } from '../services/email.service';

const router = Router();
router.use(authMiddleware);

const DURACION_INVITACION_MS = 7 * 24 * 3600_000;

/**
 * Cuenta los dueños activos del local. Se usa para impedir que el último OWNER se
 * degrade o se desactive a sí mismo y deje el local sin nadie que pueda administrarlo.
 */
async function contarDuenosActivos(businessId: string): Promise<number> {
  return prisma.businessUser.count({
    where: { businessId, role: 'OWNER', disabledAt: null },
  });
}

// ──────────────────────────────────────────────
// GET /users — Equipo del local
// ──────────────────────────────────────────────
router.get('/', requireAdmin, async (req: AuthenticatedRequest, res) => {
  const [miembros, invitaciones] = await Promise.all([
    prisma.businessUser.findMany({
      where: { businessId: req.businessId! },
      include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.teamInvitation.findMany({
      where: { businessId: req.businessId!, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  res.json({
    members: miembros.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      disabledAt: m.disabledAt,
      isMe: m.userId === req.userId,
      joinedAt: m.createdAt,
    })),
    invitations: invitaciones,
  });
});

// ──────────────────────────────────────────────
// POST /users/invite — Invitar a alguien al local
// ──────────────────────────────────────────────
router.post('/invite', requireAdmin, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    email: z.string().email(),
    role: z.enum(['ADMIN', 'STAFF']), // no se invita como OWNER: se transfiere después
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const email = parsed.data.email.toLowerCase().trim();
  const businessId = req.businessId!;

  // ¿Ya forma parte del equipo?
  const existente = await prisma.user.findUnique({
    where: { email },
    include: { businesses: { where: { businessId } } },
  });

  if (existente && existente.businesses.length > 0) {
    const miembro = existente.businesses[0];
    if (miembro.disabledAt === null) {
      res.status(409).json({ error: 'Esa persona ya forma parte del equipo' });
      return;
    }
    // Estaba desactivada: reactivar es más claro que invitarla de nuevo
    await prisma.businessUser.update({
      where: { id: miembro.id },
      data: { disabledAt: null, role: parsed.data.role },
    });
    res.status(200).json({ reactivated: true, message: 'Se ha reactivado el acceso de esta persona' });
    return;
  }

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { name: true, slug: true, email: true },
  });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + DURACION_INVITACION_MS);

  // Una invitación viva por email y local: si ya había una, se sustituye
  const invitacion = await prisma.teamInvitation.upsert({
    where: { businessId_email: { businessId, email } },
    create: { businessId, email, role: parsed.data.role, token, expiresAt, invitedBy: req.userId! },
    update: { role: parsed.data.role, token, expiresAt, invitedBy: req.userId!, acceptedAt: null },
  });

  const invitador = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
  const url = `${process.env.APP_URL ?? 'http://localhost:3000'}/invitacion/${token}`;

  sendTeamInvitationEmail(email, url, business.name, invitador?.name ?? 'El equipo', parsed.data.role, business.email).catch(console.error);

  res.status(201).json({
    id: invitacion.id,
    email: invitacion.email,
    role: invitacion.role,
    expiresAt: invitacion.expiresAt,
  });
});

// ──────────────────────────────────────────────
// DELETE /users/invitations/:id — Revocar invitación pendiente
// ──────────────────────────────────────────────
router.delete('/invitations/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
  const invitacion = await prisma.teamInvitation.findFirst({
    where: { id: req.params.id, businessId: req.businessId! },
  });

  if (!invitacion) {
    res.status(404).json({ error: 'Invitación no encontrada' });
    return;
  }

  await prisma.teamInvitation.delete({ where: { id: invitacion.id } });
  res.status(204).end();
});

// ──────────────────────────────────────────────
// PATCH /users/:id — Cambiar rol o reactivar
// ──────────────────────────────────────────────
router.patch('/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    role: z.enum(['OWNER', 'ADMIN', 'STAFF']).optional(),
    disabled: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const miembro = await prisma.businessUser.findFirst({
    where: { id: req.params.id, businessId: req.businessId! },
  });

  if (!miembro) {
    res.status(404).json({ error: 'Miembro del equipo no encontrado' });
    return;
  }

  // Solo un OWNER puede repartir el rol de OWNER
  if (parsed.data.role === 'OWNER' && req.role !== 'OWNER') {
    res.status(403).json({ error: 'Solo el propietario puede nombrar a otro propietario' });
    return;
  }

  // El local no puede quedarse sin ningún propietario activo
  const dejaDeSerDueno =
    miembro.role === 'OWNER' &&
    ((parsed.data.role !== undefined && parsed.data.role !== 'OWNER') || parsed.data.disabled === true);

  if (dejaDeSerDueno && (await contarDuenosActivos(req.businessId!)) <= 1) {
    res.status(409).json({
      error: 'El local debe tener al menos un propietario activo. Nombra a otro antes de cambiar este.',
    });
    return;
  }

  const actualizado = await prisma.businessUser.update({
    where: { id: miembro.id },
    data: {
      ...(parsed.data.role ? { role: parsed.data.role } : {}),
      ...(parsed.data.disabled === undefined ? {} : { disabledAt: parsed.data.disabled ? new Date() : null }),
    },
    include: { user: { select: { name: true, email: true } } },
  });

  res.json({
    id: actualizado.id,
    name: actualizado.user.name,
    email: actualizado.user.email,
    role: actualizado.role,
    disabledAt: actualizado.disabledAt,
  });
});

// ──────────────────────────────────────────────
// DELETE /users/:id — Revocar el acceso al local
// ──────────────────────────────────────────────
// No borra al User —puede pertenecer a otros locales— sino su pertenencia a este.
router.delete('/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
  const miembro = await prisma.businessUser.findFirst({
    where: { id: req.params.id, businessId: req.businessId! },
  });

  if (!miembro) {
    res.status(404).json({ error: 'Miembro del equipo no encontrado' });
    return;
  }

  if (miembro.userId === req.userId) {
    res.status(409).json({ error: 'No puedes quitarte a ti mismo del local' });
    return;
  }

  if (miembro.role === 'OWNER' && (await contarDuenosActivos(req.businessId!)) <= 1) {
    res.status(409).json({ error: 'El local debe tener al menos un propietario activo' });
    return;
  }

  await prisma.businessUser.delete({ where: { id: miembro.id } });
  res.status(204).end();
});

export default router;
