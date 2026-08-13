import { Router } from 'express';
import { authMiddleware, requireAdmin, AuthenticatedRequest } from '../middleware/auth.middleware';
import { exportarDatosDelLocal } from '../services/rgpd.service';

const router = Router();
router.use(authMiddleware);

// ──────────────────────────────────────────────
// GET /export — Portabilidad de los datos del local
// ──────────────────────────────────────────────
// Derecho de portabilidad (RGPD art. 20): el local debe poder llevarse sus datos en un
// formato legible por máquina y sin depender de nosotros. Se entrega JSON, no un formato
// propietario.
router.get('/', requireAdmin, async (req: AuthenticatedRequest, res) => {
  const datos = await exportarDatosDelLocal(req.businessId!);

  const fecha = new Date().toISOString().slice(0, 10);
  const nombre = `olyda-${datos.local.slug}-${fecha}.json`;

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.send(JSON.stringify(datos, null, 2));
});

export default router;
