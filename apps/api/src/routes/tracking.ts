import { Router } from 'express';
import { prisma } from '../prisma/client';

const router = Router();

/**
 * Cuánto sigue siendo consultable un pedido por su enlace público.
 *
 * El token viaja impreso en el ticket y por correo, y muestra nombre y dirección del
 * cliente sin pedir contraseña. Que no caducara nunca convertía cada ticket viejo en una
 * filtración latente: basta con encontrar uno en un cajón. 30 días cubre de sobra
 * cualquier reclamación sobre un pedido.
 */
const DIAS_DE_SEGUIMIENTO = 30;

// GET /tracking/:token — Ruta PÚBLICA de seguimiento (sin auth)
router.get('/:token', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { trackingToken: req.params.token },
    include: {
      customer: { select: { name: true, address: true } },
      business: { select: { name: true, logoUrl: true, phone: true, address: true } },
      items: {
        include: { product: { select: { name: true, imageUrl: true } } },
      },
    },
  });

  if (!order) {
    res.status(404).json({ error: 'Pedido no encontrado' });
    return;
  }

  const caducaEl = new Date(order.createdAt);
  caducaEl.setDate(caducaEl.getDate() + DIAS_DE_SEGUIMIENTO);

  if (new Date() > caducaEl) {
    res.status(410).json({
      error: 'Este enlace de seguimiento ha caducado',
      expired: true,
    });
    return;
  }

  // Devolver solo datos seguros (sin datos internos del negocio)
  res.json({
    id: order.id,
    status: order.status,
    isPickup: order.isPickup,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    estimatedDeliveryAt: order.estimatedDeliveryAt,
    customerName: order.customer.name,
    deliveryAddress: order.deliveryAddress || order.customer.address || null,
    business: {
      name: order.business.name,
      logoUrl: order.business.logoUrl,
      phone: order.business.phone,
    },
    items: order.items.map((i) => ({
      productName: i.product.name,
      productImage: i.product.imageUrl,
      quantity: i.quantity,
      subtotal: Number(i.subtotal),
    })),
    total: Number(order.total),
  });
});

export default router;
