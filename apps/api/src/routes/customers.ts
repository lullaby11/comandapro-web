import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

// GET /customers?phone=xxx — Buscar cliente por teléfono (flujo rápido)
router.get('/', async (req: AuthenticatedRequest, res) => {
  const { phone, name, page = '1', limit = '20' } = req.query;

  const where = {
    businessId: req.businessId!,
    ...(phone ? { phone: { contains: phone as string } } : {}),
    ...(name ? { name: { contains: name as string, mode: 'insensitive' as const } } : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
    prisma.customer.count({ where }),
  ]);

  res.json({ customers, total });
});

// GET /customers/by-phone/:phone — Búsqueda exacta (para autocompletar en comanda)
router.get('/by-phone/:phone', async (req: AuthenticatedRequest, res) => {
  const customer = await prisma.customer.findUnique({
    where: {
      businessId_phone: {
        businessId: req.businessId!,
        phone: req.params.phone,
      },
    },
  });

  if (!customer) {
    res.status(404).json({ error: 'Cliente no encontrado' });
    return;
  }

  res.json(customer);
});

// POST /customers — Crear cliente
const customerSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(6).max(20),
  email: z.string().email().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/', async (req: AuthenticatedRequest, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { phone } = parsed.data;

  // Verificar que no exista ya en este local
  const existing = await prisma.customer.findUnique({
    where: { businessId_phone: { businessId: req.businessId!, phone } },
  });

  if (existing) {
    res.status(409).json({ error: 'Ya existe un cliente con ese teléfono', customer: existing });
    return;
  }

  const customer = await prisma.customer.create({
    data: { ...parsed.data, businessId: req.businessId! },
  });

  res.status(201).json(customer);
});

// PUT /customers/:id — Actualizar cliente
router.put('/:id', async (req: AuthenticatedRequest, res) => {
  const exists = await prisma.customer.findFirst({
    where: { id: req.params.id, businessId: req.businessId! },
  });
  if (!exists) {
    res.status(404).json({ error: 'Cliente no encontrado' });
    return;
  }

  const schema = customerSchema.partial();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const customer = await prisma.customer.update({
    where: { id: req.params.id },
    data: parsed.data,
  });

  res.json(customer);
});

export default router;
