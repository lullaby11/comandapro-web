# ComandaPro / Olyda 🍕

> SaaS multi-tenant de gestión de pedidos a domicilio con impresión térmica ESC/POS real,
> tienda online por local y seguimiento público por QR.

📚 **La documentación completa está en [`docs/`](docs/README.md).** Este README solo cubre
la puesta en marcha. Antes de desarrollar, lee [`CLAUDE.md`](CLAUDE.md) y
[`docs/08-entorno-desarrollo.md`](docs/08-entorno-desarrollo.md).

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16 (App Router) + React 19 + Tailwind v4 |
| Backend | Node.js 20 + Express + TypeScript |
| ORM | Prisma 5 |
| Base de datos | PostgreSQL 16 |
| Impresión | `@point-of-sale/receipt-printer-encoder` (ESC/POS) + WebUSB / Web Bluetooth / CUPS |
| QR e imágenes | `qrcode` + `jimp` |
| Email | `nodemailer` |
| Despliegue frontend | AWS Amplify (SSR) |
| Despliegue backend | AWS App Runner (Docker + ECR) |
| Base de datos gestionada | AWS RDS PostgreSQL en subred privada |
| Infraestructura como código | Terraform (`infra/`) |

## Inicio rápido (desarrollo local)

Requisitos: Node.js ≥ 20, Docker Desktop, Chrome o Edge (para WebUSB).

```bash
# 1. Base de datos
docker-compose up -d

# 2. Variables de entorno
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local     # deja solo las NEXT_PUBLIC_*

# 3. Backend
cd apps/api
npm install --no-workspaces
npx prisma db push
npm run db:seed
npm run dev            # → http://localhost:4000

# 4. Frontend (otra terminal)
cd apps/web
npm install --no-workspaces
npm run dev            # → http://localhost:3000
```

Tras el seed:

- 🏪 Local **Pizzería Bella Italia** (`slug: pizzeria-bella`)
- 👤 `admin@pizzeria-bella.com` / `admin1234`
- 🍕 13 productos (uno agotado) y 3 clientes de prueba

> ⚠️ **El seed no abre ningún servicio.** Entra en *Pedidos → Iniciar servicio* antes de
> crear una comanda, o la API responderá `409`.

## Estructura

```
comandaPro/
├── apps/
│   ├── api/            Express + Prisma  (routes, services, middleware, prisma)
│   ├── web/            Next.js           (login, register, dashboard, tracking, [slug]/pedidos)
│   └── print-agent/    Agente local de impresión vía CUPS
├── packages/shared-types/   (vacío — pendiente)
├── infra/              Terraform + guía de despliegue
├── docker/             init.sql de PostgreSQL
├── scripts/rollback.sh
├── docs/               📚 Documentación (fuente de verdad)
└── CHANGELOG.md
```

## Impresión térmica

El backend genera el buffer ESC/POS completo (logo, cliente, artículos, totales, QR de
seguimiento y corte) y el cliente lo transporta a la impresora:

| Modo | Transporte | Requisitos |
|------|-----------|------------|
| `webusb` | `navigator.usb` desde el navegador | Chrome/Edge de escritorio, HTTPS o localhost |
| `bluetooth` | Web Bluetooth (BLE serie) | Chrome; ⚠️ ver bug conocido en `docs/11-deuda-tecnica.md` |
| `printserver` | `apps/print-agent` → `lp -o raw` | CUPS instalado en el local |

| Papel | Caracteres/línea | Dots |
|-------|-----------------|------|
| 58 mm | 32 | 384 |
| 80 mm | 48 | 576 |

Detalles y resolución de incidencias: [`docs/06-impresion.md`](docs/06-impresion.md).

## Multi-tenant

Cada `Business` tiene un `slug` único y todos los datos están aislados por `businessId`.
El JWT incluye el `businessId` y `authMiddleware` revalida en cada petición que el usuario
sigue teniendo acceso al local. Ver [`docs/10-seguridad.md`](docs/10-seguridad.md).

## Despliegue

Push a `main` que toque `apps/api/**` → GitHub Actions crea un snapshot de RDS, construye
la imagen, la sube a ECR y despliega en App Runner. El frontend lo compila Amplify desde el
mismo repositorio.

Guía completa, rollback y runbooks: [`docs/09-despliegue.md`](docs/09-despliegue.md).

## API

Resumen de familias de endpoints (referencia completa en
[`docs/04-api-reference.md`](docs/04-api-reference.md)):

| Prefijo | Auth | Contenido |
|---------|------|-----------|
| `/api/auth` | 🔓 | Login y alta de local |
| `/api/services` | 🔒 | Abrir y cerrar turno |
| `/api/orders` | 🔒 | Pedidos, estados, borrado e **impresión ESC/POS** |
| `/api/products` | 🔒 | Catálogo y stock |
| `/api/customers` | 🔒 | Clientes del local |
| `/api/shipping-rates` | 🔒 | Tarifas de envío (escritura: admin) |
| `/api/settings` | 🔒 | Configuración del local (escritura: admin) |
| `/api/stats` | 🔒 | Estadísticas por servicio, cliente, producto, categoría y periodo |
| `/api/tracking/:token` | 🔓 | Seguimiento público del pedido |
| `/api/public/:slug` | 🔓 / 🔒 cliente | Tienda online: catálogo, cuentas y pedidos |
| `/health` | 🔓 | Estado del servicio |

## Estado y siguientes pasos

Consulta [`docs/11-deuda-tecnica.md`](docs/11-deuda-tecnica.md) (problemas conocidos
priorizados) y [`docs/12-roadmap.md`](docs/12-roadmap.md) (plan de versiones hasta poder
comercializarlo).
