import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface CustomerAuthRequest extends Request {
  customerAccountId?: string;
  businessId?: string;
}

export async function customerAuthMiddleware(
  req: CustomerAuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticación requerido' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      customerAccountId: string;
      businessId: string;
    };
    req.customerAccountId = payload.customerAccountId;
    req.businessId = payload.businessId;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
