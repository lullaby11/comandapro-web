import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../prisma/client';
import { validateStock, deductStock } from '../services/stock.service';
import { sendVerificationEmail, sendOrderConfirmedEmail } from '../services/email.service';
import { customerAuthMiddleware, CustomerAuthRequest } from '../middleware/customer-auth.middleware';

const router = Router();

// ─── GET /public/:slug ─────────────────────────────────────────────────────────
// Info del comercio + estado del servicio
router.get('/:slug', async (req, res) => {
  const business = await prisma.business.findUnique({
    where: { slug: req.params.slug },
    select: { id: true, name: true, logoUrl: true, address: true, onlineOrderEnabled: true },
  });

  if (!business || !business.onlineOrderEnabled) {
    res.status(404).json({ error: 'Tienda no encontrada o sin venta online activa' });
    return;
  }

  const activeService = await prisma.service.findFirst({
    where: { businessId: business.id, endedAt: null },
    select: { id: true },
  });

  res.json({
    business: { name: business.name, logoUrl: business.logoUrl, address: business.address },
    serviceActive: !!activeService,
  });
});

// ─── GET /public/:slug/products ───────────────────────────────────────────────
router.get('/:slug/products', async (req, res) => {
  const business = await prisma.business.findUnique({
    where: { slug: req.params.slug },
    select: { id: true, onlineOrderEnabled: true },
  });
  if (!business?.onlineOrderEnabled) { res.status(404).end(); return; }

  const products = await prisma.product.findMany({
    where: { businessId: business.id, active: true, onlineVisible: true, stock: { gt: 0 } },
    select: { id: true, name: true, description: true, price: true, stock: true, category: true, imageUrl: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  res.json(products);
});

// ─── GET /public/:slug/shipping-rates ─────────────────────────────────────────
router.get('/:slug/shipping-rates', async (req, res) => {
  const business = await prisma.business.findUnique({
    where: { slug: req.params.slug },
    select: { id: true, onlineOrderEnabled: true },
  });
  if (!business?.onlineOrderEnabled) { res.status(404).end(); return; }

  const rates = await prisma.shippingRate.findMany({
    where: { businessId: business.id, active: true },
    select: { id: true, name: true, price: true },
  });
  res.json(rates);
});

// ─── POST /public/:slug/auth/register ─────────────────────────────────────────
const registerSchema = z.object({
  name:     z.string().min(2).max(100),
  phone:    z.string().min(6).max(20),
  email:    z.string().email(),
  address:  z.string().min(3).max(300),
  password: z.string().min(6),
});

router.post('/:slug/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const business = await prisma.business.findUnique({
    where: { slug: req.params.slug },
    select: { id: true, name: true, onlineOrderEnabled: true },
  });
  if (!business?.onlineOrderEnabled) {
    res.status(404).json({ error: 'Tienda no encontrada' });
    return;
  }

  const { name, phone, email, address, password } = parsed.data;

  const existing = await prisma.customerAccount.findUnique({
    where: { businessId_email: { businessId: business.id, email } },
  });

  if (existing) {
    if (existing.emailVerified) {
      res.status(409).json({ error: 'Ya existe una cuenta con este email. Inicia sesión.' });
    } else {
      // Reenviar email de verificación
      const token = crypto.randomBytes(32).toString('hex');
      await prisma.customerAccount.update({
        where: { id: existing.id },
        data: { verifyToken: token, verifyExpiresAt: new Date(Date.now() + 24 * 3600_000) },
      });
      const verifyUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/${req.params.slug}/pedidos?verify=${token}`;
      sendVerificationEmail(email, verifyUrl, business.name).catch(console.error);
      res.status(409).json({ code: 'EMAIL_UNVERIFIED', message: 'Revisa tu email para verificar tu cuenta.' });
    }
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const verifyToken = crypto.randomBytes(32).toString('hex');

  await prisma.customerAccount.create({
    data: {
      businessId: business.id,
      name, phone, email, address, passwordHash,
      verifyToken,
      verifyExpiresAt: new Date(Date.now() + 24 * 3600_000),
    },
  });

  const verifyUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/${req.params.slug}/pedidos?verify=${verifyToken}`;
  sendVerificationEmail(email, verifyUrl, business.name).catch(console.error);

  res.status(201).json({ message: 'Cuenta creada. Revisa tu email para verificarla antes de continuar.' });
});

// ─── POST /public/:slug/auth/verify-email ─────────────────────────────────────
router.post('/:slug/auth/verify-email', async (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token) { res.status(400).json({ error: 'Token requerido' }); return; }

  const account = await prisma.customerAccount.findFirst({
    where: { verifyToken: token, verifyExpiresAt: { gt: new Date() } },
  });

  if (!account) {
    res.status(400).json({ error: 'Enlace de verificación inválido o expirado. Regístrate de nuevo.' });
    return;
  }

  await prisma.customerAccount.update({
    where: { id: account.id },
    data: { emailVerified: true, verifyToken: null, verifyExpiresAt: null },
  });

  const jwtToken = jwt.sign(
    { customerAccountId: account.id, businessId: account.businessId },
    process.env.JWT_SECRET!,
    { expiresIn: '30d' },
  );

  res.json({ token: jwtToken, name: account.name, email: account.email, address: account.address });
});

// ─── POST /public/:slug/auth/login ────────────────────────────────────────────
router.post('/:slug/auth/login', async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Email y contraseña requeridos' }); return; }

  const business = await prisma.business.findUnique({
    where: { slug: req.params.slug },
    select: { id: true, onlineOrderEnabled: true },
  });
  if (!business?.onlineOrderEnabled) { res.status(404).json({ error: 'Tienda no encontrada' }); return; }

  const account = await prisma.customerAccount.findUnique({
    where: { businessId_email: { businessId: business.id, email: parsed.data.email } },
  });

  if (!account || !(await bcrypt.compare(parsed.data.password, account.passwordHash))) {
    res.status(401).json({ error: 'Email o contraseña incorrectos' });
    return;
  }

  if (!account.emailVerified) {
    res.status(403).json({ code: 'EMAIL_UNVERIFIED', message: 'Verifica tu email antes de iniciar sesión.' });
    return;
  }

  const token = jwt.sign(
    { customerAccountId: account.id, businessId: business.id },
    process.env.JWT_SECRET!,
    { expiresIn: '30d' },
  );

  res.json({ token, name: account.name, email: account.email, address: account.address });
});

