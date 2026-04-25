import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { OrderStatus } from '@prisma/client';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validateStock, deductStock, restoreStock } from '../services/stock.service';
import { generateEscPosBuffer, PrintOrderPayload } from '../services/printer.service';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// ──────────────────────────────────────────────
// GET /orders — Listar pedidos del local
// ──────────────────────────────────────────────
router.get('/', async (req: AuthenticatedRequest, res) => {
  const { status, page = '1', limit = '20', notPrinted, date } = req.query;

  let dateFilter = {};
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end   = new Date(`${date}T23:59:59.999Z`);
    dateFilter = { createdAt: { gte: start, lte: end } };
  }

  const where = {
    businessId: req.businessId!,
    ...(status ? { status: status as OrderStatus } : {}),
    ...(notPrinted === 'true' ? { printedAt: null } : {}),
    ...dateFilter,
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { name: true, phone: true } },
        items: {
          include: { product: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
    prisma.order.count({ where }),
  ]);

  res.json({ orders, total, page: Number(page), limit: Number(limit) });
});

// ──────────────────────────────────────────────
// GET /orders/:id — Detalle de un pedido
// ──────────────────────────────────────────────
router.get('/:id', async (req: AuthenticatedRequest, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, businessId: req.businessId! },
    include: {
      customer: true,
      items: { include: { product: true } },
      business: { select: { name: true, logoUrl: true, paperWidth: true, currency: true, address: true, phone: true } },
    },
  });

  if (!order) {
    res.status(404).json({ error: 'Pedido no encontrado' });
    return;
  }

  res.json(order);
});

// ──────────────────────────────────────────────
// POST /orders — Crear pedido (valida stock, descuenta atómicamente)
// ──────────────────────────────────────────────
const createOrderSchema = z.object({
  customerId: z.string().cuid(),
  isPickup: z.boolean().optional(),
  deliveryAddress: z.string().optional(),
  notes: z.string().optional(),
  estimatedDeliveryAt: z.string().datetime().optional(),
  paymentMethod: z.enum(['CASH', 'CARD']).optional().default('CASH'),
  cashGiven: z.number().positive().optional(),
  shippingRateId: z.string().cuid().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().cuid(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1, 'El pedido debe tener al menos un producto'),
});

router.post('/', async (req: AuthenticatedRequest, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { customerId, items, notes, deliveryAddress, estimatedDeliveryAt, isPickup, paymentMethod, cashGiven, shippingRateId } = parsed.data;
  const businessId = req.businessId!;

  // 1. Validar stock antes de la transacción
  const stockValidation = await validateStock(businessId, items);
  if (!stockValidation.valid) {
    res.status(409).json({
      error: 'Stock insuficiente',
      details: stockValidation.errors,
    });
    return;
  }

  // 2. Obtener precios actuales de los productos
  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) }, businessId },
    select: { id: true, name: true, price: true },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));

  // 3. Calcular totales
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { taxRate: true, currency: true },
  });

  // Obtener coste de envío si se indicó una tarifa
  let shippingCost = 0;
  if (shippingRateId) {
    const rate = await prisma.shippingRate.findFirst({
      where: { id: shippingRateId, businessId, active: true },
      select: { price: true },
    });
    if (!rate) {
      res.status(400).json({ error: 'Tarifa de envío no válida' });
      return;
    }
    shippingCost = Number(rate.price);
  }

  const orderItems = items.map((item) => {
    const product = productMap.get(item.productId)!;
    const unitPrice = Number(product.price);
    const subtotal = unitPrice * item.quantity;
    return { productId: item.productId, quantity: item.quantity, unitPrice, subtotal };
  });

  const subtotal = orderItems.reduce((sum, i) => sum + i.subtotal, 0);
  const tax = subtotal * ((business?.taxRate ?? 0) / 100);
  const total = subtotal + tax + shippingCost;

  // 4. Crear pedido + descontar stock en transacción atómica
  const order = await prisma.$transaction(async (tx) => {
    await deductStock(tx, businessId, items);

    return tx.order.create({
      data: {
        businessId,
        customerId,
        isPickup: isPickup ?? false,
        deliveryAddress,
        notes,
        estimatedDeliveryAt: estimatedDeliveryAt ? new Date(estimatedDeliveryAt) : undefined,
        paymentMethod: paymentMethod ?? 'CASH',
        cashGiven: cashGiven ?? undefined,
        shippingRateId: shippingRateId ?? undefined,
        shippingCost,
        subtotal,
        tax,
        total,
        items: {
          create: orderItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            subtotal: i.subtotal,
          })),
        },
      },
      include: {
        customer: true,
        items: { include: { product: true } },
        business: true,
        shippingRate: true,
      },
    });
  });

  res.status(201).json(order);
});

