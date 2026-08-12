import { Request, Response, NextFunction } from 'express';

/**
 * Limitador de peticiones en memoria, de ventana fija.
 *
 * Se implementa sin dependencias externas a propósito: el Dockerfile instala con
 * `npm ci` desde el package-lock de la raíz, y añadir un paquete obligaría a
 * sincronizar dos lockfiles con riesgo de romper el despliegue.
 *
 * LIMITACIÓN CONOCIDA: el contador vive en el proceso. App Runner puede escalar a
 * varias instancias, así que el límite efectivo es (instancias × max). Es suficiente
 * para frenar la fuerza bruta; si algún día hace falta precisión, mover el contador a
 * Redis o a un limitador con almacén compartido.
 */

interface RateLimitOptions {
  /** Duración de la ventana en milisegundos */
  windowMs: number;
  /** Peticiones permitidas por clave y ventana */
  max: number;
  /** Construye la clave del contador a partir de la petición */
  keyGenerator: (req: Request) => string;
  /** Mensaje devuelto al agotar el cupo */
  message: string;
  /**
   * Si es true, las respuestas correctas (< 400) no consumen cupo.
   * Se usa en el login: solo cuentan los intentos fallidos.
   */
  skipSuccessfulRequests?: boolean;
}

interface Counter {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, keyGenerator, message, skipSuccessfulRequests = false } = options;

  const counters = new Map<string, Counter>();
  let lastSweep = Date.now();

  /** Elimina contadores caducados. Se ejecuta como mucho una vez por ventana. */
  function sweep(now: number): void {
    if (now - lastSweep < windowMs) return;
    for (const [key, counter] of counters) {
      if (counter.resetAt <= now) counters.delete(key);
    }
    lastSweep = now;
  }

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    sweep(now);

    const key = keyGenerator(req);
    let counter = counters.get(key);

    if (!counter || counter.resetAt <= now) {
      counter = { count: 0, resetAt: now + windowMs };
      counters.set(key, counter);
    }

    if (counter.count >= max) {
      const retryAfter = Math.ceil((counter.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: message, retryAfter });
      return;
    }

    counter.count += 1;

    if (skipSuccessfulRequests) {
      res.on('finish', () => {
        // El intento fue bueno: devolvemos el cupo consumido
        if (res.statusCode < 400) {
          const current = counters.get(key);
          if (current) current.count = Math.max(0, current.count - 1);
        }
      });
    }

    next();
  };
}

/**
 * IP del cliente. App Runner y Amplify añaden `X-Forwarded-For`; tomamos la primera
 * entrada (el cliente original). Es falsificable, por eso los límites que protegen
 * credenciales se apoyan también en el email (ver `loginRateLimiter`).
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * Login: 10 intentos FALLIDOS por email y local cada 15 minutos.
 *
 * La clave es el email (más el local, si viene) y no la IP: es lo que realmente se
 * está atacando y no se puede falsificar rotando cabeceras. Si no hay email en el
 * cuerpo, se cae a la IP para no dejar el endpoint sin protección.
 */
export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : null;
    const scope = req.params.slug ?? 'staff';
    return email ? `login:${scope}:${email}` : `login-ip:${scope}:${getClientIp(req)}`;
  },
  message: 'Demasiados intentos fallidos. Espera unos minutos antes de volver a intentarlo.',
});

/** Registro: 5 altas por IP y hora, cuenten o no como éxito. */
export const registerRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `register:${getClientIp(req)}`,
  message: 'Demasiados registros desde esta conexión. Inténtalo de nuevo más tarde.',
});

/**
 * Aceptación de invitaciones: 30 por IP y hora.
 *
 * Mucho más holgado que el registro porque el escenario legítimo es un local dando de
 * alta a todo su equipo desde el mismo wifi, y con el límite de 5 se bloqueaban entre
 * ellos. Aquí lo que autoriza de verdad es el token de 32 bytes del enlace, que no se
 * puede adivinar; el límite solo evita que alguien machaque el endpoint.
 */
export const invitationRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => `invitation:${getClientIp(req)}`,
  message: 'Demasiados intentos desde esta conexión. Inténtalo de nuevo más tarde.',
});
