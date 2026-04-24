import { Router } from 'express';
import { prisma } from '../prisma/client';

const router = Router();

// GET /tracking/:token — Ruta PÚBLICA de seguimiento (sin auth)
router.get('/:token', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { trackingToken: req.params.token },
    include: {
      customer: { select: { name: true } },
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

  // Devolver solo datos seguros (sin datos internos del negocio)
  res.json({
    id: order.id,
    status: order.status,
    isPickup: order.isPickup,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    estimatedDeliveryAt: order.estimatedDeliveryAt,
    customerName: order.customer.name,
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
