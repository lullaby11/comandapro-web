import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { OrderStatus } from '@prisma/client';
import { authMiddleware, requireAdmin, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validateStock, deductStock, restoreStock } from '../services/stock.service';
import { generateEscPosBuffer, PrintOrderPayload } from '../services/printer.service';
import { calcularImportes, aCentimos, aEuros } from '../services/money.service';
import { sendOrderConfirmedEmail } from '../services/email.service';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// ──────────────────────────────────────────────
// GET /orders — Listar pedidos del servicio activo
// ──────────────────────────────────────────────
router.get('/', async (req: AuthenticatedRequest, res) => {
  const { status, page = '1', limit = '20', notPrinted } = req.query;

  // Filtrar solo por el servicio activo
  const activeService = await prisma.service.findFirst({
    where: { businessId: req.businessId!, endedAt: null },
    select: { id: true },
  });

  const where = {
    businessId: req.businessId!,
    deletedAt: null,
    serviceId: activeService?.id ?? '__no_service__',
    ...(status ? { status: status as OrderStatus } : {}),
    ...(notPrinted === 'true' ? { printedAt: null } : {}),
  };

  // Los pedidos RECEIVED_ONLINE también se muestran aunque no coincidan el serviceId
  // (pueden llegar online mientras el servicio cambia). Los incluimos siempre.
  const whereWithOnline = activeService
    ? {
        OR: [
          where,
          {
            businessId: req.businessId!,
            deletedAt:  null,
            status:     'RECEIVED_ONLINE' as OrderStatus,
            ...(status && status !== 'RECEIVED_ONLINE' ? { id: '__never__' } : {}),
          },
        ],
      }
    : where;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: whereWithOnline,
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
    prisma.order.count({ where: whereWithOnline }),
  ]);

  res.json({ orders, total, page: Number(page), limit: Number(limit) });
});

