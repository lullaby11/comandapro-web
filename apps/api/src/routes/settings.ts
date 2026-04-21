import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { authMiddleware, requireAdmin, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

// GET /settings — Configuración del local actual
router.get('/', async (req: AuthenticatedRequest, res) => {
  const business = await prisma.business.findUnique({
    where: { id: req.businessId! },
  });

  if (!business) {
    res.status(404).json({ error: 'Local no encontrado' });
    return;
  }

  res.json(business);
});

// PATCH /settings — Actualizar configuración (solo OWNER/ADMIN)
router.patch('/', requireAdmin, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    name: z.string().min(2).max(100).optional(),
    logoUrl: z.string().url().nullable().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    paperWidth: z.enum(['58', '80']).transform(Number).optional(),
    printerMode: z.enum(['webusb', 'printserver']).optional(),
    printServerUrl: z.string().url().nullable().optional(),
    currency: z.string().length(3).optional(),
    taxRate: z.number().min(0).max(100).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const business = await prisma.business.update({
    where: { id: req.businessId! },
    data: parsed.data,
  });

  res.json(business);
});

export default router;
