# 12 — Roadmap de versiones

Punto de partida: **v1.0.0** — sistema funcional en producción con comandas, impresión,
tienda online y estadísticas. Ver [11-deuda-tecnica.md](11-deuda-tecnica.md) para el detalle
de lo que arrastra.

Criterio de priorización, en este orden:

1. **No perder dinero ni datos de un local que ya está en producción.**
2. Lo que impide vender el producto (facturación, gestión de usuarios, RGPD).
3. Lo que reduce el soporte (impresión, errores confusos).
4. Lo que hace el producto más agradable.

---

## ✅ v1.0.1 — Parche de estabilización (completado el 2026-08-06)

| Tarea | Ref | Estado |
|-------|-----|--------|
| Añadir `'bluetooth'` al enum de `printerMode` en la API | [P0-1](11-deuda-tecnica.md#p0-bluetooth) | ✅ |
| Limpiar los logs de depuración de impresión | P0-2 | ✅ tras `localStorage.debugPrint` |
| Commitear o descartar el cambio pendiente de `next.config.ts` | P0-3 | ✅ |
| CORS restringido a `ALLOWED_ORIGINS` | [A1](10-seguridad.md) | ✅ con respaldo en `APP_URL` |
| Rate limiting en login y registro | A2 | ✅ limitador propio, sin dependencias |
| Crear `.env.example` y actualizar el README | P1-11 | ✅ |

**Criterio de aceptación (verificado):** un local puede elegir Bluetooth y guardar; la API
no devuelve cabeceras CORS a orígenes desconocidos; 10 intentos de login fallidos devuelven
`429` y los aciertos no consumen cupo.

**Verificado contra AWS el 2026-08-06:** el servicio vivo tiene
`ALLOWED_ORIGINS = https://olyda.app,https://www.olyda.app` y `APP_URL = https://olyda.app`.
El parche de CORS no afecta a la tienda online.

### Detectado durante esa verificación — meter en el siguiente parche

| Tarea | Ref | Prioridad |
|-------|-----|-----------|
| Rotar la contraseña SMTP y moverla a SSM (hoy está en claro en App Runner) | [A12](10-seguridad.md) | 🔴 |
| Llevar las variables `SMTP_*` a Terraform: hoy un `apply` las borraría y el correo caería en silencio | [09-despliegue](09-despliegue.md#-deriva-entre-terraform-y-el-servicio-vivo) | 🟠 |
| Remitente de correo neutro de plataforma en vez del nombre de un local | [P1-8b](11-deuda-tecnica.md#p1-remitente) | 🟠 |

---

## v1.1 — Integridad de datos y dinero (2–3 semanas)

Objetivo: que los números cuadren y nada se pierda.

### Funcionalidad

- **Cancelar devuelve el stock** (con transacción y protección de doble restauración).
- **Borrado lógico de pedidos** (`deletedAt`, `deletedBy`) y exclusión en estadísticas.
- **Transiciones de estado validadas** en el servidor.
- **Cierre de servicio con decisión explícita** sobre los pedidos abiertos: entregar,
  cancelar o pasar al siguiente turno.
- **Producto sin control de stock** (`trackStock: false`) para artículos que nunca se
  agotan (bebidas, salsas).
- **Gestión de usuarios del local**: invitar, listar, cambiar rol y desactivar
  (`POST /api/users/invite`, `GET /api/users`, `PATCH /api/users/:id`). Hoy no existe y es
  el hueco funcional más grande.

### Técnico

- Aritmética monetaria en enteros/`Decimal`, con test de propiedades.
- Índice `[businessId, createdAt]` en `orders`; índice único parcial de servicio activo.
- Migraciones Prisma reales, prohibido `db push` fuera de desarrollo.
- Errores de negocio tipados (`AppError` con código HTTP) en lugar de 500 genéricos.
- `WEB_URL` explícita en lugar del `replace(':4000', ':3000')`.
- Suite de tests mínima ([13-testing.md](13-testing.md)): stock, totales, aislamiento
  multi-tenant, snapshot del buffer ESC/POS.
- CI que ejecuta `tsc --noEmit`, lint y tests **antes** de permitir el merge.

**Criterio de aceptación:** ninguna operación puede dejar el stock o los totales
descuadrados; un empleado nuevo se da de alta sin tocar la base de datos.

---

## v1.2 — Listo para vender (4–6 semanas)

Objetivo: convertir la aplicación en un SaaS cobrable.

### Facturación y planes

```
Plan (BASIC | PRO | CHAIN)
  ├─ límites: nº de usuarios, tienda online sí/no, retención de estadísticas
  └─ Subscription: stripeCustomerId, stripeSubscriptionId, status, trialEndsAt, currentPeriodEnd
```

- Integración con **Stripe Checkout + Billing Portal** (no manejamos tarjetas: el usuario
  las introduce en Stripe).
- Webhooks de Stripe → estado del tenant (`TRIALING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`).
- Middleware de plan: bloquear funciones fuera del plan y avisar antes de bloquear.
- Prueba gratuita de 14 días sin tarjeta.

### Administración de la plataforma

- **Panel de superadministrador**: listado de tenants, actividad, suspender/reactivar,
  entrar como el tenant para dar soporte (con registro de auditoría).
- Métricas de negocio: locales activos, pedidos por local, MRR, tasa de abandono.

### Cumplimiento

- Política de privacidad, términos de servicio y contrato de encargado del tratamiento.
- Casilla de consentimiento en el registro de clientes online.
- **Exportación de datos** del local (CSV/JSON) y **borrado de cliente** con anonimización
  de sus pedidos.
- Caducidad del token de tracking.
- Revisión de facturación fiscal española (Verifactu / Ley Antifraude) antes de presentar
  el ticket como documento contable. **Riesgo regulatorio: decidir si el producto emite
  facturas o solo comandas internas.**

### Onboarding

Asistente en el primer acceso: datos del local → primera categoría y productos → prueba de
impresión → abrir el primer servicio. La primera impresión funcionando es el momento en que
el cliente decide si se queda.

**Criterio de aceptación:** un local se registra, prueba 14 días, paga con tarjeta y opera
sin que nadie del equipo intervenga.

---

## v1.3 — Reducir soporte y fricción (3–4 semanas)

- **Tiempo real con SSE**: pedidos online que aparecen al instante, con sonido y aviso
  visual. Sustituye el polling del dashboard.
- **Impresión automática** de pedidos online aceptados a través del `print-agent`, con
  tokens de dispositivo revocables en lugar de credenciales de usuario.
- **Asistente de impresora**: página de diagnóstico que prueba la conexión, imprime un
  ticket de test y guarda el par interfaz/endpoint que funcionó para ese local.
- **Refactor del frontend**: `lib/api.ts`, componentes extraídos, tipos compartidos desde
  `packages/shared-types` (P2-1 a P2-3).
- **Observabilidad**: registro estructurado, Sentry para errores de frontend y backend,
  alarma de CloudWatch sobre la tasa de 5xx.

---

## v2.0 — Crecimiento del producto (trimestre)

Ideas ordenadas por valor percibido, a validar con clientes reales antes de construir:

| Funcionalidad | Por qué |
|---------------|---------|
| **Modificadores de producto** (tamaño, ingredientes extra, sin cebolla) con precio | Es la carencia nº 1 de un TPV de comida; hoy solo hay una nota libre |
| **Menús y combos** | Ticket medio más alto |
| **Zonas de reparto por código postal** con tarifa automática | Menos errores al cobrar el envío |
| **Panel de repartidor** (móvil): mis pedidos, mapa, marcar entregado | Cierra el ciclo del reparto |
| **Pago online real** en la tienda (Stripe/Bizum) | Cobra por adelantado, elimina impagos |
| **Impresión por cocina/barra** (varias impresoras por local, ticket filtrado por categoría) | Locales medianos |
| **Programar pedidos** para una hora futura | Muy pedido en comida a domicilio |
| **Fidelización**: puntos o descuentos por cliente recurrente | Los datos ya están en `Customer` |
| **Informes exportables** (PDF/Excel) de cierre de caja | Se los pide la gestoría |
| **Multi-local bajo un mismo grupo** con informes agregados | Plan Cadena |
| **Integración con agregadores** (Glovo, Just Eat) | Solo si hay demanda: es mantenimiento costoso |
| **App nativa envolvente** con impresión Bluetooth estable en Android | Salva el caso de la tableta barata |

---

## Cosas que conviene NO hacer todavía

- **Microservicios o colas.** El monolito Express con PostgreSQL da de sobra para cientos
  de locales.
- **Reescribir el frontend** en otro framework. El problema no es Next.js, es que las
  páginas son monolíticas.
- **Soportar más idiomas y monedas** antes de tener clientes fuera de España — pero sí
  **parametrizar la zona horaria por local**, porque es barato ahora y caro después.
- **Panel de personalización de tickets.** Antes, estabilizar la impresión.

---

## Cómo mantener este documento

Al empezar una versión, copia su bloque a un issue/épica y marca aquí lo completado.
Al cerrarla, mueve el resumen a [`CHANGELOG.md`](../CHANGELOG.md) con la fecha real.
Si una prioridad cambia por lo que digan los clientes, **anota el motivo**: dentro de seis
meses nadie recordará por qué se adelantó algo.
