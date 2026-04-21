import 'express-async-errors';
import 'dotenv/config';

const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'APP_URL'] as const;
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[startup] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRoutes from './routes/auth';
import ordersRoutes from './routes/orders';
import productsRoutes from './routes/products';
import customersRoutes from './routes/customers';
import settingsRoutes from './routes/settings';
import trackingRoutes from './routes/tracking';

const app = express();
const PORT = process.env.PORT ?? 4000;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://main.d33spjlfz445rx.amplifyapp.com')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
console.log('[startup] CORS allowed origins:', allowedOrigins);

// ─── Seguridad & Middleware ───────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
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