// ──────────────────────────────────────────────
// GET /orders/:id — Detalle de un pedido
// ──────────────────────────────────────────────
router.get('/:id', async (req: AuthenticatedRequest, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, businessId: req.businessId!, deletedAt: null },
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

  // 0. Verificar que hay un servicio activo
  const activeService = await prisma.service.findFirst({
    where: { businessId, endedAt: null },
    select: { id: true },
  });

  if (!activeService) {
    res.status(409).json({ error: 'No hay ningún servicio activo. Inicia un servicio antes de crear pedidos.' });
    return;
  }

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

  // Todo el cálculo va en céntimos enteros: con coma flotante el total guardado podía
  // diferir un céntimo de la suma de sus componentes. Ver money.service.ts.
  const importes = calcularImportes({
    lineas: items.map((item) => ({
      unitPriceCents: aCentimos(Number(productMap.get(item.productId)!.price)),
      quantity: item.quantity,
    })),
    taxRate: business?.taxRate ?? 0,
    shippingCents: aCentimos(shippingCost),
  });

  const orderItems = items.map((item, i) => ({
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: aEuros(importes.lineas[i].unitPriceCents),
    subtotal: aEuros(importes.lineas[i].subtotalCents),
  }));

  const subtotal = aEuros(importes.subtotalCents);
  const tax = aEuros(importes.taxCents);
  const total = aEuros(importes.totalCents);

  // 4. Crear pedido + descontar stock en transacción atómica
  const order = await prisma.$transaction(async (tx) => {
    await deductStock(tx, businessId, items);

    return tx.order.create({
      data: {
        businessId,
        customerId,
        serviceId: activeService.id,
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
// Transiciones de estado permitidas
// ──────────────────────────────────────────────
// Antes se aceptaba cualquier valor del enum, así que un error de la interfaz o una
// petición manual podía llevar un pedido de PENDING a DELIVERED sin pasar por cocina, o
// resucitar uno cancelado —lo que además descuadraría el stock ya devuelto—.

const TRANSICIONES: Record<OrderStatus, OrderStatus[]> = {
  RECEIVED_ONLINE:  ['PENDING', 'CANCELLED'],
  PENDING:          ['PREPARING', 'CANCELLED'],
  PREPARING:        ['READY', 'CANCELLED'],
  READY:            ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  // Estados finales: de aquí no se sale. Un pedido cancelado ya devolvió su stock.
  DELIVERED:        [],
  CANCELLED:        [],
};

const ETIQUETAS_ESTADO: Record<OrderStatus, string> = {
  RECEIVED_ONLINE:  'Recibido online',
  PENDING:          'Pendiente',
  PREPARING:        'En preparación',
  READY:            'Listo',
  OUT_FOR_DELIVERY: 'En reparto',
  DELIVERED:        'Entregado',
  CANCELLED:        'Cancelado',
};

function esTransicionValida(desde: OrderStatus, hasta: OrderStatus, isPickup: boolean): boolean {
  // Repetir el estado actual es inofensivo y evita que un doble clic dé error
  if (desde === hasta) return true;
  // Un pedido de recogida nunca sale a reparto
  if (hasta === 'OUT_FOR_DELIVERY' && isPickup) return false;
  return TRANSICIONES[desde].includes(hasta);
}

// ──────────────────────────────────────────────
// PATCH /orders/:id/status — Actualizar estado
// ──────────────────────────────────────────────
router.patch('/:id/status', async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    status: z.enum(['RECEIVED_ONLINE', 'PENDING', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const order = await prisma.order.findFirst({
    where: { id: req.params.id, businessId: req.businessId!, deletedAt: null },
    include: {
      business:        { select: { name: true } },
      customerAccount: { select: { email: true, name: true } },
      items:           { select: { productId: true, quantity: true } },
    },
  });

  if (!order) {
    res.status(404).json({ error: 'Pedido no encontrado' });
    return;
  }

  const nuevoEstado = parsed.data.status;

  if (!esTransicionValida(order.status, nuevoEstado, order.isPickup)) {
    res.status(409).json({
      error: `No se puede pasar de "${ETIQUETAS_ESTADO[order.status]}" a "${ETIQUETAS_ESTADO[nuevoEstado]}"`,
      from: order.status,
      to: nuevoEstado,
      allowed: TRANSICIONES[order.status],
    });
    return;
  }

  // Cancelar devuelve el stock al inventario. `stockRestoredAt` evita devolverlo dos
  // veces si después se borra el pedido, o si llegan dos cancelaciones seguidas.
  const debeRestaurarStock = nuevoEstado === 'CANCELLED' && order.stockRestoredAt === null;

  const updated = await prisma.$transaction(async (tx) => {
    if (debeRestaurarStock) {
      await restoreStock(tx, order.items);
    }
    return tx.order.update({
      where: { id: order.id },
      data: {
        status: nuevoEstado,
        ...(debeRestaurarStock ? { stockRestoredAt: new Date() } : {}),
      },
    });
  });

  // Cuando el comercio acepta un pedido online, notificar al cliente por email
  if (order.status === 'RECEIVED_ONLINE' && parsed.data.status === 'PENDING' && order.customerAccount?.email) {
    const trackingUrl = `${process.env.APP_URL?.replace(':4000', ':3000').replace('/api', '') ?? 'http://localhost:3000'}/tracking/${order.trackingToken}`;
    sendOrderConfirmedEmail(
      order.customerAccount.email,
      order.customerAccount.name,
      order.id.slice(-8).toUpperCase(),
      order.business.name,
      trackingUrl,
    ).catch(console.error);
  }

  res.json(updated);
});

// ──────────────────────────────────────────────
// DELETE /orders/:id — Borrado lógico, restaurando stock
// ──────────────────────────────────────────────
// Antes borraba físicamente el pedido: se perdía el histórico contable, las estadísticas
// cambiaban de forma retroactiva y no quedaba rastro de quién lo había hecho. Ahora se
// marca, y se exige rol de administración porque altera lo facturado del servicio.
router.delete('/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, businessId: req.businessId!, deletedAt: null },
    include: { items: { select: { productId: true, quantity: true } } },
  });

  if (!order) {
    res.status(404).json({ error: 'Pedido no encontrado' });
    return;
  }

  const ahora = new Date();

  await prisma.$transaction(async (tx) => {
    // Si el pedido ya se canceló, su stock volvió al inventario en ese momento:
    // devolverlo otra vez inflaría las existencias.
    if (order.stockRestoredAt === null) {
      await restoreStock(tx, order.items);
    }
    await tx.order.update({
      where: { id: order.id },
      data: {
        deletedAt: ahora,
        deletedBy: req.userId!,
        ...(order.stockRestoredAt === null ? { stockRestoredAt: ahora } : {}),
      },
    });
  });

  res.status(204).end();
});

// ──────────────────────────────────────────────
// POST /orders/:id/print — Genera buffer ESC/POS
// ──────────────────────────────────────────────
router.post('/:id/print', async (req: AuthenticatedRequest, res) => {
  try {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, businessId: req.businessId!, deletedAt: null },
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
      estimatedDeliveryAt: order.estimatedDeliveryAt ?? undefined,
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
