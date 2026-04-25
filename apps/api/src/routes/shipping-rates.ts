import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { authMiddleware, requireAdmin, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

// GET /shipping-rates — Listar tarifas del local
router.get('/', async (req: AuthenticatedRequest, res) => {
  const rates = await prisma.shippingRate.findMany({
    where: { businessId: req.businessId! },
    orderBy: { createdAt: 'asc' },
  });
  res.json(rates);
});

const rateSchema = z.object({
  name:  z.string().min(1).max(100),
  price: z.number().min(0),
});

// POST /shipping-rates — Crear tarifa (solo ADMIN/OWNER)
router.post('/', requireAdmin, async (req: AuthenticatedRequest, res) => {
  const parsed = rateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const rate = await prisma.shippingRate.create({
    data: {
      businessId: req.businessId!,
      name:       parsed.data.name,
      price:      parsed.data.price,
    },
  });

  res.status(201).json(rate);
});

// PATCH /shipping-rates/:id — Editar tarifa (solo ADMIN/OWNER)
router.patch('/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    name:   z.string().min(1).max(100).optional(),
    price:  z.number().min(0).optional(),
    active: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.shippingRate.findFirst({
    where: { id: req.params.id, businessId: req.businessId! },
  });
  if (!existing) {
    res.status(404).json({ error: 'Tarifa no encontrada' });
    return;
  }

  const rate = await prisma.shippingRate.update({
    where: { id: req.params.id },
    data:  parsed.data,
  });

  res.json(rate);
});

// DELETE /shipping-rates/:id — Eliminar tarifa (solo ADMIN/OWNER)
router.delete('/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
  const existing = await prisma.shippingRate.findFirst({
    where: { id: req.params.id, businessId: req.businessId! },
  });
  if (!existing) {
    res.status(404).json({ error: 'Tarifa no encontrada' });
    return;
  }

  await prisma.shippingRate.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
