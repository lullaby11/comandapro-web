# Guía de Despliegue — ComandaPro en AWS

## Arquitectura

```
GitHub Actions ──push──► ECR ──image──► App Runner ──VPC connector──► RDS (privado)
                                              ▲
                                         SSM Secrets
                                    (DATABASE_URL, JWT_SECRET)

GitHub ──push main──► AWS Amplify (Next.js SSR)

[Local — junto a la impresora]
  apps/print-agent  →  USB  →  Impresora térmica
```

| Servicio | Rol |
|---|---|
| **AWS App Runner** | Backend Express API (autoescalado, sin servidores) |
| **AWS RDS PostgreSQL 16** | Base de datos en subnet privada |
| **AWS ECR** | Registro de imágenes Docker |
| **AWS Amplify** | Frontend Next.js con SSR |
| **AWS SSM Parameter Store** | Secrets cifrados (DATABASE_URL, JWT_SECRET) |
| **AWS VPC** | Red privada — RDS no expuesto a internet |

---

## Prerrequisitos

```bash
brew install terraform awscli
aws configure   # Access Key + Secret de tu cuenta AWS con permisos de AdministratorAccess
```

Verifica que funciona:
```bash
aws sts get-caller-identity
terraform -version   # >= 1.4 — compatible con OpenTofu (fork OSS de Terraform)
```

---

## Paso 1 — Variables de Terraform

Crea el fichero `infra/terraform.tfvars` (no lo subas a git):

```hcl
# No se necesitan credenciales de GitHub — la conexión se hace manualmente (ver Paso 2b)
```

Variables opcionales que puedes sobreescribir:

```hcl
aws_region        = "eu-west-1"   # Irlanda (por defecto)
db_instance_class = "db.t3.micro" # Cambia a db.t3.small para más carga
db_multi_az       = false         # true para alta disponibilidad (más coste)
api_cpu           = "0.25 vCPU"
api_memory        = "0.5 GB"
```

---

## Paso 2a — Crear infraestructura base (sin App Runner)

App Runner falla si intenta arrancar sin imagen en ECR. Por eso creamos primero
el resto de la infraestructura y subimos la imagen antes de crear el servicio.

```bash
cd infra
terraform init

# Crear todo excepto App Runner
terraform apply \
  -target=aws_vpc.main \
  -target=aws_subnet.private \
  -target=aws_subnet.public \
  -target=aws_internet_gateway.main \
  -target=aws_route_table.public \
  -target=aws_route_table_association.public \
  -target=aws_security_group.apprunner_connector \
  -target=aws_security_group.rds \
  -target=aws_db_subnet_group.main \
  -target=aws_db_instance.postgres \
  -target=aws_ecr_repository.api \
  -target=aws_ecr_lifecycle_policy.api \
  -target=aws_iam_role.apprunner_ecr_access \
  -target=aws_iam_role_policy_attachment.apprunner_ecr_access \
  -target=aws_iam_role.apprunner_instance \
  -target=aws_iam_policy.apprunner_ssm_read \
  -target=aws_iam_role_policy_attachment.apprunner_ssm \
  -target=aws_ssm_parameter.db_url \
  -target=aws_ssm_parameter.jwt_secret
```

Anota el output del repositorio ECR:
```bash
terraform output ecr_repository_url
```

---

## Paso 2b — Conectar GitHub a Amplify (consola)

La integración GitHub → Amplify se hace desde la consola para evitar problemas
de permisos de webhook con PAT:

1. Ve a **AWS Console → Amplify → All apps → comandapro-web** (creado en el step anterior... espera, Amplify lo creamos en el apply completo — ver Paso 4)

> **Nota:** Amplify se conecta a GitHub en el Paso 4 directamente desde la consola.

---

## Paso 3 — Subir la primera imagen Docker a ECR

```bash
# Desde la raíz del proyecto
ECR_URL=$(cd infra && terraform output -raw ecr_repository_url)
AWS_REGION=eu-west-1

aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ECR_URL

docker build -t $ECR_URL:latest -f apps/api/Dockerfile .
docker push $ECR_URL:latest
```

---

## Paso 4 — Apply completo (App Runner + Amplify)

Con la imagen en ECR, ahora sí podemos crear App Runner:

```bash
cd infra
terraform apply
```

Al terminar, anota los outputs:
```bash
terraform output api_url      # https://xxxx.eu-west-1.awsapprunner.com
terraform output amplify_url  # https://main.xxxx.amplifyapp.com
```