// ──────────────────────────────────────────────
// PATCH /orders/:id/status — Actualizar estado
// ──────────────────────────────────────────────
router.patch('/:id/status', async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ status: z.enum(['PENDING', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const order = await prisma.order.findFirst({
    where: { id: req.params.id, businessId: req.businessId! },
  });

  if (!order) {
    res.status(404).json({ error: 'Pedido no encontrado' });
    return;
  }

  const updated = await prisma.order.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status },
  });

  res.json(updated);
});

// ──────────────────────────────────────────────
// DELETE /orders/:id — Eliminar pedido y restaurar stock
// ──────────────────────────────────────────────
router.delete('/:id', async (req: AuthenticatedRequest, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, businessId: req.businessId! },
    include: { items: { select: { productId: true, quantity: true } } },
  });

  if (!order) {
    res.status(404).json({ error: 'Pedido no encontrado' });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await restoreStock(tx, order.items);
    await tx.order.delete({ where: { id: order.id } });
  });

  res.status(204).end();
});

// ──────────────────────────────────────────────
// POST /orders/:id/print — Genera buffer ESC/POS
// ──────────────────────────────────────────────
router.post('/:id/print', async (req: AuthenticatedRequest, res) => {
  try {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, businessId: req.businessId! },
    include: {
      customer: true,
      items: { include: { product: true } },
      business: true,
      shippingRate: true,
    },
  });

  if (!order) {
    res.status(404).json({ error: 'Pedido no encontrado' });
    return;
  }

  const trackingUrl = `${process.env.APP_URL}/tracking/${order.trackingToken}`;

  const payload: PrintOrderPayload = {
    business: {
      name: order.business.name,
      address: order.business.address ?? undefined,
      phone: order.business.phone ?? undefined,
      logoUrl: order.business.logoUrl ?? undefined,
      paperWidth: order.business.paperWidth as 58 | 80,
      currency: order.business.currency,
    },
    customer: {
      name: order.customer.name,
      phone: order.customer.phone,
      address: order.customer.address ?? undefined,
    },
    order: {
      id: order.id,
      trackingToken: order.trackingToken,
      notes: order.notes ?? undefined,
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        productName: item.product.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
      })),
      subtotal: Number(order.subtotal),
      tax: Number(order.tax),
      shippingCost: Number(order.shippingCost),
      shippingRateName: order.shippingRate?.name ?? undefined,
      total: Number(order.total),
      paymentMethod: order.paymentMethod,
      cashGiven: order.cashGiven ? Number(order.cashGiven) : undefined,
    },
    trackingUrl,
  };

  const buffer = await generateEscPosBuffer(payload);

  // Marcar como impreso
  await prisma.order.update({
    where: { id: order.id },
    data: { printedAt: new Date() },
  });

  // Devolver buffer binario ESC/POS
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="comanda-${order.id}.bin"`);
  res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[print] Error generando ticket:', (err as Error).message, (err as Error).stack);
    res.status(500).json({ error: 'Error generando ticket de impresión' });
  }
});

export default router;
