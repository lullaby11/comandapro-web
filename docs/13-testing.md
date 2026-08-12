# 13 — Estrategia de testing

**Estado actual (v1.1): 94 tests en 8 ficheros**, con Vitest contra un PostgreSQL real, y
un workflow de calidad del que depende el despliegue.

```bash
cd apps/api
DATABASE_URL_TEST="postgresql://comandapro:comandapro@localhost:5432/comandapro_test" npm test
```

La base de test se recrea aplicando **las migraciones**, no `db push`: así se cubre el SQL
que Prisma no sabe declarar —el índice único parcial del servicio activo— y se obliga a que
todo cambio de esquema lleve su migración.

| Fichero | Qué cubre |
|---------|-----------|
| `services/__tests__/printer.service.test.ts` | Ticket ESC/POS: contenido, anchos de papel, sanitización de acentos, truncado, QR, corte |
| `services/__tests__/money.test.ts` | Aritmética en céntimos, con propiedades sobre 2000 combinaciones |
| `routes/__tests__/tenant-isolation.test.ts` | Que un local no vea ni toque nada de otro |
| `routes/__tests__/orders.test.ts` | Stock, concurrencia, precios congelados, importes |
| `routes/__tests__/order-status.test.ts` | Transiciones válidas e inválidas |
| `routes/__tests__/order-delete.test.ts` | Borrado lógico y su efecto en estadísticas |
| `routes/__tests__/services.test.ts` | Turnos y la garantía de uno solo activo |
| `routes/__tests__/users.test.ts` | Equipo, invitaciones y reglas de rol |

Lo que sigue describe el plan original y las fases que quedan pendientes.

---

**Punto de partida (agosto 2026): 0 tests.** No había framework instalado, ni CI que
validara nada antes de desplegar.

Este documento define qué probar, con qué y en qué orden, con criterio de coste/beneficio:
no se busca cobertura alta, se busca **no romper lo que da dinero**.

## 1. Qué hay que probar primero (por riesgo × frecuencia)

| # | Área | Riesgo si falla | Dificultad |
|---|------|-----------------|-----------|
| 1 | Cálculo de totales e IVA | Cobrar mal a un cliente real | Baja |
| 2 | Descuento y restauración de stock | Vender lo que no hay | Media |
| 3 | Aislamiento multi-tenant | Filtrar datos entre clientes → fin del negocio | Baja |
| 4 | Generación del buffer ESC/POS | Ticket ilegible en un local en plena hora punta | Media |
| 5 | Reglas del servicio (turno) | Pedidos huérfanos o estadísticas erróneas | Baja |
| 6 | Autenticación y roles | Acceso indebido | Baja |
| 7 | Pedido online completo | Pérdida de ventas | Alta |

## 2. Herramientas propuestas

| Capa | Herramienta | Motivo |
|------|-------------|--------|
| Unitario (API y utilidades) | **Vitest** | Rápido, ESM nativo, misma API que Jest |
| Integración (API + BD) | **Vitest + Testcontainers** o PostgreSQL de `docker-compose` con esquema aislado | Prisma necesita una base real; simular es peor que probar de verdad |
| HTTP | **supertest** sobre el `app` exportado en `src/index.ts` | Ya se exporta `default app`, no hace falta refactor |
| Componentes React | **Vitest + Testing Library** | Solo para lógica de componentes extraídos |
| E2E | **Playwright** | Los flujos de 3 pasos son difíciles de validar de otro modo |

## 3. Fase 1 — Red de seguridad mínima (≈ 1 semana)

Objetivo: poder refactorizar sin miedo. ~30 tests.

### 3.1 Unitarios puros (sin base de datos)

```
apps/api/src/services/__tests__/printer.service.test.ts
  ✓ snapshot del buffer para 58 mm y 80 mm con un pedido completo
  ✓ sanitize() elimina tildes, ñ, ¡¿ y sustituye € por EUR
  ✓ truncate() respeta el ancho de línea
  ✓ formatCurrency() da 2 decimales y sin espacios duros
  ✓ el ticket se genera igualmente si el logo no se puede descargar
  ✓ el ticket se genera igualmente si falla el QR (cae a URL en texto)
```

El **snapshot del buffer** es el test de mayor valor de todo el proyecto: cubre código sin
cobertura, difícil de probar a mano, que rompe en campo y cuya regresión es invisible en
revisión de código.