### Conectar GitHub a Amplify desde la consola

1. Ve a **AWS Console → Amplify → comandapro-web → Hosting → Connect branch**
2. Selecciona **GitHub** como proveedor → autoriza con OAuth (no PAT)
3. Elige tu repositorio y la rama `main`
4. En **App settings → Monorepo settings**, indica `apps/web` como directorio raíz
5. Guarda — Amplify lanzará el primer build automáticamente

---

## Paso 5 — Actualizar URLs cruzadas

Con las URLs reales, actualiza las variables cruzadas para que los QR codes
y el CORS funcionen correctamente:

```bash
cd infra
terraform apply \
  -var="api_url=https://xxxx.eu-west-1.awsapprunner.com" \
  -var="frontend_url=https://main.xxxx.amplifyapp.com"
```

Esto actualiza:
- `APP_URL` y `ALLOWED_ORIGINS` en App Runner → nuevo despliegue automático
- `NEXT_PUBLIC_API_URL` en Amplify → nuevo build automático

---

## Paso 6 — Configurar GitHub Secrets para CI/CD

```bash
cd infra
terraform output -raw github_actions_access_key_id
terraform output -raw github_actions_secret_access_key
terraform output -raw ecr_repository_url
terraform output -raw apprunner_service_arn
```

Añádelas en GitHub → tu repo → **Settings → Secrets and variables → Actions**:

| Secret | Valor |
|---|---|
| `AWS_ACCESS_KEY_ID` | output `github_actions_access_key_id` |
| `AWS_SECRET_ACCESS_KEY` | output `github_actions_secret_access_key` |
| `ECR_REPOSITORY_NAME` | `comandapro/api` |
| `APPRUNNER_SERVICE_ARN` | output `apprunner_service_arn` |

A partir de aquí, cada push a `main` que modifique `apps/api/**` despliega automáticamente.

---

## Paso 7 — Migraciones iniciales

El Dockerfile ejecuta `prisma migrate deploy` al arrancar, así que las migraciones
corren solas cuando App Runner inicia el contenedor.

Verifica en los logs de App Runner (consola → Logs):
```
Prisma Migrate applied the following migration(s)
```

---

## Paso 8 (opcional) — Estado remoto en S3

Recomendado antes de trabajar en equipo o en producción real.

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET="comandapro-terraform-state-$ACCOUNT_ID"

aws s3 mb s3://$BUCKET --region eu-west-1
aws s3api put-bucket-versioning \
  --bucket $BUCKET \
  --versioning-configuration Status=Enabled

aws dynamodb create-table \
  --table-name comandapro-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region eu-west-1
```

Descomenta el bloque `backend "s3"` en [main.tf](main.tf) y ejecuta:

```bash
terraform init -migrate-state
```

---

## Agente local de impresión

El único componente que corre en local es `apps/print-agent`.
Configura su `.env` en el ordenador conectado a la impresora:

```env
PRINT_AGENT_API_URL=https://xxxx.eu-west-1.awsapprunner.com
PRINT_AGENT_EMAIL=admin@tu-local.com
PRINT_AGENT_PASSWORD=tu-password
PRINT_AGENT_BUSINESS_SLUG=tu-local
PRINT_AGENT_POLL_INTERVAL_MS=5000

# Ajusta según tu modelo de impresora (lsusb en Linux/Mac, Device Manager en Windows)
PRINTER_VENDOR_ID=0x04b8   # Epson
PRINTER_PRODUCT_ID=0x0202  # TM-T20
```

```bash
cd apps/print-agent
npm install
npm run dev              # desarrollo
npm run build && npm start   # producción
```

---

## Referencia de coste estimado (eu-west-1)

| Servicio | Tier | Coste/mes aprox. |
|---|---|---|
| App Runner | 0.25 vCPU / 0.5 GB, ~10h activas/día | ~5-15 € |
| RDS PostgreSQL | db.t3.micro, 20 GB gp3 | ~15-20 € |
| ECR | < 500 MB imágenes | < 1 € |
| Amplify | Build + hosting SSR | ~5-10 € |
| SSM Parameter Store | SecureString x2 | < 1 € |
| VPC / NAT | Sin NAT Gateway | 0 € |
| **Total estimado** | | **~25-50 €/mes** |

> Para reducir costes en desarrollo: `db_instance_class = "db.t3.micro"` y
> `db_multi_az = false`. Para producción con carga real, considera `db.t3.small`
> y activar Multi-AZ.
