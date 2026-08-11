# 0005 — Despliegue en AWS App Runner + Amplify + RDS

- **Estado:** Aceptada
- **Fecha:** 2026-04 (documentada retroactivamente el 2026-08-06)
- **Afecta a:** infra, .github/workflows, apps/api, apps/web

## Contexto

Se necesitaba una plataforma de despliegue sin administración de servidores, con coste
inicial cercano a cero (free tier) y capacidad de crecer a decenas o cientos de locales.
El equipo es de una persona: cada hora dedicada a operar infraestructura es una hora que no
se dedica al producto.

## Opciones consideradas

1. **VPS único con Docker Compose.** El más barato (~10 €/mes) pero exige parchear el
   sistema, gestionar copias de seguridad y certificados a mano, y no escala solo.
2. **ECS Fargate + ALB.** Control total, pero mucha más superficie de Terraform y coste fijo
   del balanceador.
3. **App Runner (backend) + Amplify (frontend) + RDS.** Sin servidores, HTTPS y escalado
   incluidos, despliegue desde una imagen de ECR.
4. **Vercel (frontend) + Railway/Render (backend).** Muy cómodo, pero deja los datos fuera
   de la VPC y complica el cumplimiento a futuro.

## Decisión

Opción 3, todo en `eu-west-1`:

- **App Runner** ejecuta la imagen Docker de la API, con conector VPC hacia RDS y secretos
  desde SSM Parameter Store.
- **RDS PostgreSQL 16** en subred privada, cifrado, sin acceso público, 7 días de backups.
- **Amplify** compila y sirve el Next.js con SSR.
- **ECR** guarda las imágenes; **GitHub Actions** construye, sube y despliega.

## Consecuencias

### Positivas
- Cero mantenimiento de sistema operativo; HTTPS y escalado automáticos.
- Base de datos inaccesible desde internet.
- Despliegue reproducible con snapshot previo de RDS y rollback documentado
  (`scripts/rollback.sh`).
- Infraestructura declarada en Terraform.

### Negativas / coste asumido
- **Coste base de ~40–60 €/mes** aunque no haya ningún cliente: la rentabilidad empieza en
  el tercer local.
- App Runner no permite ejecutar migraciones en un paso separado: se aplican en el arranque
  del contenedor (`prisma migrate deploy && node dist/index.js`), sin ventana de
  mantenimiento.
- Amplify no ejecuta `postinstall`, lo que obligó a parchear a mano los binarios nativos de
  Tailwind v4 en `amplify.yml` — un punto de fragilidad conocido.
- La conexión de Amplify con GitHub se hizo desde la consola, así que **no está del todo
  reflejada en Terraform**. Lo mismo pasó con las variables de correo, añadidas a mano y
  recuperadas para Terraform el 2026-08-06.
- El estado sí está en S3 con bloqueo en DynamoDB desde el 21/04/2026.

### Qué haría falta para revertirla
La API es una imagen Docker sin dependencias de App Runner: se puede mover a ECS, Fly.io o
un VPS cambiando el destino del despliegue. El frontend Next.js con `output: standalone`
es igualmente portable. El punto de anclaje real es RDS dentro de la VPC.
