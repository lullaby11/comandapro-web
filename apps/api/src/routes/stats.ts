import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

// ──────────────────────────────────────────────
// GET /stats/services — Lista de servicios con resumen
// ──────────────────────────────────────────────
router.get('/services', async (req: AuthenticatedRequest, res) => {
  const businessId = req.businessId!;

  const services = await prisma.service.findMany({
    where: { businessId },
    orderBy: { startedAt: 'desc' },
  });

  const serviceIds = services.map((s) => s.id);

  const [counts, revenues] = await Promise.all([
    prisma.order.groupBy({
      by: ['serviceId'],
      where: { businessId, serviceId: { in: serviceIds }, status: { notIn: ['CANCELLED'] } },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ['serviceId'],
      where: { businessId, serviceId: { in: serviceIds }, status: { notIn: ['CANCELLED'] } },
      _sum: { total: true },
    }),
  ]);

  const countMap = new Map(counts.map((x) => [x.serviceId, x._count.id]));
  const revMap = new Map(revenues.map((x) => [x.serviceId, Number(x._sum.total ?? 0)]));

  res.json({
    services: services.map((s) => ({
      ...s,
      orderCount: countMap.get(s.id) ?? 0,
      totalRevenue: revMap.get(s.id) ?? 0,
    })),
  });
});

// ──────────────────────────────────────────────
// GET /stats/service/:id — Detalle de un servicio
// ──────────────────────────────────────────────
router.get('/service/:id', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const businessId = req.businessId!;

  const service = await prisma.service.findFirst({ where: { id, businessId } });
  if (!service) { res.status(404).json({ error: 'Servicio no encontrado' }); return; }

  const [aggregate, deliveries, pickups, topItems] = await Promise.all([
    prisma.order.aggregate({
      where: { serviceId: id, businessId, status: { notIn: ['CANCELLED'] } },
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.order.count({
      where: { serviceId: id, businessId, isPickup: false, status: { notIn: ['CANCELLED'] } },
    }),
    prisma.order.count({
      where: { serviceId: id, businessId, isPickup: true, status: { notIn: ['CANCELLED'] } },
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: { serviceId: id, businessId, status: { notIn: ['CANCELLED'] } } },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: 15,
    }),
  ]);

  const productIds = topItems.map((p) => p.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p.name]));

  res.json({
    service,
    summary: {
      totalRevenue: Number(aggregate._sum.total ?? 0),
      totalOrders: aggregate._count.id,
      deliveries,
      pickups,
    },
    topProducts: topItems.map((p) => ({
      productId: p.productId,
      name: productMap.get(p.productId) ?? 'Producto eliminado',
      totalQty: p._sum.quantity ?? 0,
      totalRevenue: Number(p._sum.subtotal ?? 0),
    })),
  });
});

