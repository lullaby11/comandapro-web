-- v1.1 — Integridad de datos
--
-- Añade el rastro del stock devuelto, el borrado lógico de pedidos, el índice que
-- necesitan el listado y las estadísticas por fecha, y la garantía en base de datos de
-- que un local no puede tener dos servicios abiertos a la vez.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT,
ADD COLUMN     "stockRestoredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "orders_businessId_createdAt_idx" ON "orders"("businessId", "createdAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- Un solo servicio activo por local
--
-- Hasta ahora la invariante solo la garantizaba la aplicación (POST /services/start
-- devuelve 409 si ya hay uno abierto), lo que deja la puerta a una condición de carrera
-- entre dos peticiones simultáneas. El índice único parcial lo hace imposible.
--
-- Antes de crearlo se cierran los duplicados que pudieran existir, dejando abierto el más
-- reciente de cada local: sin esto, la migración fallaría en un local con datos
-- inconsistentes y el contenedor no arrancaría.
UPDATE "services" s
SET "endedAt" = NOW()
WHERE s."endedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "services" s2
    WHERE s2."businessId" = s."businessId"
      AND s2."endedAt" IS NULL
      AND (s2."startedAt" > s."startedAt" OR (s2."startedAt" = s."startedAt" AND s2."id" > s."id"))
  );

CREATE UNIQUE INDEX "un_servicio_activo_por_local"
  ON "services" ("businessId")
  WHERE "endedAt" IS NULL;