// ─── POST /public/:slug/orders ─────────────────────────────────────────────────
// Crear pedido online (requiere auth de cliente)
const onlineOrderSchema = z.object({
  isPickup:       z.boolean().optional(),
  notes:          z.string().optional(),
  paymentMethod:  z.enum(['CASH', 'CARD']).optional().default('CASH'),
  shippingRateId: z.string().cuid().optional(),
  items: z.array(z.object({
    productId: z.string().cuid(),
    quantity:  z.number().int().positive(),
  })).min(1, 'El pedido debe tener al menos un producto'),
});

router.post('/:slug/orders', customerAuthMiddleware, async (req: CustomerAuthRequest, res: Response) => {
  const parsed = onlineOrderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const businessId = req.businessId!;

  const business = await prisma.business.findFirst({
    where: { id: businessId, slug: req.params.slug, onlineOrderEnabled: true },
    select: { id: true, name: true, taxRate: true },
  });
  if (!business) { res.status(404).json({ error: 'Tienda no encontrada' }); return; }

  const activeService = await prisma.service.findFirst({
    where: { businessId, endedAt: null },
    select: { id: true },
  });
  if (!activeService) {
    res.status(409).json({ error: 'El comercio está cerrado en este momento.' });
    return;
  }

  const account = await prisma.customerAccount.findUnique({
    where: { id: req.customerAccountId! },
    select: { name: true, phone: true, email: true, address: true },
  });
  if (!account) { res.status(401).end(); return; }

  // Encontrar o crear Customer vinculado al business
  let customer = await prisma.customer.findUnique({
    where: { businessId_phone: { businessId, phone: account.phone } },
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: { businessId, name: account.name, phone: account.phone, email: account.email, address: account.address },
    });
  }

  const { items, isPickup, notes, paymentMethod, shippingRateId } = parsed.data;

  const stockValidation = await validateStock(businessId, items);
  if (!stockValidation.valid) {
    res.status(409).json({ error: 'Stock insuficiente', details: stockValidation.errors });
    return;
  }

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) }, businessId },
    select: { id: true, price: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  let shippingCost = 0;
  if (shippingRateId) {
    const rate = await prisma.shippingRate.findFirst({
      where: { id: shippingRateId, businessId, active: true },
      select: { price: true },
    });
    if (!rate) { res.status(400).json({ error: 'Tarifa de envío no válida' }); return; }
    shippingCost = Number(rate.price);
  }

  const orderItems = items.map((item) => {
    const product = productMap.get(item.productId)!;
    const unitPrice = Number(product.price);
    return { productId: item.productId, quantity: item.quantity, unitPrice, subtotal: unitPrice * item.quantity };
  });

  const subtotal = orderItems.reduce((s, i) => s + i.subtotal, 0);
  const tax = subtotal * ((business.taxRate ?? 0) / 100);
  const total = subtotal + tax + shippingCost;

  const order = await prisma.$transaction(async (tx) => {
    await deductStock(tx, businessId, items);
    return tx.order.create({
      data: {
        businessId,
        customerId:         customer!.id,
        customerAccountId:  req.customerAccountId!,
        serviceId:          activeService.id,
        status:             'RECEIVED_ONLINE',
        isPickup:           isPickup ?? false,
        notes,
        paymentMethod:      paymentMethod ?? 'CASH',
        shippingRateId:     shippingRateId ?? undefined,
        shippingCost,
        subtotal,
        tax,
        total,
        items: {
          create: orderItems.map((i) => ({
            productId: i.productId,
            quantity:  i.quantity,
            unitPrice: i.unitPrice,
            subtotal:  i.subtotal,
          })),
        },
      },
    });
  });

  res.status(201).json({
    id:            order.id,
    trackingToken: order.trackingToken,
    ref:           order.id.slice(-8).toUpperCase(),
  });
});

export default router;
