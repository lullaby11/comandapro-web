# 04 — Referencia de API

Base URL local: `http://localhost:4000` · Producción: App Runner (ver `NEXT_PUBLIC_API_URL`).
Desde el frontend se llama siempre en relativo (`/api/...`) gracias al rewrite de Next.

## 0. Convenciones

### Autenticación

Tres niveles:

| Nivel | Cabecera | Middleware | Contenido del JWT |
|-------|----------|-----------|-------------------|
| **Staff** | `Authorization: Bearer <jwt>` | `authMiddleware` | `{ userId, businessId, role }`, 7 días |
| **Cliente online** | `Authorization: Bearer <jwt>` | `customerAuthMiddleware` | `{ customerAccountId, businessId }`, 30 días |
| **Público** | — | — | — |

`authMiddleware` revalida en BD que el `BusinessUser` existe y **usa el rol de la BD**, no
el del token. `customerAuthMiddleware` solo verifica la firma (no comprueba que la cuenta
siga existiendo o verificada).

### Errores

| Código | Cuándo |
|--------|--------|
| `400` | Validación Zod fallida → `{ error: <flatten() de Zod> }` |
| `401` | Falta token, token inválido o credenciales incorrectas |
| `403` | Sin acceso al local, o sin rol de administrador, o email sin verificar |
| `404` | Recurso inexistente **o de otro tenant** (no se distingue, a propósito) |
| `409` | Conflicto de negocio: stock, slug/email duplicado, sin servicio activo |
| `429` | Límite de intentos superado en autenticación → `{ error, retryAfter }` + cabecera `Retry-After` |
| `500` | `{ error: "Error interno del servidor" }` en producción; el mensaje real en dev |

### Límites de peticiones

| Endpoint | Límite | Clave |
|----------|--------|-------|
| `POST /api/auth/login` · `POST /api/public/:slug/auth/login` | 10 **fallidos** / 15 min | email |
| `POST /api/auth/register` · `POST /api/public/:slug/auth/register` | 5 / hora | IP |

