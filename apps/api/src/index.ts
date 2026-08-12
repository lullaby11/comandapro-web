import 'express-async-errors';
import 'dotenv/config';

const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'APP_URL'] as const;
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[startup] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import authRoutes from './routes/auth';
import ordersRoutes from './routes/orders';
import productsRoutes from './routes/products';
import customersRoutes from './routes/customers';
import settingsRoutes from './routes/settings';
import trackingRoutes from './routes/tracking';
import shippingRatesRoutes from './routes/shipping-rates';
import servicesRoutes from './routes/services';
import statsRoutes from './routes/stats';
import publicRoutes from './routes/public';
import usersRoutes from './routes/users';
import invitationsRoutes from './routes/invitations';

const app = express();
const PORT = process.env.PORT ?? 4000;

// ─── CORS ─────────────────────────────────────────────────────────────────────
// La mayor parte del frontend llega vía el rewrite de Next.js (mismo origen, sin
// cabecera Origin), pero la tienda online de /[slug]/pedidos llama a la API en
// absoluto con NEXT_PUBLIC_API_URL: para ella sí hace falta CORS real.
function parseOrigins(value: string | undefined): string[] {
  return (value ?? '').split(',').map((o) => o.trim()).filter(Boolean);
}

/**
 * Si no hay ALLOWED_ORIGINS configurada en producción, se deduce del frontend
 * (APP_URL, que es obligatoria y apunta a la web). Así nunca se despliega con CORS
 * abierto por un despiste de configuración, y tampoco se rompe la tienda online.
 */
function fallbackOrigins(): string[] {
  try {
    const { protocol, host } = new URL(process.env.APP_URL!);
    return [`${protocol}//${host}`];
  } catch {
    return [];
  }
}

const isProduction = process.env.NODE_ENV === 'production';
const configuredOrigins = parseOrigins(process.env.ALLOWED_ORIGINS);
const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : fallbackOrigins();

// En desarrollo, sin nada configurado, se acepta cualquier origen para no estorbar.
const allowAnyOrigin = !isProduction && allowedOrigins.length === 0;

if (configuredOrigins.length === 0 && allowedOrigins.length > 0) {
  console.warn(
    `[startup] ALLOWED_ORIGINS no configurada: usando el origen de APP_URL → ${allowedOrigins.join(', ')}`
  );
}
console.log(
  allowAnyOrigin
    ? '[startup] CORS abierto a cualquier origen (solo desarrollo)'
    : `[startup] Orígenes CORS permitidos: ${allowedOrigins.join(', ') || '(ninguno)'}`
);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Respuesta cacheable por origen
  res.setHeader('Vary', 'Origin');

  // Sin cabecera Origin no hay petición de navegador entre orígenes: peticiones
  // servidor a servidor (rewrite de Next.js, print-agent, health checks) pasan sin más.
  if (origin && (allowAnyOrigin || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  } else if (origin) {
    console.warn(`[cors] Origen rechazado: ${origin}`);
  }

  // El preflight se responde siempre; sin las cabeceras anteriores el navegador
  // bloqueará la petición real, que es justo lo que se busca.
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  next();
});

// ─── Seguridad & Middleware ───────────────────────────────────────────────────
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Rutas ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/shipping-rates', shippingRatesRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/invitations', invitationsRoutes);

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[Error]', err.message, err.stack);
    res.status(500).json({
      error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
    });
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 ComandaPro API running on http://localhost:${PORT}`);
  console.log(`   ENV: ${process.env.NODE_ENV}`);
});

export default app;
