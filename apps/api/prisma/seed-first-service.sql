-- Migración de datos: crear el primer servicio y asignar todos los pedidos existentes
-- Servicio: viernes 24 de abril de 2026, 15:00 CEST (13:00 UTC) → domingo 27 de abril, 10:00 CEST (08:00 UTC)
--
-- Ejecutar en producción con:
--   psql <DATABASE_URL> -f seed-first-service.sql

-- 1. Crear el primer servicio para cada negocio que tenga pedidos
INSERT INTO services (id, "businessId", "startedAt", "endedAt", "createdAt")
SELECT
  'service_first_' || b.id,
  b.id,
  '2026-04-24 13:00:00'::timestamp,
  '2026-04-27 08:00:00'::timestamp,
  '2026-04-24 13:00:00'::timestamp
FROM businesses b
WHERE EXISTS (SELECT 1 FROM orders o WHERE o."businessId" = b.id)
ON CONFLICT DO NOTHING;

-- 2. Asignar todos los pedidos existentes al servicio de su negocio
UPDATE orders o
SET "serviceId" = s.id
FROM services s
WHERE s."businessId" = o."businessId"
  AND o."serviceId" IS NULL;

-- Verificación
SELECT 'Servicios creados' as resultado, count(*) as total FROM services;
SELECT 'Pedidos asignados' as resultado, count(*) as total FROM orders WHERE "serviceId" IS NOT NULL;
SELECT 'Pedidos sin asignar' as resultado, count(*) as total FROM orders WHERE "serviceId" IS NULL;
