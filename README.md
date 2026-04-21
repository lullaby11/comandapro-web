# ComandaPro 🍕

> Sistema SaaS de gestión de pedidos a domicilio con impresión térmica ESC/POS real.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma 5 |
| Base de Datos | PostgreSQL 16 |
| Impresión | `@point-of-sale/receipt-printer-encoder` (ESC/POS) |
| QR | `qrcode` |
| Deploy Frontend | Vercel |
| Deploy Backend | AWS App Runner |

## Inicio rápido (desarrollo local)

### 1. Prerrequisitos

- Node.js 20+
- Docker Desktop (para PostgreSQL)

### 2. Arrancar base de datos

```bash
docker-compose up -d
```

### 3. Configurar entorno del backend

```bash
cp .env.example apps/api/.env
# Edita apps/api/.env si es necesario
```

### 4. Instalar dependencias del backend

```bash
cd apps/api
npm install --no-workspaces
```

### 5. Aplicar esquema de BD y seed

```bash
cd apps/api
npx prisma db push
npm run db:seed
```

Tras el seed tendrás:
- 🏪 Local: **Pizzería Bella Italia** (`slug: pizzeria-bella`)
- 👤 Usuario: `admin@pizzeria-bella.com` / `admin1234`
- 🍕 13 productos (incluyendo uno agotado)
- 👥 3 clientes de prueba

### 6. Arrancar el backend

```bash
cd apps/api
npm run dev
# → http://localhost:4000
```

### 7. Instalar dependencias del frontend

```bash
cd apps/web
npm install --no-workspaces
```

### 8. Arrancar el frontend

```bash
cd apps/web
npm run dev
# → http://localhost:3000
```

### 9. Abrir la app

Navega a **http://localhost:3000** y usa las credenciales del seed.

---

## Estructura del proyecto

```
comandaPro/
├── apps/
│   ├── api/            # Node.js + Express (Backend)
│   │   ├── src/
│   │   │   ├── routes/         # orders, products, customers, auth, settings, tracking
│   │   │   ├── services/       # printer.service.ts, stock.service.ts
│   │   │   ├── middleware/     # auth JWT + tenant isolation
│   │   │   └── prisma/         # Prisma client singleton
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Esquema multi-tenant
│   │   │   └── seed.ts
│   │   ├── Dockerfile
│   │   └── apprunner.yaml
│   │
│   └── web/            # Next.js 14 (Frontend)
│       └── src/app/
│           ├── login/
│           ├── dashboard/
│           │   ├── orders/new/         # ← Flujo <30s
│           │   ├── products/
│           │   ├── customers/
│           │   └── settings/
│           └── tracking/[token]/       # Página pública QR
│
├── docker-compose.yml
└── turbo.json
```

---

## Impresión térmica

El sistema usa `@point-of-sale/receipt-printer-encoder` para generar buffers ESC/POS reales.

### Flujo de impresión (WebUSB)

1. El frontend llama a `POST /api/orders/:id/print`
2. El backend genera el buffer ESC/POS con logo + cliente + productos + QR
3. El frontend recibe el `Uint8Array` y lo envía a la impresora via `navigator.usb`

> **Nota:** WebUSB solo funciona en Chrome/Edge. Para Firefox, usar el modo "servidor local".

### Anchos de papel soportados

| Papel | Caracteres/línea | Dots |
|-------|-----------------|------|
| 58mm  | 32              | 384  |
| 80mm  | 48              | 576  |

---

## Multi-tenant

Cada `Business` tiene un `slug` único y todos los datos (productos, clientes, pedidos) están aislados por `businessId`. El JWT incluye el `businessId` y todos los endpoints verifican la pertenencia.

---

## Despliegue en producción

### Backend → AWS App Runner

```bash
# Configurar en App Runner:
# - Source: ECR o GitHub
# - Config file: apps/api/apprunner.yaml
# - Variables: DATABASE_URL, JWT_SECRET, APP_URL, ALLOWED_ORIGINS
```

### Frontend → Vercel

```bash
# Importar el repo en Vercel
# Root directory: apps/web
# Variables de entorno: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_APP_URL
```

---

## API Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/auth/login` | ❌ | Login JWT |
| POST | `/api/auth/register` | ❌ | Crear local + owner |
| GET | `/api/products` | ✅ | Listar productos |
| POST | `/api/products` | ✅ | Crear producto |
| GET | `/api/customers/by-phone/:phone` | ✅ | Buscar cliente |
| POST | `/api/customers` | ✅ | Crear cliente |
| POST | `/api/orders` | ✅ | Crear pedido (valida stock) |
| PATCH | `/api/orders/:id/status` | ✅ | Cambiar estado |
| **POST** | **`/api/orders/:id/print`** | ✅ | **Genera buffer ESC/POS** |
| GET | `/api/tracking/:token` | ❌ | Tracking público |
| GET | `/api/settings` | ✅ | Config del local |
| PATCH | `/api/settings` | ✅ | Actualizar config |
