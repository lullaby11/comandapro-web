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
      where: { businessId, serviceId: { in: serviceIds }, status: { notIn: ['CANCELLED'] }, deletedAt: null },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ['serviceId'],
      where: { businessId, serviceId: { in: serviceIds }, status: { notIn: ['CANCELLED'] }, deletedAt: null },
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
      where: { serviceId: id, businessId, status: { notIn: ['CANCELLED'] }, deletedAt: null },
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.order.count({
      where: { serviceId: id, businessId, isPickup: false, status: { notIn: ['CANCELLED'] }, deletedAt: null },
    }),
    prisma.order.count({
      where: { serviceId: id, businessId, isPickup: true, status: { notIn: ['CANCELLED'] }, deletedAt: null },
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: { serviceId: id, businessId, status: { notIn: ['CANCELLED'] }, deletedAt: null } },
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
      where: { customerId: id, businessId, status: { notIn: ['CANCELLED'] }, deletedAt: null },
      _sum: { total: true },
      _count: { id: true },
      _avg: { total: true },
    }),
    prisma.order.findMany({
      where: { customerId: id, businessId, status: { notIn: ['CANCELLED'] }, deletedAt: null },
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

  const [aggregate] = await Promise.all([
    prisma.orderItem.aggregate({
      where: { productId: id, order: { businessId, status: { notIn: ['CANCELLED'] }, deletedAt: null } },
      _sum: { quantity: true, subtotal: true },
    }),
  ]);

  // Los mejores clientes se agregan en SQL. Antes se traían todos los pedidos y se
  // cruzaban en memoria con un `orders.find()` dentro de un bucle —cuadrático—, lo que
  // se degrada con el histórico de un local que lleve tiempo funcionando.
  type FilaCliente = {
    customerId: string;
    name: string;
    phone: string;
    totalQty: bigint;
    totalSpent: number;
  };

  const topCustomers = await prisma.$queryRaw<FilaCliente[]>`
    SELECT c."id"                        AS "customerId",
           c."name",
           c."phone",
           SUM(oi."quantity")::bigint    AS "totalQty",
           SUM(oi."subtotal")::float     AS "totalSpent"
    FROM "order_items" oi
    JOIN "orders"    o ON o."id" = oi."orderId"
    JOIN "customers" c ON c."id" = o."customerId"
    WHERE oi."productId"  = ${id}
      AND o."businessId"  = ${businessId}
      AND o."status"::text <> 'CANCELLED'
      AND o."deletedAt" IS NULL
    GROUP BY c."id", c."name", c."phone"
    ORDER BY "totalQty" DESC
    LIMIT 15
  `;

  res.json({
    product,
    summary: {
      totalSold: aggregate._sum.quantity ?? 0,
      totalRevenue: Number(aggregate._sum.subtotal ?? 0),
    },
    topCustomers: topCustomers.map((c) => ({
      customerId: c.customerId,
      name: c.name,
      phone: c.phone,
      totalQty: Number(c.totalQty),
      totalSpent: c.totalSpent ?? 0,
    })),
  });
});

// ──────────────────────────────────────────────
// GET /stats/categories — Estadísticas por categoría
// ──────────────────────────────────────────────
router.get('/categories', async (req: AuthenticatedRequest, res) => {
  const businessId = req.businessId!;

  // Todo se agrega en SQL. Antes se traían TODOS los items del histórico y se agrupaban
  // en memoria con dos Map: funciona con pocos pedidos y se degrada sin avisar.
  type FilaCategoria = { category: string; totalSold: bigint; totalRevenue: number };

  const categorias = await prisma.$queryRaw<FilaCategoria[]>`
    SELECT COALESCE(p."category", 'Sin categoría') AS "category",
           SUM(oi."quantity")::bigint              AS "totalSold",
           SUM(oi."subtotal")::float               AS "totalRevenue"
    FROM "order_items" oi
    JOIN "orders"   o ON o."id" = oi."orderId"
    JOIN "products" p ON p."id" = oi."productId"
    WHERE o."businessId"   = ${businessId}
      AND o."status"::text <> 'CANCELLED'
      AND o."deletedAt" IS NULL
    GROUP BY COALESCE(p."category", 'Sin categoría')
    ORDER BY "totalRevenue" DESC
  `;

  // Los diez productos más vendidos de cada categoría, en una sola consulta con función
  // de ventana en lugar de una consulta por categoría.
  type FilaProducto = { category: string; name: string; totalQty: bigint; totalRevenue: number };

  const productos = await prisma.$queryRaw<FilaProducto[]>`
    SELECT "category", "name", "totalQty", "totalRevenue"
    FROM (
      SELECT COALESCE(p."category", 'Sin categoría') AS "category",
             p."name"                                AS "name",
             SUM(oi."quantity")::bigint              AS "totalQty",
             SUM(oi."subtotal")::float               AS "totalRevenue",
             ROW_NUMBER() OVER (
               PARTITION BY COALESCE(p."category", 'Sin categoría')
               ORDER BY SUM(oi."quantity") DESC
             ) AS "posicion"
      FROM "order_items" oi
      JOIN "orders"   o ON o."id" = oi."orderId"
      JOIN "products" p ON p."id" = oi."productId"
      WHERE o."businessId"   = ${businessId}
        AND o."status"::text <> 'CANCELLED'
        AND o."deletedAt" IS NULL
      GROUP BY COALESCE(p."category", 'Sin categoría'), p."id", p."name"
    ) AS ranking
    WHERE "posicion" <= 10
    ORDER BY "category", "posicion"
  `;

  const porCategoria = new Map<string, Array<{ name: string; totalQty: number; totalRevenue: number }>>();
  for (const p of productos) {
    const lista = porCategoria.get(p.category) ?? [];
    lista.push({ name: p.name, totalQty: Number(p.totalQty), totalRevenue: p.totalRevenue ?? 0 });
    porCategoria.set(p.category, lista);
  }

  res.json({
    categories: categorias.map((c) => ({
      category: c.category,
      totalSold: Number(c.totalSold),
      totalRevenue: c.totalRevenue ?? 0,
      topProducts: porCategoria.get(c.category) ?? [],
    })),
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
      AND "deletedAt" IS NULL
      AND "createdAt" >= ${fromDate}
      AND "createdAt" <= ${toDate}
    GROUP BY DATE_TRUNC(${truncFn}, "createdAt")
    ORDER BY period
  `;

  const topItems = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: {
      order: { businessId, status: { notIn: ['CANCELLED'] }, deletedAt: null, createdAt: { gte: fromDate, lte: toDate } },
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
