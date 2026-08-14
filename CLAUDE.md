# CLAUDE.md — Guía rápida del repositorio

Contexto imprescindible para trabajar en ComandaPro / Olyda. La documentación completa está
en [`docs/`](docs/README.md); **léela antes de cambios no triviales**.

## Qué es

SaaS multi-tenant de gestión de comandas para locales de comida a domicilio: toma de
pedidos en menos de 30 s, impresión térmica ESC/POS real, tienda online por local y
seguimiento público por QR. **Está en producción con locales reales sirviendo pedidos.**

## Estructura

```
apps/api          Express + Prisma + PostgreSQL   → AWS App Runner
apps/web          Next.js 16 App Router           → AWS Amplify
apps/print-agent  Agente Node junto a la impresora (CUPS)
packages/shared-types  (vacío)
infra             Terraform (VPC, RDS, ECR, App Runner, Amplify, SSM)
docs              Documentación — fuente de verdad
```

## Comandos

```bash
docker-compose up -d                                   # PostgreSQL local
cd apps/api  && npm install --no-workspaces && npm run dev   # :4000
cd apps/web  && npm install --no-workspaces && npm run dev   # :3000
npm run db:seed --workspace=api                        # datos de ejemplo
npx tsc --noEmit -p apps/api/tsconfig.json             # comprobación de tipos
```

Seed: `admin@pizzeria-bella.com` / `admin1234`, local `pizzeria-bella`.

```bash
npm test --workspace=api    # necesita DATABASE_URL_TEST
```

> Si tienes un PostgreSQL instalado en el sistema, **se queda con el 5432 y el contenedor
> queda inservible sin que lo notes**. Compruébalo con `lsof -nP -iTCP:5432 -sTCP:LISTEN`.
> Ver [`docs/08-entorno-desarrollo.md`](docs/08-entorno-desarrollo.md).

## Reglas que no se negocian

1. **Multi-tenant:** toda consulta filtra por `businessId`, que **siempre** sale del JWT,
   nunca del cuerpo de la petición. Usa `findFirst({ where: { id, businessId } })`, no
   `findUnique` por id. Devuelve `404` (no `403`) si el recurso es de otro local.
2. **Validación:** toda entrada externa pasa por Zod con `safeParse`.
3. **El servicio (turno) manda:** sin `Service` activo no se pueden crear pedidos, ni en el
   local ni online.
4. **Precios del servidor:** el importe se calcula en la API con los precios de la base de
   datos y se congela en `OrderItem.unitPrice`.
5. **Idioma:** interfaz y mensajes en español; código en inglés.
6. **Roles:** `authMiddleware` deniega el rol `DELIVERY`. Una ruta de gestión nueva nace
   cerrada al reparto y así debe quedarse; solo `/api/delivery/*` usa `authReparto`. Ver
   [`docs/10-seguridad.md`](docs/10-seguridad.md#roles).
7. **Despliegue:** un merge a `main` que toque `apps/api/**` **despliega a producción**.
   Trabaja en ramas y abre PR.

## Cosas que sorprenden si no las sabes

- El frontend llama a `/api/...` en **relativo**; el rewrite de `next.config.ts` lo redirige
  a `NEXT_PUBLIC_API_URL`. Por eso hay `const API = ''` en las páginas.
- `NEXT_PUBLIC_*` se lee **en tiempo de build**: cambiarla exige recompilar.
- `APP_URL` (backend) apunta al **frontend**, no a la API: se usa en el QR y en los emails.
- La impresión genera el buffer ESC/POS **en el servidor**; el navegador solo lo empuja por
  WebUSB/Bluetooth, desde `src/lib/impresion.ts`. El endpoint USB **se busca en el
  descriptor** del dispositivo: no está siempre en la interfaz 0. Ver
  [`docs/06-impresion.md`](docs/06-impresion.md).
- `printer.service.ts` elimina tildes y ñ a propósito (`sanitize`): muchas impresoras
  genéricas no respetan la página de códigos.
- Las páginas del dashboard son monolíticas (900–1100 líneas). `src/lib/` ya tiene
  `api.ts` e `impresion.ts`; `src/components/` sigue **vacía**. Cuando algo esté duplicado
  en dos páginas, sácalo a `src/lib/` en vez de copiarlo: las dos copias del transporte de
  impresión divergieron y una acabó rota.
- `/reparto` no comparte layout con el dashboard, y es a propósito: un repartidor recibe
  403 en todas esas pantallas.
- El estilo real se escribe con variables CSS de `globals.css` + estilos inline. Tailwind
  está instalado pero apenas se usa: **imita el fichero que estés tocando**.

## Antes de dar algo por terminado

- [ ] `tsc --noEmit` limpio en api y web
- [ ] Probado el flujo afectado a mano (crear pedido, imprimir, etc.)
- [ ] Documentación de `docs/` actualizada
- [ ] `CHANGELOG.md` actualizado si es visible para el usuario

## Dónde mirar según el trabajo

| Trabajo | Documento |
|---------|-----------|
| Entender el sistema | [`docs/02-arquitectura.md`](docs/02-arquitectura.md) |
| Tocar la base de datos | [`docs/03-modelo-datos.md`](docs/03-modelo-datos.md) |
| Añadir o cambiar endpoints | [`docs/04-api-reference.md`](docs/04-api-reference.md) |
| Interfaz | [`docs/05-frontend.md`](docs/05-frontend.md) |
| Impresoras | [`docs/06-impresion.md`](docs/06-impresion.md) |
| Reglas de negocio | [`docs/07-flujos-negocio.md`](docs/07-flujos-negocio.md) |
| Desplegar o una incidencia en producción | [`docs/09-despliegue.md`](docs/09-despliegue.md) |
| Qué está mal y qué toca después | [`docs/11-deuda-tecnica.md`](docs/11-deuda-tecnica.md) · [`docs/12-roadmap.md`](docs/12-roadmap.md) |
