import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma/client';

const router = Router();

// POST /auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    businessSlug: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { email, password, businessSlug } = parsed.data;

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
  });

  if (!business) {
    res.status(401).json({ error: 'Local no encontrado' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Credenciales incorrectas' });
    return;
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    res.status(401).json({ error: 'Credenciales incorrectas' });
    return;
  }

  const businessUser = await prisma.businessUser.findUnique({
    where: { userId_businessId: { userId: user.id, businessId: business.id } },
  });

  if (!businessUser) {
    res.status(403).json({ error: 'No tienes acceso a este local' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, businessId: business.id, role: businessUser.role },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: businessUser.role },
    business: { id: business.id, name: business.name, slug: business.slug },
  });
});

// POST /auth/register — Crear primer usuario/negocio
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    businessName: z.string().min(2).max(100),
    businessSlug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
    userName: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { businessName, businessSlug, userName, email, password } = parsed.data;

  // Verificar slug único
  const existingBusiness = await prisma.business.findUnique({ where: { slug: businessSlug } });
  if (existingBusiness) {
    res.status(409).json({ error: 'El slug del local ya está en uso' });
    return;
  }

  // Verificar email único
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    res.status(409).json({ error: 'El email ya está registrado' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const { business, user, businessUser } = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: { name: businessName, slug: businessSlug },
    });

    const user = await tx.user.create({
      data: { name: userName, email, passwordHash },
    });

    const businessUser = await tx.businessUser.create({
      data: { userId: user.id, businessId: business.id, role: 'OWNER' },
    });

    return { business, user, businessUser };
  });

  const token = jwt.sign(
    { userId: user.id, businessId: business.id, role: businessUser.role },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );

  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: businessUser.role },
    business: { id: business.id, name: business.name, slug: business.slug },
  });
});

export default router;
