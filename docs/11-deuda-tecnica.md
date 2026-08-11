# 11 — Deuda técnica (auditoría)

Inventario del estado real del código a **6 de agosto de 2026**, con ubicación exacta y
propuesta de arreglo. Priorización:

| Nivel | Significado |
|-------|-------------|
| **P0** | Bug visible o riesgo activo. Arreglar ya |
| **P1** | Corrección funcional o de datos. Siguiente versión |
| **P2** | Refactor estructural. Planificar |
| **P3** | Mejora de calidad de vida |

---

## P0 — ✅ Resuelto en la rama `fix/parche-p0` (2026-08-06)

### <a id="p0-bluetooth"></a>P0-1. La opción "Bluetooth" de Ajustes no se puede guardar — ✅

- **Dónde:** [`apps/api/src/routes/settings.ts`](../apps/api/src/routes/settings.ts) —
  `printerMode: z.enum(['webusb', 'printserver'])`; la UI ofrece `bluetooth`
  ([`apps/web/src/app/dashboard/settings/page.tsx:233`](../apps/web/src/app/dashboard/settings/page.tsx)).
- **Efecto:** seleccionar Bluetooth y guardar devolvía 400 → "Error guardando ajustes".
  La funcionalidad Bluetooth estaba implementada en el frontend pero era inalcanzable.
- **Arreglo aplicado:** `'bluetooth'` añadido al enum. Verificado: los tres modos se
  guardan y un valor inventado sigue devolviendo 400.

### P0-2. Código de depuración en producción — ✅

- **Dónde:** commit `0cdd2cc "debug: add print flow logging"` en
  [`apps/web/src/app/dashboard/orders/page.tsx`](../apps/web/src/app/dashboard/orders/page.tsx).
- **Arreglo aplicado:** los mensajes pasan por `printLog()`, que solo escribe si el equipo
  tiene `localStorage.debugPrint === '1'`. Soporte puede activar el diagnóstico en el local
  del cliente sin redesplegar, y el bucle de endpoints deja de ensuciar la consola con
  avisos que son normales.

### P0-3. Cambio sin commit en el árbol de trabajo — ✅

- **Dónde:** `apps/web/next.config.ts` (bloque `turbopack.root`).
- **Arreglo aplicado:** incluido en el commit del parche.

### P0-4. CORS abierto y sin rate limiting — ✅

Ver [10-seguridad.md](10-seguridad.md) A1 y A2. Resumen de lo aplicado:

- **CORS:** lista blanca desde `ALLOWED_ORIGINS`, con respaldo en el origen de `APP_URL`
  si la variable no está configurada (nunca queda abierto, nunca rompe la tienda online).
  Cabecera `Vary: Origin`. Verificado con orígenes permitido, rechazado y sin `Origin`.
- **Rate limiting:** limitador propio en memoria, sin dependencias nuevas
  ([`rate-limit.middleware.ts`](../apps/api/src/middleware/rate-limit.middleware.ts)),
  aplicado a los cuatro endpoints de autenticación.

  > **Limitación asumida:** el contador vive en el proceso, así que con N instancias de App
  > Runner el límite efectivo es N × max. Suficiente para frenar fuerza bruta; si hiciera
  > falta precisión, mover el contador a un almacén compartido.

---

## P1 — Corrección funcional

### <a id="p1-stock-cancelado"></a>P1-1. Cancelar un pedido no devuelve el stock

- **Dónde:** [`apps/api/src/routes/orders.ts`](../apps/api/src/routes/orders.ts),
  `PATCH /:id/status`. `restoreStock` solo se llama en `DELETE`.
- **Efecto:** cada cancelación descuadra el inventario permanentemente.
- **Arreglo:** al pasar a `CANCELLED` desde un estado no cancelado, restaurar stock dentro
  de una transacción y marcar el pedido para no restaurar dos veces.

### <a id="p1-permisos"></a>P1-2. `STAFF` puede borrar pedidos y editar precios

Ver [10-seguridad.md](10-seguridad.md) A3.

### P1-3. Borrado físico de pedidos

- **Dónde:** `DELETE /api/orders/:id`.
- **Efecto:** se pierde el histórico contable; las estadísticas cambian retroactivamente;
  no queda rastro de quién lo borró.
- **Arreglo:** borrado lógico (`deletedAt`, `deletedBy`) y exclusión en las consultas.

### <a id="p1-dinero"></a>P1-4. Aritmética monetaria en coma flotante

- **Dónde:** cálculo de `subtotal`/`tax`/`total` en `routes/orders.ts` y `routes/public.ts`.
- **Efecto:** descuadres de céntimos entre `total` y la suma de sus componentes.
- **Arreglo:** calcular en céntimos enteros o con `Prisma.Decimal`, redondear
  explícitamente a 2 decimales antes de persistir, y añadir un test que verifique
  `total === subtotal + tax + shippingCost` para 1.000 combinaciones aleatorias.

### P1-5. Transiciones de estado sin validar

