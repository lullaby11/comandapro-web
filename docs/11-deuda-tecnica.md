# 11 — Deuda técnica (auditoría)

Inventario del estado real del código a **11 de agosto de 2026**, con ubicación exacta y
propuesta de arreglo. Priorización:

| Nivel | Significado |
|-------|-------------|
| **P0** | Bug visible o riesgo activo. Arreglar ya |
| **P1** | Corrección funcional o de datos. Siguiente versión |
| **P2** | Refactor estructural. Planificar |
| **P3** | Mejora de calidad de vida |

---

## P0 — ✅ Resuelto en la rama `fix/parche-p0` (2026-08-11)

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

### <a id="p1-stock-cancelado"></a>P1-1. Cancelar un pedido no devuelve el stock — ✅ corregido en v1.1

- **Dónde:** [`apps/api/src/routes/orders.ts`](../apps/api/src/routes/orders.ts),
  `PATCH /:id/status`. `restoreStock` solo se llama en `DELETE`.
- **Efecto:** cada cancelación descuadra el inventario permanentemente.
- **Arreglo:** al pasar a `CANCELLED` desde un estado no cancelado, restaurar stock dentro
  de una transacción y marcar el pedido para no restaurar dos veces.

### <a id="p1-permisos"></a>P1-2. `STAFF` puede borrar pedidos y editar precios — ✅ corregido

Ver [10-seguridad.md](10-seguridad.md) A3.

**Arreglo aplicado.** El borrado de pedidos exige administración desde v1.1. Los precios se
cerraron después, con una autorización **por campo y no por ruta**:

| Acción | STAFF | ADMIN / OWNER |
|--------|:-----:|:-------------:|
| Ver el catálogo | ✅ | ✅ |
| **Ajustar stock** | ✅ | ✅ |
| Cambiar el precio | ❌ | ✅ |
| Renombrar, recategorizar, ocultar o publicar online | ❌ | ✅ |
| Crear un producto | ❌ | ✅ |
| Retirar un producto | ❌ | ✅ |

Dos decisiones que conviene no deshacer por descuido:

- **El stock se queda abierto al personal a propósito.** Se repone a diario, y el flujo de
  nueva comanda incluye un modal para ajustarlo sin salir del pedido. Bloquear la ruta
  entera —que era lo cómodo— habría dejado al personal sin poder cerrar un pedido cuando
  falta género.
- **Crear producto exige administración** aunque la petición no sea una "edición de
  precio": crear es fijar un precio, y sin esa restricción la regla se saltaría creando un
  duplicado más barato.

Si un empleado envía precio y stock en la misma petición, **no se aplica nada**: ni
siquiera la parte permitida. Es preferible a un cambio a medias que nadie esperaba.

La interfaz oculta lo que la API va a rechazar y explica al personal qué sí puede hacer,
en lugar de dejar botones que devuelven 403.

### P1-3. Borrado físico de pedidos — ✅ corregido en v1.1

- **Dónde:** `DELETE /api/orders/:id`.
- **Efecto:** se pierde el histórico contable; las estadísticas cambian retroactivamente;
  no queda rastro de quién lo borró.
- **Arreglo:** borrado lógico (`deletedAt`, `deletedBy`) y exclusión en las consultas.

### <a id="p1-dinero"></a>P1-4. Aritmética monetaria en coma flotante — ✅ corregido en v1.1

- **Dónde:** cálculo de `subtotal`/`tax`/`total` en `routes/orders.ts` y `routes/public.ts`.
- **Efecto:** descuadres de céntimos entre `total` y la suma de sus componentes.
- **Arreglo:** calcular en céntimos enteros o con `Prisma.Decimal`, redondear
  explícitamente a 2 decimales antes de persistir, y añadir un test que verifique
  `total === subtotal + tax + shippingCost` para 1.000 combinaciones aleatorias.

### P1-5. Transiciones de estado sin validar — ✅ corregido en v1.1

- **Dónde:** `PATCH /orders/:id/status` acepta cualquier valor del enum.
- **Arreglo:** tabla de transiciones permitidas y 409 en las inválidas.