// ──────────────────────────────────────────────
// GET /stats/customer/:id — Estadísticas de un cliente
// ──────────────────────────────────────────────
router.get('/customer/:id', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const businessId = req.businessId!;

  const customer = await prisma.customer.findFirst({ where: { id, businessId } });
  if (!customer) { res.status(404).json({ error: 'Cliente no encontrado' }); return; }

  const [aggregate, orders] = await Promise.all([
    prisma.order.aggregate({
      where: { customerId: id, businessId, status: { notIn: ['CANCELLED'] } },
      _sum: { total: true },
      _count: { id: true },
      _avg: { total: true },
    }),
    prisma.order.findMany({
      where: { customerId: id, businessId, status: { notIn: ['CANCELLED'] } },
      include: {
        items: { include: { product: { select: { name: true } } } },
        service: { select: { startedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  res.json({
    customer,
    summary: {
      totalOrders: aggregate._count.id,
      totalSpent: Number(aggregate._sum.total ?? 0),
      avgTicket: Number(aggregate._avg.total ?? 0),
    },
    ordersByPrice: [...orders].sort((a, b) => Number(b.total) - Number(a.total)),
    ordersByDate: orders,
  });
});

// ──────────────────────────────────────────────
// GET /stats/product/:id — Estadísticas de un producto
// ──────────────────────────────────────────────
router.get('/product/:id', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const businessId = req.businessId!;

  const product = await prisma.product.findFirst({
    where: { id, businessId },
    select: { id: true, name: true, price: true, category: true },
  });
  if (!product) { res.status(404).json({ error: 'Producto no encontrado' }); return; }

  const [aggregate, itemsByOrder] = await Promise.all([
    prisma.orderItem.aggregate({
      where: { productId: id, order: { businessId, status: { notIn: ['CANCELLED'] } } },
      _sum: { quantity: true, subtotal: true },
    }),
    prisma.orderItem.groupBy({
      by: ['orderId'],
      where: { productId: id, order: { businessId, status: { notIn: ['CANCELLED'] } } },
      _sum: { quantity: true, subtotal: true },
    }),
  ]);

  // Aggregate by customer
  const orderIds = itemsByOrder.map((x) => x.orderId);
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, customerId: true, customer: { select: { id: true, name: true, phone: true } } },
  });

  const customerStats = new Map<string, { name: string; phone: string; totalQty: number; totalSpent: number }>();
  for (const row of itemsByOrder) {
    const order = orders.find((o) => o.id === row.orderId);
    if (!order) continue;
    const prev = customerStats.get(order.customerId) ?? {
      name: order.customer.name, phone: order.customer.phone, totalQty: 0, totalSpent: 0,
    };
    prev.totalQty += row._sum.quantity ?? 0;
    prev.totalSpent += Number(row._sum.subtotal ?? 0);
    customerStats.set(order.customerId, prev);
  }

  res.json({
    product,
    summary: {
      totalSold: aggregate._sum.quantity ?? 0,
      totalRevenue: Number(aggregate._sum.subtotal ?? 0),
    },
    topCustomers: Array.from(customerStats.entries())
      .map(([customerId, data]) => ({ customerId, ...data }))
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 15),
  });
});

// ──────────────────────────────────────────────
// GET /stats/categories — Estadísticas por categoría
// ──────────────────────────────────────────────
router.get('/categories', async (req: AuthenticatedRequest, res) => {
  const businessId = req.businessId!;

  const items = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: { order: { businessId, status: { notIn: ['CANCELLED'] } } },
    _sum: { quantity: true, subtotal: true },
  });

  const productIds = items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, category: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const catMap = new Map<string, { totalSold: number; totalRevenue: number; products: Array<{ name: string; totalQty: number; totalRevenue: number }> }>();
  for (const item of items) {
    const prod = productMap.get(item.productId);
    const cat = prod?.category ?? 'Sin categoría';
    const prev = catMap.get(cat) ?? { totalSold: 0, totalRevenue: 0, products: [] };
    prev.totalSold += item._sum.quantity ?? 0;
    prev.totalRevenue += Number(item._sum.subtotal ?? 0);
    prev.products.push({
      name: prod?.name ?? 'Producto eliminado',
      totalQty: item._sum.quantity ?? 0,
      totalRevenue: Number(item._sum.subtotal ?? 0),
    });
    catMap.set(cat, prev);
  }

  res.json({
    categories: Array.from(catMap.entries())
      .map(([category, data]) => ({
        category,
        totalSold: data.totalSold,
        totalRevenue: data.totalRevenue,
        topProducts: data.products.sort((a, b) => b.totalQty - a.totalQty).slice(0, 10),
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue),
  });
});

// ──────────────────────────────────────────────
// GET /stats/period — Estadísticas por período
// ──────────────────────────────────────────────
router.get('/period', async (req: AuthenticatedRequest, res) => {
  const businessId = req.businessId!;
  const { groupBy = 'day', from, to } = req.query;

  if (!['day', 'week', 'month'].includes(groupBy as string)) {
    res.status(400).json({ error: 'groupBy debe ser day, week o month' });
    return;
  }

  const toDate   = to   ? new Date(`${to}T23:59:59.999Z`)   : new Date();
  const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Prisma.raw is safe here because groupBy is validated against a fixed allowlist above
  const truncFn = Prisma.raw(`'${groupBy as string}'`);

  type PeriodRow = { period: Date; revenue: number; orders: bigint; deliveries: bigint; pickups: bigint };

  const rows = await prisma.$queryRaw<PeriodRow[]>`
    SELECT
      DATE_TRUNC(${truncFn}, "createdAt")          AS period,
      COALESCE(SUM(total), 0)::float               AS revenue,
      COUNT(*)::bigint                             AS orders,
      COUNT(CASE WHEN "isPickup" = false THEN 1 END)::bigint AS deliveries,
      COUNT(CASE WHEN "isPickup" = true  THEN 1 END)::bigint AS pickups
    FROM orders
    WHERE "businessId" = ${businessId}
      AND status::text != 'CANCELLED'
      AND "createdAt" >= ${fromDate}
      AND "createdAt" <= ${toDate}
    GROUP BY DATE_TRUNC(${truncFn}, "createdAt")
    ORDER BY period
  `;

  const topItems = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: {
      order: { businessId, status: { notIn: ['CANCELLED'] }, createdAt: { gte: fromDate, lte: toDate } },
    },
    _sum: { quantity: true, subtotal: true },
    orderBy: { _sum: { subtotal: 'desc' } },
    take: 10,
  });

  const productIds = topItems.map((p) => p.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p.name]));

  res.json({
    groupBy,
    from: fromDate.toISOString(),
    to:   toDate.toISOString(),
    data: rows.map((r) => ({
      period:     r.period,
      revenue:    r.revenue ?? 0,
      orders:     Number(r.orders),
      deliveries: Number(r.deliveries),
      pickups:    Number(r.pickups),
    })),
    topProducts: topItems.map((p) => ({
      productId:    p.productId,
      name:         productMap.get(p.productId) ?? 'Producto eliminado',
      totalQty:     p._sum.quantity ?? 0,
      totalRevenue: Number(p._sum.subtotal ?? 0),
    })),
  });
});

export default router;