```
apps/api/src/__tests__/totals.test.ts
  ✓ total === subtotal + tax + shippingCost para 1.000 casos aleatorios
  ✓ el IVA se aplica al subtotal y NO al envío
  ✓ recogida (isPickup) implica shippingCost = 0
```

### 3.2 Integración con base de datos

```
apps/api/src/routes/__tests__/orders.test.ts
  ✓ 409 si no hay servicio activo
  ✓ 409 con detalles si falta stock
  ✓ crear pedido descuenta stock exactamente
  ✓ dos pedidos simultáneos del último artículo: uno funciona y el otro falla
  ✓ borrar un pedido restaura el stock
  ✓ el precio queda congelado aunque cambie el del producto

apps/api/src/routes/__tests__/tenant-isolation.test.ts
  ✓ el local A no ve pedidos, productos ni clientes del local B (404, no 403)
  ✓ el token del local A no sirve contra recursos del local B
  ✓ el registro con un slug ya usado devuelve 409
```

### 3.3 Utilidades de test necesarias

- `createTestBusiness()`, `createTestUser(role)`, `authHeader(user, business)`.
- Base limpia por fichero de test (`TRUNCATE ... CASCADE` o esquema por worker).
- **Regla:** ningún test toca la base de desarrollo del equipo; se usa
  `DATABASE_URL_TEST`.

## 4. Fase 2 — Cobertura funcional (≈ 1 semana más)

```
services.test.ts     ✓ un solo servicio activo; cerrar marca DELIVERED lo no cancelado
auth.test.ts         ✓ login correcto/incorrecto, usuario sin acceso al local,
                       rol leído de la BD y no del token
products.test.ts     ✓ borrado lógico, filtros, validación Zod
public.test.ts       ✓ tienda oculta si onlineOrderEnabled = false
                     ✓ registro → verificación → login → pedido
                     ✓ pedido online rechazado si el local está cerrado
                     ✓ (tras arreglar A8) un producto sin onlineVisible no se puede pedir
stats.test.ts        ✓ los pedidos cancelados no cuentan en ningún agregado
```

## 5. Fase 3 — E2E de los recorridos que dan dinero (≈ 1 semana)

Playwright contra el entorno local completo:

1. **Comanda en menos de 30 segundos**: login → abrir servicio → cliente por teléfono →
   3 productos → pago en efectivo con cambio → crear. *Además de correcto, el test mide el
   tiempo y falla si supera un umbral.*
2. **Ciclo de estados**: `PENDING → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED` desde
   la interfaz.
3. **Pedido online**: registro con verificación (interceptando el email) → pedido →
   aparición en el dashboard → aceptación → tracking accesible por el token.

La impresión no se prueba en E2E: se intercepta `POST /api/orders/:id/print` y se comprueba
que se llamó y que el buffer no está vacío. El contenido lo cubre el snapshot de la fase 1.

## 6. Integración continua

Nuevo workflow `.github/workflows/ci.yml`, ejecutado en cada PR y en push a `main`:

```yaml
jobs:
  quality:
    services: { postgres: { image: postgres:16-alpine, ... } }
    steps:
      - typecheck  (tsc --noEmit en api y web)
      - lint       (eslint)
      - test       (vitest run)
      - build      (api y web)
```

Y **el despliegue pasa a depender de este job**: `deploy-api` con `needs: quality`. Hoy
puede desplegarse código que ni siquiera compila el frontend.

## 7. Reglas de convivencia con los tests

- Un bug corregido lleva **siempre** un test que lo reproduce; así el
  [documento de deuda técnica](11-deuda-tecnica.md) se vacía sin volver a llenarse.
- Los tests van en `__tests__/` junto al código que prueban.
- Nada de mocks de Prisma: base real, es más lento y mucho más veraz.
- Un test que falla de forma intermitente se arregla o se borra el mismo día.
- No se persigue un porcentaje de cobertura: se persiguen los siete riesgos de §1.

## 8. Primer paso concreto

```bash
cd apps/api
npm i -D vitest supertest @types/supertest
```

`vitest.config.ts` mínimo, `DATABASE_URL_TEST` en el entorno, y el primer fichero:
`src/services/__tests__/printer.service.test.ts` con el snapshot del ticket de 80 mm.
Ese único test ya justifica la instalación.
