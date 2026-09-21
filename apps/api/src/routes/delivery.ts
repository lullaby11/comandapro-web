import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { authReparto, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

// authReparto, no authMiddleware: estas son las únicas rutas por las que puede entrar el
// rol DELIVERY. Están abiertas a todos los roles porque el dueño de un local pequeño
// también reparte; lo que las protege es el filtro por `assignedToId`, no el rol.
router.use(authReparto);

/**
 * Lo que ve un repartidor de un pedido. Deliberadamente corto: dirección, teléfono y
 * cuánto tiene que cobrar. Ni márgenes, ni coste, ni el histórico del cliente. Si mañana
 * se añaden campos al pedido, no se filtran solos a la pantalla del repartidor.
 */
const CAMPOS_VISIBLES = {
  id: true,
  status: true,
  total: true,
  paymentMethod: true,
  deliveryAddress: true,
  notes: true,
  estimatedDeliveryAt: true,
  assignedAt: true,
  createdAt: true,
  // La dirección de la ficha del cliente hace de respaldo: `Order.deliveryAddress` solo
  // se rellena cuando alguien escribe una distinta, y la pantalla de nueva comanda no lo
  // envía nunca. Sin este respaldo el repartidor no veía a dónde ir en ningún pedido.
  customer: { select: { name: true, phone: true, address: true } },
  items: {
    select: {
      quantity: true,
      notes: true,
      product: { select: { name: true } },
    },
  },
} as const;

// ──────────────────────────────────────────────
// GET /delivery/orders — Mis pedidos
// ──────────────────────────────────────────────
// Por defecto solo los activos, que es lo que hace falta en la calle. `?historico=1`
// devuelve además los ya entregados de hoy, para poder consultar una entrega reciente.
router.get('/orders', async (req: AuthenticatedRequest, res) => {
  const historico = req.query.historico === '1';

  const inicioDeHoy = new Date();
  inicioDeHoy.setHours(0, 0, 0, 0);

  const orders = await prisma.order.findMany({
    where: {
      businessId: req.businessId!,
      assignedToId: req.userId!,
      deletedAt: null,
      ...(historico
        ? { OR: [{ status: { in: ['READY', 'OUT_FOR_DELIVERY'] } }, { createdAt: { gte: inicioDeHoy } }] }
        : { status: { in: ['READY', 'OUT_FOR_DELIVERY'] } }),
    },
    select: CAMPOS_VISIBLES,
    // Los que ya van en la furgoneta primero, y dentro de cada grupo el más antiguo antes
    orderBy: [{ status: 'desc' }, { createdAt: 'asc' }],
  });

  // La dirección se resuelve aquí, no en la pantalla: así el repartidor recibe un único
  // campo ya decidido y la interfaz no tiene que conocer de dónde sale cada una. De paso,
  // `customer.address` no viaja como campo suelto.
  res.json(
    orders.map(({ customer, ...pedido }) => ({
      ...pedido,
      deliveryAddress: pedido.deliveryAddress ?? customer.address ?? null,
      customer: { name: customer.name, phone: customer.phone },
    })),
  );
});

// ──────────────────────────────────────────────
// PATCH /delivery/orders/:id/status — Salir a repartir / entregar
// ──────────────────────────────────────────────
router.patch('/orders/:id/status', async (req: AuthenticatedRequest, res) => {
  // Un repartidor solo puede mover el pedido hacia adelante en su tramo. No puede
  // cancelar, ni devolverlo a cocina, ni marcarlo como listo.
  const schema = z.object({
    status: z.enum(['OUT_FOR_DELIVERY', 'DELIVERED']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // El filtro por assignedToId va en la consulta, no en una comprobación posterior: un
  // pedido de otro repartidor devuelve 404, igual que uno de otro local. No se distingue
  // «no existe» de «no es tuyo» para no confirmar la existencia de pedidos ajenos.
  const order = await prisma.order.findFirst({
    where: {
      id: req.params.id,
      businessId: req.businessId!,
      assignedToId: req.userId!,
      deletedAt: null,
    },
    select: { id: true, status: true },
  });

  if (!order) {
    res.status(404).json({ error: 'Pedido no encontrado' });
    return;
  }

  const nuevoEstado = parsed.data.status;

  // Repetir el estado actual es inofensivo: en la calle se pulsa dos veces con frecuencia
  if (order.status === nuevoEstado) {
    res.json({ id: order.id, status: order.status });
    return;
  }

  const permitido =
    (nuevoEstado === 'OUT_FOR_DELIVERY' && order.status === 'READY') ||
    (nuevoEstado === 'DELIVERED' && order.status === 'OUT_FOR_DELIVERY');

  if (!permitido) {
    res.status(409).json({
      error:
        nuevoEstado === 'OUT_FOR_DELIVERY'
          ? 'El pedido todavía no está listo en cocina'
          : 'Tienes que marcar primero que sales a repartir',
      from: order.status,
      to: nuevoEstado,
    });
    return;
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status: nuevoEstado },
    select: { id: true, status: true },
  });

  res.json(updated);
});

export default router;
