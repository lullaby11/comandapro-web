# 0003 — Multi-tenant con columna discriminadora

- **Estado:** Aceptada
- **Fecha:** 2026-04 (documentada retroactivamente el 2026-08-06)
- **Afecta a:** apps/api, modelo de datos

## Contexto

El producto se concibe desde el principio para venderse a muchos locales. Hay que aislar
los datos de cada uno con un coste operativo compatible con un precio de ~30 €/mes por
local y una infraestructura de ~50 €/mes en total.

## Opciones consideradas

1. **Una base de datos por tenant.** Aislamiento máximo, pero N instancias, N migraciones y
   un coste fijo por cliente que destroza el margen.
2. **Un esquema PostgreSQL por tenant.** Buen aislamiento y una sola instancia, pero las
   migraciones se multiplican por el número de esquemas y Prisma no lo gestiona con
   comodidad.
3. **Tablas compartidas con columna `businessId`.** Coste marginal por tenant casi nulo;
   el aislamiento depende del código.

## Decisión

Opción 3: todas las tablas de negocio llevan `businessId` y todas las consultas lo filtran.
El `businessId` se obtiene **siempre del JWT**, nunca del cuerpo de la petición, y
`authMiddleware` revalida en cada petición que el usuario pertenece a ese local.

## Consecuencias

### Positivas
- Coste marginal de un local nuevo ≈ 0; el alta es autoservicio en un endpoint.
- Una sola migración por cambio de esquema.
- Consultas agregadas entre locales (métricas del SaaS) son triviales.

### Negativas / coste asumido
- **El aislamiento es una convención, no una garantía.** Un `findUnique({ id })` sin
  `businessId` filtra datos entre clientes y ninguna prueba automática lo detecta hoy.
- Un local muy grande impacta el rendimiento de los demás (vecino ruidoso).
- Un borrado accidental afecta potencialmente a todos los clientes a la vez.

### Mitigaciones acordadas
- Convención obligatoria: `findFirst({ where: { id, businessId } })`, nunca `findUnique` por
  id en rutas de negocio.
- Tests de aislamiento multi-tenant en la fase 1 de [testing](../13-testing.md).
- A medio plazo: extensión de cliente de Prisma o Row Level Security de PostgreSQL para que
  el filtro deje de depender de la disciplina humana.

### Qué haría falta para revertirla
Migrar a esquema por tenant es factible (los datos ya están particionados por
`businessId`), pero implica reescribir la conexión de Prisma y el proceso de alta.
Solo se plantearía ante una exigencia contractual de aislamiento físico.
