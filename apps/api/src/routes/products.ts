import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

// GET /products — Todos los productos del local (con stock)
router.get('/', async (req: AuthenticatedRequest, res) => {
  const { category, active } = req.query;

  const products = await prisma.product.findMany({
    where: {
      businessId: req.businessId!,
      ...(active !== undefined ? { active: active === 'true' } : {}),
      ...(category ? { category: category as string } : {}),
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  res.json(products);
});

// GET /products/:id
router.get('/:id', async (req: AuthenticatedRequest, res) => {
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, businessId: req.businessId! },
  });
  if (!product) {
    res.status(404).json({ error: 'Producto no encontrado' });
    return;
  }
  res.json(product);
});

// POST /products — Crear producto
const productSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  price: z.number().positive(),
  stock: z.number().int().min(0).default(0),
  imageUrl: z.string().url().optional(),
  category: z.string().optional(),
  active: z.boolean().default(true),
});

router.post('/', async (req: AuthenticatedRequest, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const product = await prisma.product.create({
    data: { ...parsed.data, businessId: req.businessId! },
  });

  res.status(201).json(product);
});

// PATCH /products/:id — Actualizar producto (incluyendo stock)
router.patch('/:id', async (req: AuthenticatedRequest, res) => {
  const exists = await prisma.product.findFirst({
    where: { id: req.params.id, businessId: req.businessId! },
  });
  if (!exists) {
    res.status(404).json({ error: 'Producto no encontrado' });
    return;
  }

  const schema = productSchema.partial();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: parsed.data,
  });

  res.json(product);
});

// DELETE /products/:id — Desactivar producto (soft delete)
router.delete('/:id', async (req: AuthenticatedRequest, res) => {
  const exists = await prisma.product.findFirst({
    where: { id: req.params.id, businessId: req.businessId! },
  });
  if (!exists) {
    res.status(404).json({ error: 'Producto no encontrado' });
    return;
  }

  await prisma.product.update({
    where: { id: req.params.id },
    data: { active: false },
  });

  res.status(204).send();
});

export default router;