### P1-6. `DELETE /api/shipping-rates/:id` rompe si la tarifa está en uso — ✅ corregido

- **Efecto:** error 500 sin mensaje útil (restricción de clave foránea).
- **Arreglo aplicado:** si algún pedido la referencia, la tarifa **se desactiva** en lugar
  de borrarse —deja de ofrecerse en pedidos nuevos y el histórico se conserva—; si no la
  usa nadie, se borra de verdad. El listado omite las desactivadas, así que para quien
  gestiona el local el resultado es el mismo: desaparece.

### P1-7. Construcción frágil de la URL de tracking — ✅ corregido

- **Dónde:** [`apps/api/src/routes/orders.ts`](../apps/api/src/routes/orders.ts):
  `process.env.APP_URL?.replace(':4000', ':3000').replace('/api', '')`.
- **Efecto:** en cualquier entorno donde el frontend no esté en el puerto 3000, el enlace
  del email es incorrecto.
- **Arreglo aplicado:** se usa `APP_URL` tal cual, que ya apunta al frontend —lo exige el
  arranque y de ahí sale también la lista de CORS—. No hizo falta variable nueva: el
  `replace` era el resto de una época en que `APP_URL` se confundía con la URL de la API.

### P1-8. Emails sin reintento ni cola — ✅ corregido

- **Dónde:** `sendOrderConfirmedEmail(...).catch(console.error)`.
- **Efecto:** un fallo puntual del proveedor perdía el correo para siempre. En el de
  verificación de cuenta, eso deja al cliente sin poder completar el registro, sin saber
  por qué y sin forma de reintentarlo.
- **Arreglo aplicado:** tabla `email_outbox`. Todo correo se persiste **antes** de
  intentar enviarlo; si falla, se reintenta con espera creciente (1, 5, 15 y 60 minutos,
  cinco intentos) y queda registrado el motivo del último fallo. El reintento corre en el
  propio proceso de la API cada minuto.

  > **Si algún día hay varias instancias de App Runner**, conviene mover ese bucle a un
  > worker único: de lo contrario competirían por los mismos registros.

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
- **Completado el 12/08/2026:** `Business.email` permite que el `Reply-To` sea el buzón del
  local. Cuando un cliente responde a la confirmación de su pedido, la respuesta llega a
  quien le está haciendo la comida y no al soporte de la plataforma. Si el local no lo
  configura, se sigue usando `MAIL_REPLY_TO`, que es mejor que un agujero negro.

  El `Reply-To` se persiste **en el buzón de salida junto al mensaje**: un reintento
  posterior conserva el buzón con el que se encoló, aunque el local lo haya cambiado
  entretanto.

### P1-8c. Configuración de SMTP fuera de Terraform y contraseña en claro — ✅ corregido

