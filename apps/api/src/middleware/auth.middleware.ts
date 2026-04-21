import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma/client';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  businessId?: string;
  role?: string;
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticación requerido' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      businessId: string;
      role: string;
    };

    // Verificar que el usuario sigue teniendo acceso al negocio
    const businessUser = await prisma.businessUser.findUnique({
      where: {
        userId_businessId: {
          userId: payload.userId,
          businessId: payload.businessId,
        },
      },
    });

    if (!businessUser) {
      res.status(403).json({ error: 'Acceso denegado a este local' });
      return;
    }

    req.userId = payload.userId;
    req.businessId = payload.businessId;
    req.role = businessUser.role;

    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/** Middleware para restringir acceso solo a OWNER o ADMIN */
export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!['OWNER', 'ADMIN'].includes(req.role ?? '')) {
    res.status(403).json({ error: 'Se requieren permisos de administrador' });
    return;
  }
  next();
}
