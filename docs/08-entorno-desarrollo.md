# 08 — Entorno de desarrollo y convenciones

## 1. Requisitos

- Node.js ≥ 20
- Docker Desktop (PostgreSQL local)
- Chrome o Edge (para probar WebUSB)
- Opcional: `awscli` y `terraform` para infraestructura

## 2. Puesta en marcha desde cero

```bash
git clone <repo> && cd comandaPro

# 1. Base de datos
docker-compose up -d                 # PostgreSQL 16 en localhost:5432

# 2. Variables de entorno
cp .env.example .env                 # revisa y ajusta
cp .env.example apps/api/.env

# 3. Backend
cd apps/api
npm install --no-workspaces          # ⚠️ ver nota sobre workspaces
npx prisma db push
npm run db:seed
npm run dev                          # http://localhost:4000

# 4. Frontend (otra terminal)
cd apps/web
npm install --no-workspaces
npm run dev                          # http://localhost:3000
```

Credenciales del seed: `admin@pizzeria-bella.com` / `admin1234`, local `pizzeria-bella`.

> **Después del seed no hay servicio abierto.** Entra en Pedidos → "Iniciar servicio"
> antes de intentar crear una comanda, o la API devolverá 409.

### Nota sobre `--no-workspaces`

Aunque la raíz declara workspaces npm y Turborepo, en la práctica cada app se instala por
separado (`apps/api/package-lock.json` y `apps/web/package-lock.json` existen). El motivo
histórico son los binarios nativos de Tailwind v4 y Prisma. `turbo run dev` desde la raíz
funciona, pero la instalación fiable es por app.

## 3. Comandos

Desde la raíz (Turborepo):

```bash
npm run dev            # arranca todas las apps con dev
npm run build          # build de todas
npm run lint
npm run db:push        # prisma db push (solo desarrollo)
npm run db:seed
npm run db:studio      # Prisma Studio
```

Por app:

```bash
# api
npm run dev            # tsx watch
npm run build          # tsc
npm run db:migrate     # prisma migrate dev  ← usa esto, no db push, para cambios versionados

# web
npm run dev / build / start / lint

# print-agent
npm run dev / build / start
```

Comprobación de tipos manual (no hay script `typecheck` en las apps):

```bash
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
```

## 4. Variables de entorno

### API (`apps/api/.env`)

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `DATABASE_URL` | ✅ | Cadena de conexión PostgreSQL |
| `JWT_SECRET` | ✅ | Secreto de firma. **El mismo secreto firma tokens de staff y de clientes** |
| `APP_URL` | ✅ | URL pública del **frontend**; se usa para el QR de tracking y los enlaces de los emails |
| `PORT` | | 4000 por defecto |
| `NODE_ENV` | | `production` oculta los mensajes de error |
| `ALLOWED_ORIGINS` | | Orígenes CORS permitidos, separados por comas. Si falta, se deduce del origen de `APP_URL` |
| `MAIL_TRANSPORT` | | `ses` \| `smtp` \| `log`. Si no se indica se deduce; sin nada configurado usa `log` |
| `MAIL_FROM_ADDRESS`, `MAIL_FROM_BRAND`, `MAIL_REPLY_TO` | | Remitente de plataforma; el nombre visible lo pone el local |
| `SES_REGION` | | Región de la identidad de SES (producción: `eu-west-3`) |
| `SMTP_HOST/PORT/SECURE/USER/PASS` | | Solo para el transporte `smtp`, fuera de AWS |

> **En local no configures nada de correo.** El transporte `log` vuelca el mensaje y sus
> enlaces por consola, así puedes copiar el enlace de verificación y seguir el flujo de
> registro de la tienda online sin servidor de correo. Antes, en local, los emails
> fallaban en silencio y no había forma de completar ese flujo.

El arranque aborta si falta `DATABASE_URL`, `JWT_SECRET` o `APP_URL`.

### Web (`apps/web/.env.local`)

| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Destino del rewrite `/api/*`. Se lee **en tiempo de build** |
| `NEXT_PUBLIC_APP_URL` | URL pública del propio frontend |

### Print agent (`apps/print-agent/.env`)

`PRINT_AGENT_API_URL`, `PRINT_AGENT_EMAIL`, `PRINT_AGENT_PASSWORD`,
`PRINT_AGENT_BUSINESS_SLUG`, `PRINT_AGENT_POLL_INTERVAL_MS`, `PRINTER_NAME`.

> `.env` y `.env.*` están en `.gitignore` salvo `.env.example` y `.env.production`
> (este último solo contiene variables `NEXT_PUBLIC_*`, sin secretos). **Nunca añadas
> secretos a `.env.production`.**

## 5. Convenciones de código

### TypeScript / backend

