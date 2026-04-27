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

const app = express();
const PORT = process.env.PORT ?? 4000;

// ─── Seguridad & Middleware ───────────────────────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  next();
});
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
