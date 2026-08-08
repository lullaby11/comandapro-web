# 01 — Visión de producto

## 1. El problema

Los locales pequeños de comida a domicilio (pizzerías, kebabs, hamburgueserías, comida
asiática) gestionan los pedidos con papel, WhatsApp y una caja registradora. Los problemas
recurrentes:

- El pedido se toma por teléfono y hay que **apuntarlo a mano** mientras el cliente habla.
- Se pierde el histórico: no se sabe qué cliente pide más, ni qué producto es rentable.
- La comanda para cocina se escribe a mano o se imprime desde un TPV caro y cerrado.
- Cuando llega el pedido online (Glovo/Just Eat) el margen se hunde por comisiones.

## 2. La propuesta

**ComandaPro** (marca comercial actual: **Olyda**) es una aplicación web que sustituye ese
flujo por uno digital, con tres promesas:

1. **Tomar un pedido en menos de 30 segundos.** Búsqueda de cliente por teléfono con
   autocompletado, catálogo táctil, y confirmación en 3 pasos.
2. **Imprimir la comanda en la impresora térmica que el local ya tiene**, sin drivers ni
   TPV propietario: ESC/POS generado en servidor y enviado por WebUSB desde el navegador,
   o por un agente local que habla con CUPS.
3. **Canal de venta online propio y sin comisiones**: cada local tiene su tienda pública en
   `/{slug}/pedidos`, con cuentas de cliente y verificación por email.

## 3. Usuarios y roles

| Rol | Quién es | Qué hace en la app |
|-----|----------|--------------------|
| `OWNER` | Dueño del local | Todo, incluida configuración y tarifas |
| `ADMIN` | Encargado | Configuración, tarifas, productos, pedidos |
| `STAFF` | Persona que atiende el teléfono / cocina | Toma pedidos, cambia estados, imprime |
| Cliente final (`CustomerAccount`) | Comensal que compra online | Se registra, pide y sigue su pedido |
| Cliente del local (`Customer`) | Ficha de cliente del negocio | No accede a la app; existe como dato |

> ⚠️ Hoy `requireAdmin` solo se aplica en `settings` y `shipping-rates`. Un `STAFF` puede
> crear/editar productos y **borrar pedidos**. Ver [11-deuda-tecnica.md](11-deuda-tecnica.md#p1-permisos).

## 4. Recorridos principales

### 4.1 Turno de trabajo (el concepto central)

Todo gira alrededor del **Servicio** (`Service`): un turno abierto/cerrado.

```
Abrir servicio  →  Tomar pedidos  →  Cambiar estados  →  Cerrar servicio (cierre de caja)
```

- **No se pueden crear pedidos sin un servicio activo** (`409` desde la API).
- El listado de pedidos del dashboard muestra **solo el servicio activo** (más los pedidos
  online pendientes de aceptar, que se muestran siempre).
- Al cerrar el servicio, todos los pedidos no cancelados pasan a `DELIVERED` y el servicio
  queda como unidad de análisis en Estadísticas.

Ver detalle en [07-flujos-negocio.md](07-flujos-negocio.md).

### 4.2 Pedido en mostrador/teléfono (< 30 s)

```
Paso 1: Cliente     → buscar por teléfono o nombre; si no existe, alta rápida inline
Paso 2: Productos   → categorías + búsqueda + carrito; ajuste de stock inline si falta
Paso 3: Pago/envío  → recogida o reparto, tarifa de envío, efectivo/tarjeta, cambio, hora estimada
                    → Crear pedido → Imprimir comanda con QR de seguimiento
```

### 4.3 Pedido online

```
Cliente entra en /{slug}/pedidos → se registra (email verificado) → carrito → pedido
    → llega al dashboard con estado RECEIVED_ONLINE (destacado en morado)
    → el local lo acepta (PENDING) → se envía email de confirmación con enlace de tracking
```

### 4.4 Seguimiento público

El ticket impreso lleva un **QR con `/tracking/{trackingToken}`**. Cualquiera con el enlace
ve estado, productos y total, sin autenticación.

## 5. Modelo de negocio SaaS

El producto está construido como multi-tenant desde el primer día (un `Business` = un
tenant, aislado por `businessId`), pero **la capa de comercialización todavía no existe**.

### Lo que ya soporta el sistema

- Alta autoservicio de un local nuevo: `POST /api/auth/register` crea `Business` + `User` + rol `OWNER`.
- Slug único por local, usado en login, tienda online y URLs públicas.
- Configuración por tenant: ancho de papel, modo de impresión, moneda, IVA, venta online on/off.

### Lo que falta para poder vender (ver [12-roadmap.md](12-roadmap.md))

| Pieza | Estado |
|-------|--------|
| Planes y límites por plan (nº pedidos, usuarios, tienda online) | ❌ |
| Pasarela de pago de la suscripción (Stripe) + webhooks | ❌ |
| Panel de superadministrador (ver tenants, suspender, métricas) | ❌ |
| Invitación y gestión de usuarios dentro de un local | ❌ (no hay endpoint) |
| Onboarding guiado (primer producto, primera impresora, primer servicio) | ❌ |
| Periodo de prueba y estado `SUSPENDED` del tenant | ❌ |
| Exportación de datos / cumplimiento RGPD (derecho de portabilidad y supresión) | ❌ |
| Facturación al cliente final (factura simplificada válida) | ⚠️ El ticket no es una factura fiscal |

### Precio de referencia sugerido (hipótesis, no validada)

| Plan | Precio/mes | Incluye |
|------|-----------|---------|
| Básico | 29 € | 1 local, usuarios ilimitados, comandas + impresión |
| Pro | 59 € | + tienda online, estadísticas avanzadas, tarifas de envío |
| Cadena | desde 149 € | varios locales bajo un mismo grupo, informes agregados |

> Anota aquí los datos reales cuando se validen con clientes; hoy es una hipótesis.

## 6. Restricciones y decisiones de producto asumidas

- **Mercado inicial España**: moneda por defecto EUR, formato de fecha `es-ES`, zona horaria
  fija `Europe/Madrid` en el ticket impreso (ver [06-impresion.md](06-impresion.md)).
- **El ticket no es una factura fiscal**: no incluye NIF, serie ni numeración legal.
  Antes de venderlo como sistema de facturación hay que revisar normativa (en España,
  Verifactu / Ley Antifraude). Es un **riesgo regulatorio abierto**.
- **Pagos online no integrados**: `paymentMethod` es informativo (efectivo o tarjeta al
  repartidor). No hay cobro en la tienda online.
- **Sin app nativa**: web responsive, pensada para tablet en mostrador y móvil en reparto.

## 7. Glosario

| Término | Significado en el código |
|---------|--------------------------|
| **Business / Local / Tenant** | `Business`. Unidad de aislamiento de datos. Tiene `slug` único. |
| **Servicio / Turno** | `Service`. Periodo de trabajo abierto (`endedAt: null`) o cerrado. |
| **Comanda** | El ticket impreso de un `Order`. |
| **Pedido** | `Order`. Cabecera + `OrderItem[]`. |
| **Cliente del local** | `Customer`. Ficha con teléfono único por local. |
| **Cuenta de cliente** | `CustomerAccount`. Login del comensal para la tienda online. |
| **Tarifa de envío** | `ShippingRate`. Coste fijo con nombre (p. ej. "Zona 2 — 3 €"). |
| **Tracking token** | `Order.trackingToken`, cuid único; da acceso público de solo lectura. |
| **Print agent** | `apps/print-agent`. Proceso Node que imprime vía CUPS en el local. |