- `strict` activado. No uses `any`; si algo no tiene tipos, declara un `.d.ts` en
  `src/types/` (hay precedente: `receipt-printer-encoder.d.ts`).
- **Validación con Zod y `safeParse`** en toda entrada externa. Nunca `parse` directo.
- **Toda consulta lleva `businessId`.** Sin excepciones. Usa `findFirst` con
  `{ id, businessId }` en lugar de `findUnique` por id.
- Devuelve `404` cuando el recurso es de otro tenant (no `403`): no reveles su existencia.
- Errores de negocio → código HTTP explícito en la ruta, no `throw`.
- Comentarios de sección con el estilo existente (`// ─── Nombre ───`).

### React / frontend

- `'use client'` en todas las páginas (patrón actual).
- Nombres de estado en camelCase descriptivo, agrupados por bloque con comentarios.
- Feedback siempre con `toast`, nunca `alert`.
- Estados de carga, vacío y error explícitos.
- Colores solo desde las variables CSS de marca.

### Idioma

- **Interfaz, mensajes de error y documentación: español.**
- **Código (identificadores, tipos, funciones): inglés.**
- Mensajes de commit: español, con prefijo convencional (`feat:`, `fix:`, `chore:`,
  `docs:`, `refactor:`, `ci:`).

## 6. Flujo de trabajo Git

Estado actual: se trabaja directamente sobre `main` y hay commits duplicados (mismo mensaje
dos veces seguidas) por reintentos de despliegue. **A partir de ahora:**

```bash
git checkout -b feat/nombre-corto
# … cambios …
git commit -m "feat: descripción en español"
git push -u origin feat/nombre-corto
gh pr create        # revisión antes de fusionar
```

Reglas:

1. Una rama por funcionalidad o corrección.
2. `main` siempre desplegable: cualquier push a `main` que toque `apps/api/**`
   **despliega a producción automáticamente** (ver [09-despliegue.md](09-despliegue.md)).
3. Nada de commits "trigger deploy" o "ci: redeploy": usa `workflow_dispatch` o
   `aws apprunner start-deployment`.
4. El PR incluye: qué cambia, cómo se ha probado y qué documentos se han actualizado.

## 7. Antes de abrir un PR

```bash
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
npm run lint --workspace=web
```

Y la comprobación manual mínima según lo tocado:

| Si tocas… | Prueba obligatoria |
|-----------|--------------------|
| Pedidos / stock | Crear pedido, comprobar descuento de stock, borrar y comprobar restauración |
| Impresión | Descargar el `.bin` y revisarlo con `strings`; probar en impresora real si es posible |
| Tienda online | Registro + verificación + pedido con la tienda activada |
| Esquema de datos | `prisma migrate dev` y revisar el SQL generado |
| Estilos | 375 px / 768 px / 1280 px |

## 8. Errores frecuentes al empezar

| Síntoma | Causa |
|---------|-------|
| 409 al crear pedido | No hay servicio activo |
| El frontend no llega a la API | `NEXT_PUBLIC_API_URL` mal puesta; recuerda que se lee **en build**: reinicia `next dev` |
| `Missing required env vars` al arrancar la API | Falta `DATABASE_URL`, `JWT_SECRET` o `APP_URL` |
| Prisma no encuentra el cliente | Falta `npx prisma generate` (se ejecuta en `db push`) |
| Emails que "se envían" pero no llegan | En local usa el transporte `log`: el mensaje y sus enlaces salen por consola. Los fallos reales se tragan con `.catch(console.error)` |
| Cambios de esquema que no aparecen | Se usó `db push` en una máquina y `migrate` en otra: revisa `prisma/migrations` |
| `P3014: could not create the shadow database` | El rol de la BD no tiene `CREATEDB`, que Prisma necesita para su base sombra: `ALTER ROLE comandapro CREATEDB;` |
| Los cambios en la BD no se ven / permisos que no surten efecto | **Puede haber dos PostgreSQL en el 5432.** Ver abajo |

### ⚠️ Un PostgreSQL nativo puede tapar al del contenedor

Si hay un PostgreSQL instalado en el sistema (Homebrew, Postgres.app), se queda con
`127.0.0.1:5432` y **`docker-compose up -d` levanta un segundo servidor que no usa nadie**:
Docker publica en `*:5432`, pero el nativo gana en `localhost`. Todo parece funcionar
—porque el nativo también tiene la base— hasta que se toca algo por `docker compose exec`
y no surte efecto, o los datos no cuadran entre una sesión y otra.

Para saber a cuál estás hablando de verdad:

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN
```

Si aparece un `postgres` que no es `com.docker`, ese es el que usa la aplicación. Aplica
ahí los cambios (`psql -h 127.0.0.1 …`), o para el servicio nativo si prefieres el
contenedor.
