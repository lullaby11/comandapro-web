import { Router } from 'express';
import { prisma } from '../prisma/client';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

// ──────────────────────────────────────────────
// GET /services/active — Servicio activo del local
// ──────────────────────────────────────────────
router.get('/active', async (req: AuthenticatedRequest, res) => {
  const service = await prisma.service.findFirst({
    where: { businessId: req.businessId!, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });

  res.json({ service: service ?? null });
});

// ──────────────────────────────────────────────
// POST /services/start — Iniciar nuevo servicio
// ──────────────────────────────────────────────
router.post('/start', async (req: AuthenticatedRequest, res) => {
  const existing = await prisma.service.findFirst({
    where: { businessId: req.businessId!, endedAt: null },
  });

  if (existing) {
    res.status(409).json({ error: 'Ya hay un servicio activo. Finalízalo antes de iniciar uno nuevo.' });
    return;
  }

  const service = await prisma.service.create({
    data: { businessId: req.businessId! },
  });

  res.status(201).json({ service });
});

// ──────────────────────────────────────────────
// POST /services/end — Finalizar servicio activo
// ──────────────────────────────────────────────
router.post('/end', async (req: AuthenticatedRequest, res) => {
  const service = await prisma.service.findFirst({
    where: { businessId: req.businessId!, endedAt: null },
  });

  if (!service) {
    res.status(404).json({ error: 'No hay ningún servicio activo.' });
    return;
  }

  const now = new Date();

  // Marcar todos los pedidos del servicio como entregados (excepto cancelados)
  await prisma.$transaction([
    prisma.order.updateMany({
      where: {
        serviceId: service.id,
        status: { notIn: ['DELIVERED', 'CANCELLED'] },
      },
      data: { status: 'DELIVERED' },
    }),
    prisma.service.update({
      where: { id: service.id },
      data: { endedAt: now },
    }),
  ]);

  const updated = await prisma.service.findUnique({ where: { id: service.id } });
  res.json({ service: updated });
});

export default router;
