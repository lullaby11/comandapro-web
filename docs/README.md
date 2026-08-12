# Documentación de ComandaPro / Olyda

> Sistema SaaS multi-tenant de gestión de comandas para locales de comida a domicilio,
> con impresión térmica ESC/POS real, venta online y seguimiento público de pedidos.

Esta carpeta es la **fuente de verdad** del proyecto. Antes de abrir una nueva versión o
implementar una mejora, lee el documento correspondiente y actualízalo en el mismo PR.

## Índice

| # | Documento | Para qué sirve |
|---|-----------|----------------|
| 01 | [Visión de producto](01-vision-producto.md) | Qué es, a quién sirve, modelo de negocio SaaS, glosario |
| 02 | [Arquitectura](02-arquitectura.md) | Componentes, diagramas, flujos, decisiones estructurales |
| 03 | [Modelo de datos](03-modelo-datos.md) | Entidades Prisma, relaciones, invariantes, migraciones |
| 04 | [Referencia de API](04-api-reference.md) | Todos los endpoints, contratos y códigos de error |
| 05 | [Frontend](05-frontend.md) | Rutas, patrones de estado, design system, accesibilidad |
| 06 | [Impresión térmica](06-impresion.md) | ESC/POS, WebUSB, print-agent, troubleshooting de impresoras |
| 07 | [Flujos de negocio](07-flujos-negocio.md) | Servicios/turnos, estados de pedido, stock, venta online |
| 08 | [Entorno de desarrollo](08-entorno-desarrollo.md) | Setup local, comandos, convenciones, flujo de trabajo Git |
| 09 | [Despliegue y operación](09-despliegue.md) | AWS, CI/CD, rollback, runbooks de incidencias |
| 10 | [Seguridad y multi-tenant](10-seguridad.md) | Modelo de amenazas, aislamiento por tenant, checklist |
| 11 | [Deuda técnica](11-deuda-tecnica.md) | Auditoría priorizada del código actual (con ubicaciones) |
| 12 | [Roadmap de versiones](12-roadmap.md) | v1.1 → v2.0, qué falta para vender como SaaS |
| 13 | [Estrategia de testing](13-testing.md) | Qué probar, con qué, y en qué orden implementarlo |

### Decisiones de arquitectura (ADR)

Las decisiones estructurales se registran en [`adr/`](adr/README.md). **Toda decisión que
sea cara de revertir necesita un ADR** (nueva dependencia de infraestructura, cambio de
modelo de datos transversal, cambio de protocolo de impresión, etc.).

### Plantillas

- [Especificación de funcionalidad](plantillas/feature-spec.md) — antes de escribir código
- [Checklist de Pull Request](plantillas/pull-request.md)
- [Checklist de release](plantillas/release-checklist.md)

## Estado del proyecto (a 11 de agosto de 2026)

| Área | Estado |
|------|--------|
| Gestión de comandas en local | ✅ Funcional en producción |
| Impresión térmica ESC/POS (WebUSB + agente local) | ✅ Funcional, con matices por modelo de impresora |
| Venta online por tienda (`/[slug]/pedidos`) | ✅ Funcional |
| Estadísticas por servicio / cliente / producto | ✅ Funcional |
| Multi-tenant (aislamiento de datos) | ✅ Implementado y cubierto por tests. Sin panel de administración SaaS |
| Gestión de usuarios del local | ✅ Invitaciones, roles y revocación de acceso (v1.1) |
| Facturación / planes / suscripciones | ❌ No existe |
| Tests automatizados | ✅ 94 tests (Vitest + PostgreSQL real), con CI que bloquea el merge |
| Tiempo real (pedidos online al instante) | ⚠️ Polling, no push |

Detalle completo en [11-deuda-tecnica.md](11-deuda-tecnica.md) y [12-roadmap.md](12-roadmap.md).

## Cómo usar esta documentación al desarrollar

1. **Antes de programar** → lee el doc del área + [plantillas/feature-spec.md](plantillas/feature-spec.md).
2. **Mientras programas** → respeta las convenciones de [08-entorno-desarrollo.md](08-entorno-desarrollo.md).
3. **Antes del PR** → [plantillas/pull-request.md](plantillas/pull-request.md); actualiza los docs afectados.
4. **Antes de desplegar** → [plantillas/release-checklist.md](plantillas/release-checklist.md) y el
   [CHANGELOG](../CHANGELOG.md).
