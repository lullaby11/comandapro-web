import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma/client';
import {
  platformAuthMiddleware,
  firmarTokenDePlataforma,
  registrarAuditoria,
  PlatformRequest,
} from '../middleware/platform-auth.middleware';
import { loginRateLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// ──────────────────────────────────────────────
// POST /platform/auth/login — Entrar en la plataforma
// ──────────────────────────────────────────────
// Sin `businessSlug`, a diferencia del login del panel: un administrador de plataforma no
// pertenece a ningún local.
router.post('/auth/login', loginRateLimiter, async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Email y contraseña requeridos' });
    return;
  }

  const usuario = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase().trim() },
    include: { platformAdmin: true },
  });

  // Mismo mensaje tanto si el usuario no existe, como si la contraseña falla, como si no
  // es administrador de plataforma: no se revela quién lo es.
  const credencialesMal =
    !usuario || !(await bcrypt.compare(parsed.data.password, usuario.passwordHash)) || !usuario.platformAdmin;

  if (credencialesMal) {
    res.status(401).json({ error: 'Credenciales incorrectas' });
    return;
  }

  await registrarAuditoria(usuario!.email, 'login');

  res.json({
    token: firmarTokenDePlataforma(usuario!.platformAdmin!.id),
    admin: { name: usuario!.name, email: usuario!.email },
  });
});

// A partir de aquí, todo exige ser administrador de plataforma
router.use(platformAuthMiddleware);

// ──────────────────────────────────────────────
// GET /platform/metrics — Estado de la plataforma
// ──────────────────────────────────────────────
router.get('/metrics', async (_req: PlatformRequest, res) => {
  const hace30dias = new Date(Date.now() - 30 * 24 * 3600_000);
  const hace7dias = new Date(Date.now() - 7 * 24 * 3600_000);

  const [locales, suspendidos, conTiendaOnline, pedidos30, pedidos7, altas30, servicioAbierto] =
    await Promise.all([
      prisma.business.count(),
      prisma.business.count({ where: { suspendedAt: { not: null } } }),
      prisma.business.count({ where: { onlineOrderEnabled: true } }),
      prisma.order.count({ where: { deletedAt: null, createdAt: { gte: hace30dias } } }),
      prisma.order.count({ where: { deletedAt: null, createdAt: { gte: hace7dias } } }),
      prisma.business.count({ where: { createdAt: { gte: hace30dias } } }),
      prisma.service.count({ where: { endedAt: null } }),
    ]);

  // "Activo" = ha hecho algún pedido en los últimos 30 días. Un local dado de alta que
  // nunca ha pedido no cuenta: contarlo daría una cifra de uso que no es real.
  const activos = await prisma.order.findMany({
    where: { deletedAt: null, createdAt: { gte: hace30dias } },
    select: { businessId: true },
    distinct: ['businessId'],
  });

  res.json({
    locales: {
      total: locales,
      activos30d: activos.length,
      suspendidos,
      conTiendaOnline,
      altasUltimos30d: altas30,
      conServicioAbiertoAhora: servicioAbierto,
    },
    pedidos: { ultimos30d: pedidos30, ultimos7d: pedidos7 },
  });
});

// ──────────────────────────────────────────────
// GET /platform/businesses — Todos los locales
// ──────────────────────────────────────────────
router.get('/businesses', async (req: PlatformRequest, res) => {
  const { q } = req.query;
  const hace30dias = new Date(Date.now() - 30 * 24 * 3600_000);

  const locales = await prisma.business.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q as string, mode: 'insensitive' } },
            { slug: { contains: q as string, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const ids = locales.map((l) => l.id);

  const [pedidosPorLocal, usuariosPorLocal, ultimoPedido] = await Promise.all([
    prisma.order.groupBy({
      by: ['businessId'],
      where: { businessId: { in: ids }, deletedAt: null, createdAt: { gte: hace30dias } },
      _count: { id: true },
    }),
    prisma.businessUser.groupBy({
      by: ['businessId'],
      where: { businessId: { in: ids }, disabledAt: null },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ['businessId'],
      where: { businessId: { in: ids }, deletedAt: null },
      _max: { createdAt: true },
    }),
  ]);

  const pedidos = new Map(pedidosPorLocal.map((p) => [p.businessId, p._count.id]));
  const usuarios = new Map(usuariosPorLocal.map((u) => [u.businessId, u._count.id]));
  const ultimo = new Map(ultimoPedido.map((u) => [u.businessId, u._max.createdAt]));

  res.json({
    businesses: locales.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      email: l.email,
      phone: l.phone,
      onlineOrderEnabled: l.onlineOrderEnabled,
      suspendedAt: l.suspendedAt,
      suspendedReason: l.suspendedReason,
      createdAt: l.createdAt,
      pedidos30d: pedidos.get(l.id) ?? 0,
      usuarios: usuarios.get(l.id) ?? 0,
      ultimoPedido: ultimo.get(l.id) ?? null,
    })),
  });
});

// ──────────────────────────────────────────────
// POST /platform/businesses/:id/suspend — Suspender un local
// ──────────────────────────────────────────────
router.post('/businesses/:id/suspend', async (req: PlatformRequest, res) => {
  const schema = z.object({ reason: z.string().min(3).max(300) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Hace falta indicar el motivo de la suspensión' });
    return;
  }

  const local = await prisma.business.findUnique({ where: { id: req.params.id } });
  if (!local) {
    res.status(404).json({ error: 'Local no encontrado' });
    return;
  }
  if (local.suspendedAt) {
    res.status(409).json({ error: 'Este local ya está suspendido' });
    return;
  }

  const actualizado = await prisma.business.update({
    where: { id: local.id },
    data: { suspendedAt: new Date(), suspendedReason: parsed.data.reason },
  });

  await registrarAuditoria(req.adminEmail!, 'suspender_local', {
    businessId: local.id,
    businessName: local.name,
    detail: parsed.data.reason,
  });

  res.json({
    suspended: true,
    suspendedAt: actualizado.suspendedAt,
    message: `${local.name} queda suspendido: su equipo no podrá operar y su tienda online queda cerrada.`,
  });
});

// ──────────────────────────────────────────────
// POST /platform/businesses/:id/reactivate — Reactivar
// ──────────────────────────────────────────────
router.post('/businesses/:id/reactivate', async (req: PlatformRequest, res) => {
  const local = await prisma.business.findUnique({ where: { id: req.params.id } });
  if (!local) {
    res.status(404).json({ error: 'Local no encontrado' });
    return;
  }
  if (!local.suspendedAt) {
    res.status(409).json({ error: 'Este local no está suspendido' });
    return;
  }

  await prisma.business.update({
    where: { id: local.id },
    data: { suspendedAt: null, suspendedReason: null },
  });

  await registrarAuditoria(req.adminEmail!, 'reactivar_local', {
    businessId: local.id,
    businessName: local.name,
  });

  res.json({ suspended: false, message: `${local.name} vuelve a estar operativo.` });
});

// ──────────────────────────────────────────────
// GET /platform/audit — Registro de auditoría
// ──────────────────────────────────────────────
router.get('/audit', async (req: PlatformRequest, res) => {
  const registros = await prisma.platformAuditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(req.query.limit ?? 100), 500),
  });
  res.json({ entries: registros });
});

export default router;