- **Dónde:** `PATCH /orders/:id/status` acepta cualquier valor del enum.
- **Arreglo:** tabla de transiciones permitidas y 409 en las inválidas.

### P1-6. `DELETE /api/shipping-rates/:id` rompe si la tarifa está en uso

- **Efecto:** error 500 sin mensaje útil (restricción de clave foránea).
- **Arreglo:** desactivar en lugar de borrar, o comprobar uso y devolver 409.

### P1-7. Construcción frágil de la URL de tracking

- **Dónde:** [`apps/api/src/routes/orders.ts`](../apps/api/src/routes/orders.ts):
  `process.env.APP_URL?.replace(':4000', ':3000').replace('/api', '')`.
- **Efecto:** en cualquier entorno donde el frontend no esté en el puerto 3000, el enlace
  del email es incorrecto.
- **Arreglo:** variable `WEB_URL` explícita (ya existe en `.env` sin usarse) y usarla en
  todos los sitios (ticket, emails, verificación).

### P1-8. Emails sin reintento ni cola

- **Dónde:** `sendOrderConfirmedEmail(...).catch(console.error)`.
- **Arreglo:** tabla `outbox` con reintentos, o proveedor con webhooks de entrega.

### <a id="p1-remitente"></a>P1-8b. El remitente de los emails era el de un local concreto — ✅ corregido

- **Dónde:** [`apps/api/src/services/email.service.ts`](../apps/api/src/services/email.service.ts):
  `const FROM = process.env.SMTP_FROM ?? ...`. En producción esa variable valía
  `Cocino Yo <juanma@puntojs.com>`, es decir, **el nombre de uno de los locales**.
- **Efecto:** un cliente que se registraba en la tienda de otro local recibía la
  verificación de su cuenta firmada por "Cocino Yo".
- **Arreglo aplicado:** el remitente se construye como
  `"<nombre del local> vía Olyda" <dirección de la plataforma>`. La dirección sale de
  `MAIL_FROM_ADDRESS` y, si no existe, de `SMTP_FROM`, para poder desplegar antes de tener
  el buzón. El nombre del local se limpia antes de meterlo en la cabecera (lo escribe el
  propio cliente: inyección de cabeceras) y se escapa en el HTML.
- **Queda pendiente:** `Business` no tiene columna de email, así que el `Reply-To` solo
  puede ser de plataforma (`MAIL_REPLY_TO`). Para que las respuestas lleguen al local hace
  falta añadir `Business.email` y pasarlo a las dos funciones de envío.

### P1-8c. Configuración de SMTP fuera de Terraform y contraseña en claro — ✅ corregido

