# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
[Versionado Semántico](https://semver.org/lang/es/).

Las versiones anteriores a `1.0.0` se han reconstruido a partir del historial de Git el
11 de agosto de 2026; agrupan el trabajo por fecha, no por etiquetas reales (no existían).
A partir de ahora, **cada release se anota aquí antes de desplegar**.

## [No publicado]

### Añadido
- **Rol de repartidor con pantalla propia.** Los pedidos a domicilio se asignan a un
  repartidor desde el listado, y es él quien los saca a reparto y los marca como
  entregados desde `/reparto`, pensada para el móvil: dirección que abre el mapa, teléfono
  que llama e importe en efectivo destacado. Se da de alta por invitación desde *Equipo*,
  como cualquier otro miembro.
- El rol `DELIVERY` **no da acceso a la gestión del local**: ni productos, ni clientes, ni
  estadísticas, ni el listado de pedidos. Solo ve los pedidos que tiene asignados, y de
  cada uno solo lo que necesita para entregarlo.
- **Trazabilidad por mensaje del correo enviado.** Conjunto de configuración de SES
  (`comandapro-prod`) con destino de eventos a CloudWatch Logs vía EventBridge: cada envío
  registra entrega, rebote con su motivo, queja, retraso y la respuesta SMTP del servidor
  receptor. Antes solo había métricas agregadas. Consulta en `docs/09-despliegue.md`.
- TLS obligatorio en la entrega de los correos (`tls_policy = REQUIRE`): llevan nombre,
  dirección y detalle del pedido.

### Corregido
- **La impresión fallaba con impresoras nuevas** con el error «The specified endpoint is
  not part of a claimed and selected alternate interface». Las dos pantallas que imprimen
  tenían implementaciones distintas y habían divergido: la de crear pedido usaba interfaz 0
  y endpoint 1 fijos, que solo funciona si la impresora los coloca justo ahí. Ahora ambas
  usan la misma implementación, que busca el endpoint en el descriptor del dispositivo.
- **Al crear un pedido se imprimía siempre por USB**, ignorando el modo configurado en
  Ajustes: un local en Bluetooth no podía imprimir desde esa pantalla.
- **Un pedido podía marcarse como impreso sin que saliera el papel.** El envío por USB no
  lanza error cuando la impresora rechaza los datos, devuelve un estado que no se miraba.
- **Los correos incluyen alternativa en texto plano.** Iban solo en HTML, que es una señal
  de spam clásica y penaliza la entregabilidad en dominios sin histórico de envío. También
  mejora la accesibilidad y los clientes que bloquean HTML.

---

## [1.1.0] — 2026-08-11

Desplegado en producción el 11/08/2026 a las 21:45 (Madrid).

### Corregido
- **Ajustes: ya se puede guardar la impresora Bluetooth.** La API rechazaba el valor
  `bluetooth` de `printerMode` (solo aceptaba `webusb` y `printserver`), así que la opción
  que ofrecía la pantalla de Ajustes devolvía un error al guardar y la impresión por
  Bluetooth era inalcanzable.

### Seguridad
- **CORS restringido a una lista blanca de orígenes.** Antes se aceptaba cualquier origen
  con credenciales. Ahora se usa `ALLOWED_ORIGINS`; si no está configurada, se deduce el
  origen de `APP_URL` para no dejar nunca la API abierta ni romper la tienda online por un
  despiste de configuración. Se añade la cabecera `Vary: Origin`.
- **Límite de intentos en autenticación.** Login (panel y tienda online): 10 intentos
  fallidos por email cada 15 minutos; los aciertos no consumen cupo. Registro de local y de
  cliente online: 5 altas por IP y hora. Devuelve `429` con `Retry-After`.

### Cambiado
- **Los correos ya no se firman con el nombre de un local ajeno.** El remitente pasa a ser
  `"<nombre del local> vía Olyda" <dirección de la plataforma>`, y la plantilla usa los
  colores corporativos de Olyda en vez de la cabecera "ComandaPro" morada. Si
  `MAIL_FROM_ADDRESS` no está configurada, se reutiliza la dirección de `SMTP_FROM`, de modo
  que el cambio se puede desplegar antes de tener el buzón nuevo.
- El nombre del local y del cliente se escapan al construir cabeceras y HTML del correo
  (los escribe el propio cliente: evita inyección de cabeceras y de HTML).
- **El correo se envía con Amazon SES en lugar de SMTP con contraseña.** Se autoriza con el
  rol de instancia de App Runner, así que desaparece la credencial en vez de protegerla.
  Se mantiene el transporte SMTP para despliegues fuera de AWS.
- **En desarrollo local ya se pueden seguir los flujos de correo:** sin nada configurado, el
  transporte `log` vuelca el mensaje y sus enlaces por consola, de modo que se puede
  completar el registro de un cliente en la tienda online sin servidor de correo.
- **Infraestructura:** toda la configuración de correo pasa a estar gestionada por Terraform
  (`infra/ses.tf`). `aws_amplify_app.web` ignora `repository` y los tokens: sin eso, un
  `terraform apply` desconectaba Amplify de GitHub.
- El registro detallado del flujo de impresión deja de emitirse siempre; se activa por
  local desde la consola con `localStorage.setItem('debugPrint', '1')`.
- `apprunner.yaml`: `ALLOWED_ORIGINS` apuntaba a la URL antigua de Amplify; ahora usa el
  dominio real (`olyda.app`).
- `next.config.ts`: `turbopack.root` explícito para evitar la inferencia errónea de la raíz
  del workspace.

### Añadido
- Documentación completa en [`docs/`](docs/README.md), `CLAUDE.md` y este `CHANGELOG.md`.
- `.env.example`, que el README pedía copiar y no existía.

### Notas del despliegue
- El pipeline de CI llevaba roto desde mayo (faltaba `rds:CreateDBSnapshot` al usuario de
  GitHub Actions); los permisos ya estaban en Terraform pero sin aplicar. Resuelto.
- El contenedor no arrancaba por `P3005`: producción se creó con `db push` y no tenía
  baseline de migraciones. Resuelto con `migrate resolve --applied` en el `CMD`.
  **Producción no se vio afectada**: App Runner mantuvo la versión anterior.
- Detalle completo en `docs/09-despliegue.md` §3 ter.

### Verificado después del despliegue (12/08/2026)
- La migración `init` coincide exactamente con el esquema real de producción, comprobado
  restaurando el snapshot previo al despliegue en una instancia aislada. El baseline fue
  correcto y las próximas migraciones parten de una base fiable (`docs/11-deuda-tecnica.md`
  P2-9).
- La API lleva 12 h sin un solo error en los logs.

### Conocido y sin resolver
- **La contraseña de aplicación antigua de Office 365 sigue siendo válida.** Ya no se usa,
  pero estuvo legible en la configuración de App Runner y hay que revocarla en la cuenta de
  Microsoft (`docs/10-seguridad.md` A12).
- Faltan los registros DNS `TXT` de SPF en `smtp.olyda.app` y de DMARC en `olyda.app`
  (`docs/09-despliegue.md` §3 bis).
- `Business` no tiene campo de email, así que el `Reply-To` es de plataforma y no del local
  (P1-8b).
- Cancelar un pedido no restaura el stock (`docs/11-deuda-tecnica.md` P1-1).
- Un `STAFF` puede borrar pedidos y editar precios (P1-2).
- Aritmética monetaria en coma flotante (P1-4).
- Sin tests automatizados (`docs/13-testing.md`).

---

## [1.0.0] — 2026-05-11

Primera versión considerada estable en producción: gestión completa de comandas,
impresión térmica, tienda online y estadísticas.

### Añadido
- **Impresión**: detección automática de endpoints BULK OUT para impresoras POS genéricas
  vía WebUSB, probando todas las combinaciones de interfaz/alternate/endpoint (`a83956d`).
- **Impresión**: soporte de Web Bluetooth en el frontend con dos perfiles serie BLE
  habituales y envío por trozos de 200 bytes.
- Registro de diagnóstico del flujo de impresión (`0cdd2cc`) — **temporal**.
- Migración Prisma inicial versionada (`20260511121906_init`).

## [0.9.0] — 2026-05-08

### Añadido
- **Venta online**: catálogo público por local en `/{slug}/pedidos`, con cuentas de cliente
  (`CustomerAccount`), verificación por email y JWT de 30 días.
- Estado de pedido `RECEIVED_ONLINE` y flujo de aceptación desde el dashboard.
- Envío de correos con nodemailer: verificación de cuenta y confirmación de pedido, con
  plantillas HTML de marca.
- Campo `onlineVisible` en productos y `onlineOrderEnabled` en el local.
- Listado de cuentas online pendientes de verificar en Clientes.

## [0.8.0] — 2026-04-27

### Añadido
- **Servicios (turnos)**: apertura y cierre manual; los pedidos se agrupan por servicio y
  no se pueden crear sin uno activo.
- **Estadísticas**: por servicio, cliente, producto, categoría y periodo (día/semana/mes),
  con top de productos y clientes.
- Diseño responsive para móvil y tablet en toda la aplicación.

## [0.7.0] — 2026-04-25

### Añadido
- Tarifas de envío por local (`ShippingRate`) aplicables al pedido y reflejadas en el ticket.
- Hora estimada de entrega con cuenta atrás en la página de seguimiento.
- Búsqueda de clientes por nombre además de por teléfono.
- Estado `OUT_FOR_DELIVERY` (en reparto).
- Total facturado en el listado de pedidos y filtro por fechas.

### Corregido
- Error de cálculo del total al añadir costes de envío.
- Horarios del ticket impreso (zona horaria).

## [0.6.0] — 2026-04-23

### Añadido
- **Marca Olyda**: logo, paleta corporativa (#004177 / #ff6a03) y dominio `olyda.app`.
- Método de pago (efectivo/tarjeta), efectivo entregado y cálculo del cambio en el
  formulario y en el ticket.
- Botón de reimpresión de comanda desde el listado de pedidos.

### Corregido
- Manejo de `paymentMethod` nulo en el listado y en la impresión.

## [0.5.0] — 2026-04-22

### Añadido
- Marca de recogida en local (`isPickup`) con distintivo y orden prioritario.
- Botón de WhatsApp en la página de seguimiento.
- Buscador de teléfonos mejorado con sugerencias.

### Corregido
- `APP_URL` debe apuntar al frontend, no a la API (afectaba al QR y a los enlaces).
- Inicialización del codificador ESC/POS con `language: 'esc-pos'` en lugar de
  `printerModel` (API de la v3).
- `print-agent` migrado a CUPS (`lp -o raw`) y corregido el formato de imagen ESC/POS.
- Hoisting de `node_modules` en el Dockerfile de la API.

## [0.4.0] — 2026-04-21

### Cambiado
- **Todas las llamadas del frontend pasan a ser relativas** y se proxean con los rewrites
  de Next.js hacia App Runner, eliminando el problema de CORS de raíz.
- Sustitución del paquete `cors` por middleware manual.

### Corregido
- Serie de arreglos del build de Amplify: binarios nativos de Tailwind v4 y `lightningcss`,
  dependencias movidas a `dependencies` por `NODE_ENV=production`, configuración de
  monorepo y `.env.production`.

## [0.1.0] — 2026-04-21

### Añadido
- Configuración inicial de ComandaPro: monorepo con Turborepo, API Express + Prisma +
  PostgreSQL, frontend Next.js, agente de impresión, infraestructura Terraform en AWS y
  workflow de despliegue con snapshot previo de RDS y rollback.
- Modelo multi-tenant (`Business`, `User`, `BusinessUser`), productos con stock, clientes
  por teléfono, pedidos con items, y seguimiento público por token.
- Generación de ticket ESC/POS con logo, QR y soporte de 58/80 mm.

---

## Cómo anotar una versión nueva

```markdown
## [X.Y.Z] — AAAA-MM-DD

### Añadido / Cambiado / Obsoleto / Eliminado / Corregido / Seguridad
- Descripción orientada al usuario del local, no al código.
```

Criterio de versión: **MAYOR** si rompe el contrato de la API o exige intervención manual en
los locales; **MENOR** si añade funcionalidad; **PARCHE** si solo corrige.