El correo pasa a enviarse con la **API de SES autorizada por el rol de instancia**: no hay
credencial que gestionar, así que el problema desaparece en vez de mitigarse. Terraform
gestiona ahora toda la configuración de correo (`infra/ses.tf`). Detalle en
[09-despliegue.md §3 bis](09-despliegue.md#3-bis-correo-saliente-con-amazon-ses).

**Queda pendiente, y es cosa de la cuenta de Microsoft, no del código:** revocar la
contraseña de aplicación antigua, que ya no se usa pero sigue siendo válida.

### <a id="p1-amplify"></a>P1-8d. `terraform apply` desconectaba Amplify de GitHub — ✅ corregido

Descubierto al ejecutar `terraform plan` el 2026-08-11: el recurso `aws_amplify_app.web`
no conoce el repositorio (la conexión se hizo por consola), así que cada `apply` habría
puesto `repository = null` y el frontend habría dejado de desplegarse en silencio.
Corregido con `lifecycle { ignore_changes = [repository, oauth_token, access_token] }`.

### P1-9. `printedAt` se marca antes de imprimir de verdad — ✅ corregido

- **Efecto:** si falla el transporte, el pedido constaba como impreso sin haber salido
  papel, y el `print-agent` nunca lo reintentaba.
- **Arreglo aplicado:** se separan dos momentos. `printRequestedAt` registra que se pidió
  el buffer; `printedAt` solo se marca cuando quien imprime confirma con
  `POST /orders/:id/printed` —el panel tras un envío correcto por WebUSB o Bluetooth, el
  agente tras entregar el trabajo a CUPS—.

  El filtro `notPrinted` pasa a ser "sin confirmar **y** sin intento en los últimos 90
  segundos". Ese margen es la pieza clave: sin él, el agente reimprimiría el mismo pedido
  en cada vuelta mientras el trabajo está en camino; con él, un intento que se quedó a
  medias se reintenta solo.

### P1-10. Sin índice sobre `orders.createdAt` — ✅ corregido en v1.1

- **Efecto:** `GET /orders` (ordena por `createdAt`) y `/stats/period` degradan con
  volumen.
- **Arreglo:** `@@index([businessId, createdAt])`.

### P1-11. Falta `.env.example`

El README pide `cp .env.example apps/api/.env` y **el fichero no existe**. Ver el añadido en
la raíz del repositorio.

### P1-12. Invariante "un servicio activo" solo a nivel de aplicación — ✅ corregido en v1.1

- **Arreglo:** índice único parcial en PostgreSQL (SQL en
  [03-modelo-datos.md](03-modelo-datos.md#service--turno-de-trabajo)).

---

## P2 — Refactor estructural

### <a id="p2-cliente-api"></a>P2-1. No hay cliente de API en el frontend — ✅ corregido

`apiHeaders()` y `const API = ''` están **copiados en todas las páginas** del dashboard, y
cada página maneja los errores a su manera. No hay redirección consistente a `/login` ante
un 401.

**Arreglo aplicado:** `apps/web/src/lib/api.ts`. Las 51 llamadas del panel pasan por él y
**el 401 se trata en un solo sitio**: cierra la sesión y lleva al login conservando a dónde
se iba. Antes, con la sesión caducada, las pantallas se quedaban vacías sin explicar nada.

Se expone `apiRes()`, que devuelve la `Response` cruda con la autenticación puesta, además
de `api<T>()`. Migrar de golpe las pantallas que ya tienen su propia lógica de `res.ok` y
sus mensajes habría sido reescribir su manejo de errores, y eso es un cambio de
comportamiento, no una limpieza.

### P2-2. `packages/shared-types` está vacío — ✅ corregido

Las interfaces (`Order`, `Product`, `Customer`…) se redeclaran a mano en cada página del
frontend y pueden desincronizarse del backend en silencio.

**Arreglo aplicado**, pero **no** derivando de Prisma: habría sido introducir un error
nuevo. Prisma serializa los `Decimal` como string y las fechas como texto ISO, así que sus
tipos no describen lo que viaja por HTTP —de hecho el frontend declaraba `total: number`
recibiendo un string, y de ahí los `Number(...)` defensivos repartidos por el código—.

El paquete define dos niveles: los tipos `…DTO` describen el formato de cable, y los de
dominio lo que usa la interfaz. **La conversión ocurre una sola vez**, en el cliente de API.

Se consume por `paths` de TypeScript y no como dependencia de npm: son tipos puros que
desaparecen al compilar, así que encajan con el `npm install --no-workspaces` de cada app.
Verificado que el build de Amplify lo resuelve, que es donde este tipo de cambio ha roto
antes.

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

### P2-5. Estadísticas calculadas en memoria — ✅ corregido

`GET /stats/product/:id` y `/stats/categories` traen todos los `orderItem` del histórico y
agregan en JavaScript, con búsquedas `orders.find()` dentro de bucles.

**Arreglo aplicado:** ambas consultas pasan a SQL agregado. La de producto tenía un
`orders.find()` dentro de un bucle —cuadrático— y la de categorías traía todos los items
del histórico para agruparlos con dos `Map`. Los diez productos más vendidos de cada
categoría salen ahora de una función de ventana, en una sola consulta.

Se añaden 7 tests que fijan el resultado —agrupación, orden, exclusión de cancelados y
borrados, y aislamiento entre locales—, que antes no existían.

### P2-6. Polling en lugar de push

Dashboard y `print-agent` consultan periódicamente. Un pedido online puede tardar segundos
en aparecer y se generan peticiones constantes por cada local abierto.

**Arreglo:** SSE (`GET /api/orders/stream`) — más simple que WebSocket y suficiente aquí.

### P2-7. Dependencias muertas — ✅ corregido

En `apps/api/package.json`: `cors`, `multer` y `thermal-printer-encoder` **no se usaban**
(el CORS es manual y no hay subida de ficheros). Eliminadas, junto con sus `@types`.

### ~~P2-8. Estado de Terraform en local~~ — no aplica

Comprobado el 2026-08-11: el estado **ya está en S3 con bloqueo en DynamoDB**
(`comandapro-terraform-state-839380010537`, tabla `comandapro-terraform-locks`, cifrado).
El `infra/terraform.tfstate` que queda en la carpeta es un fichero de 0 bytes, residuo de
la migración del 21/04/2026; el `.backup` es la copia previa.

Lo que sí queda pendiente es la **deriva** entre lo declarado y lo que hay desplegado:
ver [09-despliegue.md](09-despliegue.md#-deriva-entre-terraform-y-el-servicio-vivo).

### P2-9. Sin migraciones reales — ⚠️ mitigado, no resuelto

Solo existe `20260511121906_init`; el resto del esquema se aplicó con `db push`.
El historial no reproduce la base de producción.

**Esto tumbó el despliegue del 11/08/2026:** `prisma migrate deploy` abortó con `P3005`
("database schema is not empty") y el contenedor entró en bucle de reinicio. Se mitigó
haciendo el *baseline* de la migración inicial desde el `CMD` del Dockerfile
(`migrate resolve --applied`), que es el procedimiento que documenta Prisma.

**El baseline está verificado (12/08/2026):** se restauró el snapshot previo al despliegue
en una instancia temporal aislada y se comparó con `prisma migrate diff`. Resultado en las
tres direcciones:

| Comparación | Resultado |
|-------------|-----------|
| `prisma/migrations` → `schema.prisma` | Sin diferencias |
| `prisma/migrations` → **esquema real de producción** | **Sin diferencias** |
| Esquema real de producción → `schema.prisma` | Sin diferencias |

La migración `init` describe fielmente lo que hay en producción, así que marcarla como
aplicada fue correcto y **las próximas migraciones partirán de una base fiable**.

**Lo que queda de esta deuda es de proceso, no de datos:** prohibir `db push` fuera de
desarrollo y generar siempre migración versionada, para que el historial no vuelva a
divergir. Ver [08-entorno-desarrollo.md](08-entorno-desarrollo.md).

<details>
<summary>Cómo repetir la verificación sin tocar producción</summary>

RDS no es accesible desde fuera de la VPC y no hay bastión, así que se restaura un snapshot
en una instancia temporal en la **VPC por defecto** (aislada de la de producción), con un
grupo de seguridad que solo admite tu IP:

```bash
aws rds create-db-subnet-group --db-subnet-group-name verificacion-temp \
  --db-subnet-group-description temporal --subnet-ids <subredes de la VPC por defecto>

aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier comandapro-verificacion-esquema \
  --db-snapshot-identifier <snapshot> \
  --db-instance-class db.t3.micro --no-multi-az --publicly-accessible \
  --vpc-security-group-ids <sg-solo-tu-ip> --db-subnet-group-name verificacion-temp

npx prisma migrate diff --from-migrations ./prisma/migrations \
  --to-url "<url de la instancia temporal>" \
  --shadow-database-url "<postgres local vacío>" --exit-code
```

La contraseña sale de SSM (`/comandapro/prod/DATABASE_URL`) a una variable de shell; no la
imprimas ni la guardes en ficheros. Al terminar: borra instancia, grupo de subredes y grupo
de seguridad. Coste total: unos céntimos y ~15 minutos.

</details>

---

## P3 — Calidad de vida

- ~~**Cero tests.**~~ ✅ 94 tests desde v1.1. Ver [13-testing.md](13-testing.md).
- ~~**Sin CI de calidad.**~~ ✅ Desde v1.1 hay un workflow que comprueba tipos, tests y lint, y del que depende el despliegue.
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
