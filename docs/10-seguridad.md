# 10 — Seguridad y aislamiento multi-tenant

> Documento de trabajo, no un certificado. Refleja el estado real del código a
> **6 de agosto de 2026**, con los problemas abiertos identificados.

## 1. Superficie de exposición

| Superficie | Autenticación | Riesgo si falla |
|-----------|---------------|-----------------|
| `/api/auth/login`, `/register` | pública | Fuerza bruta, alta masiva de tenants |
| `/api/*` (resto) | JWT de staff | Acceso a datos de otro local |
| `/api/public/:slug/*` | pública o JWT de cliente | Enumeración de emails, pedidos falsos |
| `/api/tracking/:token` | token en la URL | Datos personales del cliente |
| WebUSB / Bluetooth | permiso del navegador | Ninguno para los datos |
| `print-agent` | credenciales en `.env` | Credenciales de un usuario real en un PC del local |

## 2. Aislamiento multi-tenant

**Modelo: discriminador por columna `businessId`, sin Row Level Security.**

Lo que está bien:

- `authMiddleware` **revalida en cada petición** que existe el `BusinessUser`, y toma el
  rol de la base de datos, no del token. Revocar el acceso de un empleado surte efecto
  inmediato sin esperar a que caduque el JWT.
- Todas las rutas de staff usan `findFirst({ where: { id, businessId } })` y devuelven 404
  cuando el recurso pertenece a otro local (no revelan su existencia).
- El `businessId` **nunca** se acepta desde el cuerpo o la query: siempre viene del token.

Lo que hay que vigilar:

