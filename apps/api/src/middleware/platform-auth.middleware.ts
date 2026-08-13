import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma/client';

/**
 * Autenticación de los administradores de plataforma.
 *
 * Es el permiso más peligroso del sistema: da acceso transversal a todos los locales, que
 * es exactamente lo contrario de la regla que sostiene el aislamiento multi-tenant. Por
 * eso hay tres barreras y no una:
 *
 *   1. El token lleva `scope: 'platform'`. Un token de local no lo tiene, así que no
 *      sirve aquí; y los middleware de local exigen `businessId`, que este no lleva.
 *   2. La pertenencia se relee de la base de datos **en cada petición**, igual que en el
 *      panel: revocar el acceso surte efecto de inmediato sin esperar a que caduque el
 *      token.
 *   3. El token dura 8 horas, no 7 días como el del personal de un local.
 */

export const DURACION_TOKEN_PLATAFORMA = '8h';
const SCOPE = 'platform';

export interface PlatformRequest extends Request {
  adminId?: string;
  adminEmail?: string;
}

interface PayloadPlataforma {
  platformAdminId: string;
  scope: string;
}

export function firmarTokenDePlataforma(platformAdminId: string): string {
  return jwt.sign({ platformAdminId, scope: SCOPE }, process.env.JWT_SECRET!, {
    expiresIn: DURACION_TOKEN_PLATAFORMA,
  });
}

export async function platformAuthMiddleware(
  req: PlatformRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const cabecera = req.headers.authorization;

  if (!cabecera?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }

  let payload: PayloadPlataforma;
  try {
    payload = jwt.verify(cabecera.slice(7), process.env.JWT_SECRET!) as PayloadPlataforma;
  } catch {
    res.status(401).json({ error: 'Token inválido o caducado' });
    return;
  }

  // Un token de local, aunque sea válido y esté firmado con el mismo secreto, no abre
  // esta puerta.
  if (payload.scope !== SCOPE || !payload.platformAdminId) {
    res.status(403).json({ error: 'Este token no da acceso a la plataforma' });
    return;
  }

  const admin = await prisma.platformAdmin.findUnique({
    where: { id: payload.platformAdminId },
    include: { user: { select: { email: true } } },
  });

  if (!admin) {
    res.status(403).json({ error: 'Acceso de plataforma revocado' });
    return;
  }

  req.adminId = admin.id;
  req.adminEmail = admin.user.email;
  next();
}

/** Deja constancia de toda acción sobre un local ajeno. */
export async function registrarAuditoria(
  adminEmail: string,
  action: string,
  datos: { businessId?: string; businessName?: string; detail?: string } = {}
): Promise<void> {
  await prisma.platformAuditLog.create({
    data: {
      adminEmail,
      action,
      businessId: datos.businessId ?? null,
      businessName: datos.businessName ?? null,
      detail: datos.detail ?? null,
    },
  });
}
