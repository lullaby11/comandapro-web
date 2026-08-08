# Plantilla — Especificación de funcionalidad

> Cópiala a un issue o a un documento antes de escribir código. Si no puedes rellenar los
> apartados 1 a 3, todavía no hay que programar.

## 1. Problema

Qué le pasa hoy al usuario del local. Con un ejemplo real, no en abstracto.

> Ejemplo: *"Cuando un cliente pide una pizza sin cebolla, el encargado lo escribe en las
> notas del pedido y en cocina se pasa por alto porque va al final del ticket."*

## 2. Quién lo sufre y cuánto

- Rol afectado: OWNER / ADMIN / STAFF / cliente final
- Frecuencia: veces por servicio
- Coste actual: tiempo perdido, pedidos mal servidos, dinero

## 3. Criterios de aceptación

Lista verificable. Cada punto debe poder demostrarse con una acción concreta.

- [ ] …
- [ ] …

## 4. Alcance

**Incluye:**
-

**No incluye (explícitamente):**
-

## 5. Impacto técnico

| Área | ¿Cambia? | Detalle |
|------|----------|---------|
| Modelo de datos (`schema.prisma`) | sí/no | Tablas y columnas; ¿hace falta migración en dos fases? |
| API | sí/no | Endpoints nuevos o modificados; ¿rompe el contrato? |
| Frontend | sí/no | Pantallas afectadas |
| Impresión (ticket) | sí/no | ¿Cambia la maquetación? ¿Afecta a 58 y 80 mm? |
| Tienda online | sí/no | |
| Estadísticas | sí/no | ¿Afecta a datos históricos? |
| Multi-tenant | — | Confirmar que todo filtra por `businessId` |

## 6. Migración de datos existentes

Qué pasa con los locales que ya están en producción. ¿Hay backfill? ¿Se puede desplegar sin
cortar servicio?

## 7. Cómo se prueba

- Tests automáticos que se añaden:
- Prueba manual paso a paso:
- Si toca impresión: ¿se ha probado en impresora real de 58 y de 80 mm?

## 8. Riesgos y plan B

Qué puede salir mal en un local en plena hora punta y cómo se revierte.

## 9. Documentación a actualizar

- [ ] `docs/04-api-reference.md`
- [ ] `docs/03-modelo-datos.md`
- [ ] `docs/07-flujos-negocio.md`
- [ ] `docs/05-frontend.md` / `06-impresion.md`
- [ ] ADR (si la decisión es cara de revertir)
- [ ] `CHANGELOG.md`
