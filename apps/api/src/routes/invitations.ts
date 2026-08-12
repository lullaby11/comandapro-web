import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma/client';
import { invitationRateLimiter } from '../middleware/rate-limit.middleware';

/**
 * Aceptación de invitaciones al equipo. Es público porque quien acepta todavía no tiene
 * cuenta ni sesión: lo que autoriza es el token del enlace.
 */
const router = Router();

/** Busca una invitación utilizable: existe, no caducada y no aceptada. */
async function invitacionVigente(token: string) {
  return prisma.teamInvitation.findFirst({
    where: { token, acceptedAt: null, expiresAt: { gt: new Date() } },
    include: { business: { select: { id: true, name: true, slug: true } } },
  });
}

// ──────────────────────────────────────────────
// GET /invitations/:token — Datos para pintar la pantalla de aceptación
// ──────────────────────────────────────────────
router.get('/:token', async (req, res) => {
  const invitacion = await invitacionVigente(req.params.token);

  if (!invitacion) {
    res.status(404).json({ error: 'Esta invitación no existe, ya se usó o ha caducado' });
    return;
  }

  const usuarioExistente = await prisma.user.findUnique({
    where: { email: invitacion.email },
    select: { id: true, name: true },
  });

  res.json({
    email: invitacion.email,
    role: invitacion.role,
    business: { name: invitacion.business.name, slug: invitacion.business.slug },
    // Si ya tiene cuenta en la plataforma solo hay que confirmar, no crear contraseña
    hasAccount: usuarioExistente !== null,
    name: usuarioExistente?.name ?? null,
  });
});

// ──────────────────────────────────────────────
// POST /invitations/:token/accept — Aceptar y entrar
// ──────────────────────────────────────────────
router.post('/:token/accept', invitationRateLimiter, async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).max(100).optional(),
    password: z.string().min(8).optional(),
  });

  // Se comprueba la invitación ANTES que el formulario: a quien llega con un enlace
  // caducado hay que decirle eso, no que su contraseña es corta.
  const invitacion = await invitacionVigente(req.params.token);
  if (!invitacion) {
    res.status(404).json({ error: 'Esta invitación no existe, ya se usó o ha caducado' });
    return;
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existente = await prisma.user.findUnique({ where: { email: invitacion.email } });

  // Quien no tiene cuenta debe crearla aquí; quien ya la tiene entra con su contraseña
  if (!existente && (!parsed.data.name || !parsed.data.password)) {
    res.status(400).json({ error: 'Necesitas indicar tu nombre y una contraseña de al menos 8 caracteres' });
    return;
  }

  const { businessUser, user } = await prisma.$transaction(async (tx) => {
    const user = existente
      ? existente
      : await tx.user.create({
          data: {
            email: invitacion.email,
            name: parsed.data.name!,
            passwordHash: await bcrypt.hash(parsed.data.password!, 12),
          },
        });

    // upsert y no create: si ya existía una pertenencia desactivada, se reactiva
    const businessUser = await tx.businessUser.upsert({
      where: { userId_businessId: { userId: user.id, businessId: invitacion.businessId } },
      create: { userId: user.id, businessId: invitacion.businessId, role: invitacion.role },
      update: { role: invitacion.role, disabledAt: null },
    });

    await tx.teamInvitation.update({
      where: { id: invitacion.id },
      data: { acceptedAt: new Date() },
    });

    return { businessUser, user };
  });

  const token = jwt.sign(
    { userId: user.id, businessId: invitacion.businessId, role: businessUser.role },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );

  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: businessUser.role },
    business: {
      id: invitacion.business.id,
      name: invitacion.business.name,
      slug: invitacion.business.slug,
    },
  });
});

export default router;