Los inicios de sesión correctos no consumen cupo. Ver
[10-seguridad.md](10-seguridad.md#-a2--sin-límite-de-intentos-de-autenticación--resuelto-2026-08-06).

> ⚠️ Los errores lanzados desde una transacción (p. ej. `deductStock` por condición de
> carrera) llegan al handler global y se devuelven como **500**, no como 409.

### Formato de dinero

Los campos `Decimal` de Prisma se serializan como **string** en JSON (`"12.50"`) salvo
cuando la ruta los convierte explícitamente con `Number()`. El frontend usa `Number(x)`
defensivamente. No asumas tipo: normaliza siempre en el cliente.

---

## 1. `/api/auth` — autenticación de staff

### `POST /api/auth/login` 🔓

```json
{ "email": "admin@pizzeria-bella.com", "password": "admin1234", "businessSlug": "pizzeria-bella" }
```

**200**
```json
{
  "token": "eyJ...",
  "user": { "id": "c...", "name": "Giovanni Rossi", "email": "...", "role": "OWNER" },
  "business": { "id": "c...", "name": "Pizzería Bella Italia", "slug": "pizzeria-bella" }
}
```
**401** local no encontrado / credenciales incorrectas · **403** el usuario no pertenece al local.

### `POST /api/auth/register` 🔓

Crea `Business` + `User` + `BusinessUser(OWNER)` en una transacción y devuelve token.

```json
{ "businessName": "Mi Pizzería", "businessSlug": "mi-pizzeria",
  "userName": "Ana", "email": "ana@x.com", "password": "12345678" }
```

`businessSlug`: `^[a-z0-9-]+$`, 2-50. `password`: mínimo 8.
**409** si el slug o el email ya existen.

---

## 2. `/api/services` — turnos 🔒 staff

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/active` | `{ service: Service \| null }` |
| `POST` | `/start` | **201** `{ service }` · **409** si ya hay uno activo |
| `POST` | `/end` | Cierra el servicio y marca como `DELIVERED` todos sus pedidos no cancelados · **404** si no hay activo |

---

## 3. `/api/orders` — pedidos 🔒 staff

### `GET /api/orders`

Query: `status`, `page` (1), `limit` (20), `notPrinted=true`.

**Filtra únicamente por el servicio activo.** Si no hay servicio activo, usa el
`serviceId` centinela `'__no_service__'` y devuelve vacío. Los pedidos con estado
`RECEIVED_ONLINE` se incluyen siempre, aunque pertenezcan a otro servicio.

```json
{ "orders": [{ "...": "...", "customer": {"name","phone"}, "items": [{"product": {"name"}}] }],
  "total": 12, "page": 1, "limit": 20 }
```

### `GET /api/orders/:id`
Detalle con `customer`, `items.product` y datos del `business`. **404** si es de otro tenant.

### `POST /api/orders`

```jsonc
{
  "customerId": "c...",            // cuid, obligatorio
  "items": [{ "productId": "c...", "quantity": 2 }],   // mínimo 1
  "isPickup": false,
  "deliveryAddress": "Calle X 1",
  "notes": "Sin cebolla",
  "estimatedDeliveryAt": "2026-08-06T20:30:00.000Z",   // ISO datetime
  "paymentMethod": "CASH",         // CASH | CARD
  "cashGiven": 20.0,
  "shippingRateId": "c..."
}
```

Orden de validación: servicio activo → stock → precios → tarifa → transacción
(descuento de stock + inserción). **201** devuelve el pedido con relaciones.

Errores: **409** `{ error: "No hay ningún servicio activo..." }` ·
**409** `{ error: "Stock insuficiente", details: [{productId, productName, available, requested}] }` ·
**400** tarifa de envío no válida.

### `PATCH /api/orders/:id/status`

```json
{ "status": "PREPARING" }
```
Enum: `RECEIVED_ONLINE | PENDING | PREPARING | READY | OUT_FOR_DELIVERY | DELIVERED | CANCELLED`.

**No hay validación de transiciones**: se puede saltar de `PENDING` a `DELIVERED`.
Efecto lateral: al pasar `RECEIVED_ONLINE → PENDING`, si el pedido tiene `customerAccount`,
se envía email de confirmación (fire-and-forget).

### `DELETE /api/orders/:id`

Borrado **físico** del pedido y sus items, restaurando el stock. **204**.
No verifica el estado ni conserva histórico → afecta a las estadísticas retroactivamente.

### `POST /api/orders/:id/print`

Genera el buffer ESC/POS, marca `printedAt` y devuelve binario:

```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="comanda-<id>.bin"
```

Consumirlo con `await res.arrayBuffer()` → `new Uint8Array(...)`.
**500** `{ error: "Error generando ticket de impresión" }` si falla la generación
(logo inaccesible, QR, etc.).

---

## 4. `/api/products` 🔒 staff

| Método | Ruta | Notas |
|--------|------|-------|
| `GET` | `/` | Query `category`, `active`. Orden: categoría, nombre |
| `GET` | `/:id` | |
| `POST` | `/` | `{name, description?, price>0, stock>=0, imageUrl?(url), category?, active=true, onlineVisible=false}` |
| `PATCH` | `/:id` | Esquema parcial. También se usa para reponer stock |
| `DELETE` | `/:id` | **Soft delete**: `active = false`. **204** |

> Sin `requireAdmin`: cualquier `STAFF` puede crear y desactivar productos.

---

## 5. `/api/customers` 🔒 staff

| Método | Ruta | Notas |
|--------|------|-------|
| `GET` | `/?phone=&name=&page=&limit=` | `contains` en teléfono, `insensitive` en nombre → `{customers, total}` |
| `GET` | `/pending-online` | Cuentas `CustomerAccount` con `emailVerified = false` |
| `GET` | `/by-phone/:phone` | Búsqueda **exacta**, la del flujo rápido. **404** si no existe |
| `POST` | `/` | `{name, phone, email?, address?, notes?}` · **409** con el cliente existente en el cuerpo |
| `PUT` | `/:id` | Actualización parcial (pese al verbo `PUT`) |

---

## 6. `/api/shipping-rates` 🔒 staff (escritura: ADMIN/OWNER)

| Método | Ruta | Rol |
|--------|------|-----|
| `GET` | `/` | staff |
| `POST` | `/` | admin — `{name, price>=0}` |
| `PATCH` | `/:id` | admin — `{name?, price?, active?}` |
| `DELETE` | `/:id` | admin — borrado físico (**falla si hay pedidos que la usan**) |

---

## 7. `/api/settings` 🔒 staff (escritura: ADMIN/OWNER)

- `GET /` → objeto `Business` completo.
- `PATCH /` → `{name?, logoUrl?(url|null), phone?, address?, paperWidth?("58"|"80" como string), printerMode?("webusb"|"bluetooth"|"printserver"), printServerUrl?(url|null), currency?(3 chars), taxRate?(0-100), onlineOrderEnabled?}`

> `paperWidth` se envía como **string** y se transforma a número con Zod. Es fácil
> equivocarse enviando `80` numérico → 400.

---

## 8. `/api/stats` 🔒 staff

| Ruta | Devuelve |
|------|----------|
| `GET /services` | Lista de servicios con `orderCount` y `totalRevenue` |
| `GET /service/:id` | `{service, summary:{totalRevenue,totalOrders,deliveries,pickups}, topProducts[15]}` |
| `GET /customer/:id` | `{customer, summary:{totalOrders,totalSpent,avgTicket}, ordersByPrice, ordersByDate}` |
| `GET /product/:id` | `{product, summary:{totalSold,totalRevenue}, topCustomers[15]}` |
| `GET /categories` | Agregado por categoría con top 10 productos de cada una |
| `GET /period?groupBy=day\|week\|month&from=YYYY-MM-DD&to=YYYY-MM-DD` | Serie temporal + top 10 productos. Por defecto últimos 30 días |

Todas excluyen pedidos `CANCELLED`. `GET /period` usa SQL crudo con `DATE_TRUNC`
(el `groupBy` se valida contra una lista blanca antes de interpolarlo).

> `/customer/:id`, `/product/:id` y `/categories` **no aceptan rango de fechas** y agregan
> todo el histórico en memoria. Se degradarán con volumen.

---

## 9. `/api/tracking/:token` 🔓 público

Devuelve una proyección segura del pedido (sin datos internos):

```json
{ "id", "status", "isPickup", "createdAt", "updatedAt", "estimatedDeliveryAt",
  "customerName", "deliveryAddress",
  "business": { "name", "logoUrl", "phone" },
  "items": [{ "productName", "productImage", "quantity", "subtotal" }],
  "total": 24.5 }
```

El token es un cuid de 25 caracteres: no enumerable en la práctica, pero **quien tenga el
enlace ve nombre y dirección del cliente**. No caduca.

---

## 10. `/api/public/:slug` — tienda online

| Método | Ruta | Auth | Notas |
|--------|------|------|-------|
| `GET` | `/:slug` | 🔓 | `{business:{name,logoUrl,address}, serviceActive}` · **404** si `onlineOrderEnabled = false` |
| `GET` | `/:slug/products` | 🔓 | Solo `active && onlineVisible && stock > 0` |
| `GET` | `/:slug/shipping-rates` | 🔓 | Tarifas activas |
| `POST` | `/:slug/auth/register` | 🔓 | `{name, phone, email, address, password(min 6)}` → envía email de verificación. **201** sin token |
| `POST` | `/:slug/auth/verify-email` | 🔓 | `{token}` → **200** `{token(JWT 30d), name, email, address}` |
| `POST` | `/:slug/auth/login` | 🔓 | **403** `{code:"EMAIL_UNVERIFIED"}` si falta verificar |
| `POST` | `/:slug/orders` | 🔒 cliente | Crea pedido con estado `RECEIVED_ONLINE` → `{id, trackingToken, ref}` |

Al crear el pedido online, si no existe un `Customer` con ese teléfono en el local, se crea
automáticamente a partir de los datos de la cuenta.

**409** `{ error: "El comercio está cerrado en este momento." }` si no hay servicio activo.

---

## 11. `/health` 🔓

`{ "status": "ok", "ts": "2026-08-06T..." }`. Lo usa App Runner como health check.

---

## 12. Huecos conocidos de la API

- No hay `GET /api/users` ni endpoints para invitar staff.
- No hay `DELETE`/`PATCH` de clientes ni de cuentas online.
- No hay paginación en `/api/products` ni en `/api/stats/*`.
- No hay versionado de API (`/api/v1`), lo que complicará romper contratos más adelante.
- No hay idempotencia en `POST /api/orders`.
