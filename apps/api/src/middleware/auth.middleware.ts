import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma/client';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  businessId?: string;
  role?: string;
}

/**
 * Comprueba la sesión y deja `userId`, `businessId` y `role` en la petición.
 *
 * `permitirReparto` decide si el rol DELIVERY puede pasar. Por defecto **no**, y esa es
 * la pieza importante: todas las rutas del dashboard hacen `router.use(authMiddleware)`,
 * así que un repartidor queda fuera de productos, clientes, estadísticas, ajustes y del
 * listado completo de pedidos sin que haya que mantener ninguna lista de rutas
 * prohibidas. Una ruta nueva nace cerrada para el reparto; abrirla es un acto explícito.
 */
async function verificarSesion(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  permitirReparto: boolean
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
      include: { business: { select: { suspendedAt: true } } },
    });

    if (!businessUser) {
      res.status(403).json({ error: 'Acceso denegado a este local' });
      return;
    }

    // El acceso se puede revocar sin borrar la pertenencia, para conservar el rastro de
    // quién trabajó en el local. Se comprueba en cada petición, así que desactivar a
    // alguien surte efecto de inmediato aunque su token siga vigente.
    if (businessUser.disabledAt !== null) {
      res.status(403).json({ error: 'Tu acceso a este local está desactivado' });
      return;
    }

    // Local suspendido por la plataforma: nadie de su equipo puede operar. Se comprueba
    // en cada petición, así que la suspensión surte efecto de inmediato aunque tengan la
    // sesión abierta.
    if (businessUser.business?.suspendedAt) {
      res.status(403).json({
        error: 'Este local está suspendido. Ponte en contacto con el soporte de Olyda.',
        suspended: true,
      });
      return;
    }

    // El rol se lee de la base de datos, no del token: si a alguien se le cambia el rol
    // a repartidor, deja de entrar al dashboard en la siguiente petición sin esperar a
    // que caduque su sesión.
    if (!permitirReparto && businessUser.role === 'DELIVERY') {
      res.status(403).json({
        error: 'Tu cuenta es de reparto y no tiene acceso a la gestión del local',
        soloReparto: true,
      });
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

/** Sesión para la gestión del local. Los repartidores NO pasan. */
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  return verificarSesion(req, res, next, false);
}

/**
 * Sesión para las rutas de reparto, abierta a todos los roles.
 *
 * No se limita a DELIVERY a propósito: en un local pequeño el dueño reparte a menudo, y
 * obligarle a tener dos cuentas sería absurdo. Lo que protege estas rutas no es el rol,
 * sino que solo devuelven pedidos asignados a quien pregunta.
 */
export function authReparto(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  return verificarSesion(req, res, next, true);
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
