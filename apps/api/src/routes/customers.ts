import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { authMiddleware, requireAdmin, AuthenticatedRequest } from '../middleware/auth.middleware';
import { anonimizarCliente } from '../services/rgpd.service';

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

// GET /customers/pending-online — Cuentas online pendientes de verificar email
router.get('/pending-online', async (req: AuthenticatedRequest, res) => {
  const accounts = await prisma.customerAccount.findMany({
    where: { businessId: req.businessId!, emailVerified: false },
    select: { id: true, name: true, phone: true, email: true, address: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(accounts);
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

// ──────────────────────────────────────────────
// DELETE /customers/:id — Ejercer el derecho de supresión
// ──────────────────────────────────────────────
// No borra la ficha: sus pedidos deben conservarse por obligación contable, y la base de
// datos tampoco lo permitiría. Vacía el dato personal en los tres sitios donde vive —la
// ficha, la cuenta de la tienda online y los propios pedidos— y regenera los tokens de
// seguimiento, que son enlaces públicos con nombre y dirección.
router.delete('/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
  const existe = await prisma.customer.findFirst({
    where: { id: req.params.id, businessId: req.businessId! },
  });

  if (!existe) {
    res.status(404).json({ error: 'Cliente no encontrado' });
    return;
  }

  if (existe.anonymizedAt) {
    res.status(409).json({ error: 'Los datos de este cliente ya se eliminaron' });
    return;
  }

  const resultado = await prisma.$transaction((tx) =>
    anonimizarCliente(tx, req.businessId!, existe.id)
  );

  res.json({
    anonymized: true,
    ...resultado,
    message:
      `Se han eliminado los datos personales. Sus ${resultado.pedidosAfectados} pedido(s) ` +
      'se conservan sin datos identificativos, por obligación contable.',
  });
});

export default router;