El correo pasa a enviarse con la **API de SES autorizada por el rol de instancia**: no hay
credencial que gestionar, así que el problema desaparece en vez de mitigarse. Terraform
gestiona ahora toda la configuración de correo (`infra/ses.tf`). Detalle en
[09-despliegue.md §3 bis](09-despliegue.md#3-bis-correo-saliente-con-amazon-ses).

**Queda pendiente, y es cosa de la cuenta de Microsoft, no del código:** revocar la
contraseña de aplicación antigua, que ya no se usa pero sigue siendo válida.

### <a id="p1-amplify"></a>P1-8d. `terraform apply` desconectaba Amplify de GitHub — ✅ corregido

Descubierto al ejecutar `terraform plan` el 2026-08-06: el recurso `aws_amplify_app.web`
no conoce el repositorio (la conexión se hizo por consola), así que cada `apply` habría
puesto `repository = null` y el frontend habría dejado de desplegarse en silencio.
Corregido con `lifecycle { ignore_changes = [repository, oauth_token, access_token] }`.

### P1-9. `printedAt` se marca antes de imprimir de verdad

- **Efecto:** si falla el transporte, el `print-agent` nunca reintenta ese pedido.
- **Arreglo:** confirmar la impresión desde el cliente (`POST /orders/:id/printed`) o
  reintentar tras N segundos sin confirmación.

### P1-10. Sin índice sobre `orders.createdAt`

- **Efecto:** `GET /orders` (ordena por `createdAt`) y `/stats/period` degradan con
  volumen.
- **Arreglo:** `@@index([businessId, createdAt])`.

### P1-11. Falta `.env.example`

El README pide `cp .env.example apps/api/.env` y **el fichero no existe**. Ver el añadido en
la raíz del repositorio.

### P1-12. Invariante "un servicio activo" solo a nivel de aplicación

- **Arreglo:** índice único parcial en PostgreSQL (SQL en
  [03-modelo-datos.md](03-modelo-datos.md#service--turno-de-trabajo)).

---

## P2 — Refactor estructural

### <a id="p2-cliente-api"></a>P2-1. No hay cliente de API en el frontend

`apiHeaders()` y `const API = ''` están **copiados en todas las páginas** del dashboard, y
cada página maneja los errores a su manera. No hay redirección consistente a `/login` ante
un 401.

**Arreglo:** `apps/web/src/lib/api.ts` con `apiFetch<T>()`, manejo central de 401, tipos de
respuesta y `AbortController`.

### P2-2. `packages/shared-types` está vacío

Las interfaces (`Order`, `Product`, `Customer`…) se redeclaran a mano en cada página del
frontend y pueden desincronizarse del backend en silencio.

**Arreglo:** exportar tipos derivados de Prisma (`Prisma.OrderGetPayload<...>`) y los
esquemas Zod compartidos desde el paquete.

### P2-3. Páginas monolíticas

| Fichero | Líneas |
|---------|--------|
| `dashboard/orders/new/page.tsx` | 1.089 |
| `dashboard/orders/page.tsx` | 922 |
| `[slug]/pedidos/page.tsx` | 888 |
| `dashboard/stats/page.tsx` | 744 |
| `dashboard/settings/page.tsx` | 541 |

`src/components/order/` y `src/components/ui/` **existen y están vacías**.

**Arreglo:** extraer por bloques, empezando por lo reutilizable (selector de cliente,
carrito, tarjeta de pedido, badge de estado, funciones de impresión que hoy están
duplicadas entre `orders/page.tsx` y `orders/new/page.tsx`).

### P2-4. Dos sistemas de estilo conviviendo

Tailwind v4 instalado + variables CSS + estilos inline masivos. Decide uno.
Recomendación: clases utilitarias sobre las variables ya definidas, migrando página a
página, sin big bang.

### P2-5. Estadísticas calculadas en memoria

`GET /stats/product/:id` y `/stats/categories` traen todos los `orderItem` del histórico y
agregan en JavaScript, con búsquedas `orders.find()` dentro de bucles.

**Arreglo:** SQL agregado con `GROUP BY` y filtro de fechas obligatorio.

### P2-6. Polling en lugar de push

Dashboard y `print-agent` consultan periódicamente. Un pedido online puede tardar segundos
en aparecer y se generan peticiones constantes por cada local abierto.

**Arreglo:** SSE (`GET /api/orders/stream`) — más simple que WebSocket y suficiente aquí.

### P2-7. Dependencias muertas

En `apps/api/package.json`: `cors`, `multer` y `thermal-printer-encoder` **no se usan**
(el CORS es manual y no hay subida de ficheros). Eliminar.

### ~~P2-8. Estado de Terraform en local~~ — no aplica

Comprobado el 2026-08-06: el estado **ya está en S3 con bloqueo en DynamoDB**
(`comandapro-terraform-state-839380010537`, tabla `comandapro-terraform-locks`, cifrado).
El `infra/terraform.tfstate` que queda en la carpeta es un fichero de 0 bytes, residuo de
la migración del 21/04/2026; el `.backup` es la copia previa.

Lo que sí queda pendiente es la **deriva** entre lo declarado y lo que hay desplegado:
ver [09-despliegue.md](09-despliegue.md#-deriva-entre-terraform-y-el-servicio-vivo).

### P2-9. Sin migraciones reales

Solo existe `20260511121906_init`; el resto del esquema se aplicó con `db push`.
El historial no reproduce la base de producción.

**Arreglo:** generar una migración de "línea base" comparando con producción
(`prisma migrate diff`) y prohibir `db push` fuera de desarrollo.

---

## P3 — Calidad de vida

- **Cero tests.** Ver [13-testing.md](13-testing.md).
- **Sin CI de calidad:** el único workflow despliega. No hay `tsc --noEmit` ni lint en PR.
- **Sin observabilidad:** solo `morgan`. Sin métricas, trazas ni alertas.
- **Historial de commits ruidoso:** mensajes duplicados consecutivos y commits
  "trigger deploy". Ver convenciones en [08-entorno-desarrollo.md](08-entorno-desarrollo.md).
- **`.agent/rules/agents.md` describe un equipo ficticio** con procesos (Slack, Jira,
  sprints) que no existen. Mantenerlo desactualizado confunde; esta carpeta `docs/` lo
  sustituye como fuente de verdad.
- **Marca inconsistente:** el código se llama ComandaPro, la interfaz dice Olyda, los
  emails firman "ComandaPro". Unificar.
- **`printerMode` no gobierna nada en el backend**, y `printServerUrl` no se consulta.
- **README desactualizado** (menciona Vercel y Express con `cors`, y un `.env.example`
  inexistente).

---

## Resumen ejecutivo

| Bloque | Esfuerzo estimado | Impacto |
|--------|-------------------|---------|
| P0 completo | 1 día | Elimina un bug visible y dos riesgos de seguridad |
| P1 completo | 1–2 semanas | Integridad de datos y de dinero |
| P2-1 + P2-2 + P2-3 | 2–3 semanas | Base para poder desarrollar rápido de nuevo |
| Tests mínimos (13-testing) | 1 semana | Permite refactorizar sin miedo |
| Bloque SaaS (12-roadmap) | 4–6 semanas | Requisito para vender |

**Recomendación:** P0 → tests mínimos de los flujos críticos → P1 → P2. Refactorizar antes
de tener red de seguridad es la forma más rápida de romper la producción de un local que
está sirviendo pedidos.