- El aislamiento depende al 100 % de la disciplina en cada query. Un `findUnique({ id })`
  olvidado es una fuga entre clientes. **Mitigación recomendada:** usar la
  [extensión de cliente de Prisma](https://www.prisma.io/docs/orm/prisma-client/client-extensions)
  o RLS de PostgreSQL para forzar el filtro a nivel de infraestructura, no de convención.
- `customerAuthMiddleware` **no comprueba** que la `CustomerAccount` siga existiendo ni
  verificada: un token de 30 días sigue siendo válido tras borrar la cuenta.
- **Un solo `JWT_SECRET` firma tokens de staff y de clientes.** Los payloads son distintos
  (`userId` vs `customerAccountId`), así que hoy no son intercambiables, pero es una
  separación frágil. Recomendado: `JWT_SECRET` + `JWT_CUSTOMER_SECRET`, o un `aud` en el
  payload verificado en cada middleware.

## 3. Problemas abiertos (ordenados por gravedad)

### ✅ A1 — CORS permitía cualquier origen con credenciales — RESUELTO (2026-08-06)

`apps/api/src/index.ts` reflejaba la cabecera `Origin` recibida:

```ts
if (origin) res.setHeader('Access-Control-Allow-Origin', origin);   // ← refleja lo que venga
res.setHeader('Access-Control-Allow-Credentials', 'true');
```

**Origen histórico:** fue un apaño temporal de depuración (commits del 21/04/2026,
`fix: use origin:true in CORS to unblock while debugging` →
`fix: replace cors package with manual middleware`). El problema real se resolvió llevando
las llamadas del panel a través del rewrite de Next (mismo origen), pero el apaño se quedó.

**Arreglo aplicado:** lista blanca desde `ALLOWED_ORIGINS`. Si la variable no está
configurada, se deduce el origen de `APP_URL` (obligatoria y apunta al frontend), de modo
que un despiste de configuración **ni deja la API abierta ni tumba la tienda online**. En
desarrollo, si no se puede deducir nada, se acepta cualquier origen con un aviso al
arrancar. Se añade `Vary: Origin`.

> **Ojo:** la tienda online (`/[slug]/pedidos`) **sí** llama a la API entre orígenes
> distintos, porque usa `NEXT_PUBLIC_API_URL` en absoluto en vez del rewrite. Cualquier
> dominio nuevo desde el que se sirva la tienda tiene que entrar en `ALLOWED_ORIGINS`.

### ✅ A2 — Sin límite de intentos de autenticación — RESUELTO (2026-08-06)

**Arreglo aplicado:** limitador propio de ventana fija en
[`rate-limit.middleware.ts`](../apps/api/src/middleware/rate-limit.middleware.ts), sin
dependencias nuevas (añadir un paquete obligaría a sincronizar dos `package-lock.json` con
riesgo para el build de Docker).

| Endpoint | Límite | Clave |
|----------|--------|-------|
| `POST /api/auth/login` | 10 fallos / 15 min | email (+ ámbito) |
| `POST /api/public/:slug/auth/login` | 10 fallos / 15 min | email + slug |
| `POST /api/auth/register` | 5 / hora | IP |
| `POST /api/public/:slug/auth/register` | 5 / hora | IP |

Decisiones a tener presentes:

- **El login se limita por email, no por IP.** La IP viene de `X-Forwarded-For`, que es
  falsificable: rotando la cabecera se esquivaría el límite. El email es lo que realmente
  se está atacando. Efecto secundario aceptado: alguien puede bloquear temporalmente el
  login de un email ajeno (15 minutos).
- **Los logins correctos no consumen cupo**, así que un usuario legítimo nunca se queda
  fuera por trabajar mucho.
- **El contador es por proceso.** Con varias instancias de App Runner el límite efectivo es
  N × max.

### ✅ A12 — Credenciales SMTP en claro en la configuración de App Runner — RESUELTO (2026-08-06)

**Arreglo aplicado:** se elimina la credencial en lugar de protegerla. El correo pasa a
enviarse con la **API de Amazon SES autorizada por el rol de instancia de App Runner**, así
que no hay contraseña ni en variables de entorno ni en SSM. El permiso está acotado a la
identidad del dominio y, con una condición `ses:FromAddress`, al remitente concreto.

> ⚠️ **Sigue pendiente revocar la contraseña antigua** de `juanma@puntojs.com`: ha estado
> legible en la configuración de App Runner y deja de usarse, pero no deja de ser válida
> hasta que se revoque en la cuenta de Microsoft 365.

<details>
<summary>Descripción original del problema</summary>

### Credenciales SMTP en claro en la configuración de App Runner

Verificado el 2026-08-06 con `aws apprunner describe-service`: el servicio vivo tiene
`SMTP_PASS`, `SMTP_USER` y el resto de `SMTP_*` como **variables de entorno en claro**
(`RuntimeEnvironmentVariables`), no como secretos de SSM. `DATABASE_URL` y `JWT_SECRET` sí
están bien, en `RuntimeEnvironmentSecrets`.

Consecuencias: cualquier identidad con `apprunner:DescribeService` lee la contraseña del
buzón, y esta aparece en claro en la consola de AWS, en la CLI y en cualquier volcado de la
configuración del servicio. Es una contraseña de aplicación de un buzón real de Office 365,
con la que se puede enviar correo suplantando al dominio.

Se valoró moverla a SSM, pero se optó por eliminarla: ver el arreglo aplicado arriba.

</details>

### 🟠 A3 — Autorización insuficiente por rol

`requireAdmin` solo se aplica en `settings` y `shipping-rates`. Un `STAFF` puede:

- crear, modificar y desactivar productos y precios;
- **borrar pedidos definitivamente** (`DELETE /api/orders/:id`), lo que altera las
  estadísticas y elimina el rastro.

**Arreglo:** exigir `ADMIN`/`OWNER` para el borrado de pedidos y para la escritura de
productos, o introducir un rol intermedio.

### 🟠 A4 — Enumeración de cuentas

`POST /api/public/:slug/auth/register` responde de forma distinta si el email ya existe
(y si está verificado o no). Permite descubrir quién es cliente de un local.

**Arreglo:** respuesta genérica ("si el email es válido recibirás un correo") y enviar el
correo correspondiente en cada caso.

### 🟠 A5 — El token del ticket no caduca

`trackingToken` es un cuid de 25 caracteres (no enumerable por fuerza bruta), pero da
acceso permanente al nombre y dirección del cliente sin autenticación. El enlace viaja
impreso en papel y por email.

**Arreglo:** dejar de exponer la dirección completa, o invalidar el token X días después de
`DELIVERED`.

### 🟡 A6 — Tokens en `localStorage`, sin caducidad efectiva ni revocación

7 días (staff) y 30 días (cliente), accesibles desde JavaScript. Sin refresh, sin lista de
revocación, sin cierre de sesión del lado servidor. Un XSS en el dashboard entrega la
sesión completa.

**Mitigación parcial ya existente:** el rol y la pertenencia se releen de la BD en cada
petición.

**Arreglo objetivo:** cookies `httpOnly` + `SameSite=Strict` con access token corto y
refresh token rotatorio.

### 🟡 A7 — Coste de bcrypt inconsistente

`12` rondas para usuarios de staff (`routes/auth.ts`) y `10` para cuentas de cliente
(`routes/public.ts`). Unificar en 12.

### 🟡 A8 — La tienda online no valida `onlineVisible` al crear el pedido

`POST /api/public/:slug/orders` valida stock y `active`, pero no `onlineVisible`. Con el id
de un producto oculto se puede comprar desde la tienda pública.

### 🟡 A9 — Sin cabeceras de seguridad completas en la web

`next.config.ts` fija `X-Frame-Options`, `X-Content-Type-Options` y `Referrer-Policy`. Falta
`Content-Security-Policy` (que ayudaría mucho frente a A6), `Permissions-Policy` y `HSTS`.

### 🟡 A10 — El `print-agent` guarda credenciales en claro

Un `.env` con email y contraseña de un usuario real en un ordenador del local, en un
entorno físicamente poco controlado.

**Arreglo:** tokens de dispositivo revocables (`PrintAgentToken` con ámbito
"leer pedidos + imprimir"), sin acceso al resto de la API.

### ⚪ A11 — Errores de negocio devueltos como 500

Un `throw` dentro de la transacción de stock (condición de carrera real) acaba en el error
handler global como 500 con el mensaje real en desarrollo. Además, el handler registra
`err.stack` completo en los logs, que en producción pueden contener datos del pedido.

## 4. Datos personales (RGPD)

Se almacenan: nombre, teléfono, email, dirección postal e histórico de compras del cliente
final. Eso es un tratamiento de datos personales en toda regla.

| Obligación | Estado |
|------------|--------|
| Base legal y política de privacidad | ❌ No hay textos legales en la app |
| Consentimiento en el registro online | ❌ No hay casilla ni enlace |
| Derecho de acceso / portabilidad | ❌ No hay exportación |
| Derecho de supresión | ❌ No hay borrado de clientes ni de cuentas |
| Minimización | ⚠️ El tracking público expone dirección |
| Cifrado en reposo | ✅ RDS con `storage_encrypted = true` |
| Cifrado en tránsito | ✅ HTTPS en Amplify y App Runner |
| Encargado del tratamiento | ⚠️ Al vender como SaaS, hace falta contrato con cada local |

**Antes de comercializar es obligatorio cerrar este bloque.** Va en el roadmap de v1.2.

## 5. Checklist de revisión de seguridad para cada PR

- [ ] Toda consulta nueva filtra por `businessId` (o justifica por qué no).
- [ ] Toda entrada externa pasa por Zod con `safeParse`.
- [ ] Las rutas de escritura sensibles llevan `requireAdmin`.
- [ ] No se devuelven campos internos en rutas públicas (usar proyección explícita).
- [ ] No se registran datos personales ni secretos con `console.log`.
- [ ] Ninguna variable de entorno nueva con secretos entra en `.env.production` ni en el
      bundle del frontend (`NEXT_PUBLIC_*` es público por definición).
- [ ] Si se añade una dependencia: `npm audit` limpio y justificación del uso.

## 6. Orden de trabajo sugerido

1. ~~A1 (CORS), A2 (rate limiting) y A12 (credenciales SMTP)~~ — ✅ hecho el 2026-08-06.
   Queda **revocar la contraseña antigua de Office 365**, que ya no se usa pero sigue siendo válida.
2. A3 (roles) y A8 (`onlineVisible`) — coherencia funcional.
3. A11 (errores tipados) — mejora diagnóstico y evita filtrar stacks.
4. A4, A5, A7 — endurecimiento.
5. A6 (cookies httpOnly + CSP) — refactor mayor, planificar en v1.2.
6. Bloque RGPD — bloqueante para vender.
