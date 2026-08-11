# 0001 — Monorepo con npm workspaces y Turborepo

- **Estado:** Aceptada
- **Fecha:** 2026-04-10 (documentada retroactivamente el 2026-08-11)
- **Afecta a:** todo el repositorio

## Contexto

El producto necesita tres artefactos que evolucionan juntos y comparten el contrato de la
API: el backend, el frontend y un agente de impresión que se ejecuta en el local del
cliente. Un cambio en el formato del pedido afecta a los tres.

## Opciones consideradas

1. **Tres repositorios independientes.** Aislamiento limpio, pero cada cambio de contrato
   implica coordinar tres PR y tres despliegues, y los tipos se copian a mano.
2. **Monorepo con npm workspaces + Turborepo.** Un solo commit atómico por cambio,
   posibilidad de compartir tipos, caché de builds.

## Decisión

Monorepo con `npm workspaces` (`apps/*`, `packages/*`) orquestado con Turborepo, porque el
equipo es muy pequeño y el coste de coordinación entre repositorios sería superior al de
gestionar builds selectivos.

## Consecuencias

### Positivas
- Un cambio de contrato de API se hace en un único PR.
- El workflow de despliegue puede filtrar por rutas (`paths: apps/api/**`).
- Existe un lugar natural para tipos compartidos: `packages/shared-types`.

### Negativas / coste asumido
- **La promesa de compartir tipos no se ha cumplido**: `packages/shared-types` sigue vacío
  y las interfaces se duplican en el frontend.
- Los binarios nativos (Tailwind v4 / lightningcss, Prisma) obligan a instalar cada app por
  separado con `npm install --no-workspaces` y a parchear el build de Amplify a mano.
- Cada app mantiene su propio `package-lock.json`, lo que diluye la ventaja del workspace.

### Qué haría falta para revertirla
Extraer cada app a su repositorio y publicar los tipos como paquete npm privado. No está
justificado con el tamaño actual del equipo.
