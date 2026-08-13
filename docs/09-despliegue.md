# 09 — Despliegue y operación

Región AWS: **eu-west-1 (Irlanda)**. Infraestructura declarada en `infra/` con Terraform.
Guía original de creación desde cero: [`infra/DEPLOY.md`](../infra/DEPLOY.md).

## 1. Topología en producción

```mermaid
flowchart TB
  GH["GitHub main"] -->|workflow deploy-api| ECR["ECR: imagen Docker"]
  GH -->|conexión de Amplify| AMP["Amplify — Next.js SSR"]
  ECR --> AR["App Runner — API :4000"]
  AR -->|VPC connector| RDS[("RDS PostgreSQL 16<br/>subnet privada")]
  AR -->|IAM role| SSM["SSM Parameter Store<br/>DATABASE_URL · JWT_SECRET · APP_URL"]
  AMP -->|rewrite /api/*| AR
  LOCAL["print-agent en el local"] --> AR
```

| Recurso | Fichero Terraform | Notas |
|---------|-------------------|-------|
| VPC, subredes, IGW, SG | `vpc.tf` | RDS en subred privada, sin IP pública |
| RDS PostgreSQL 16 | `rds.tf` | `db.t3.micro` por defecto, `db_multi_az = false` |
| ECR + política de ciclo de vida | `ecr.tf` | |
| App Runner + conector VPC | `apprunner.tf` | 0.25 vCPU / 0.5 GB por defecto |
| Amplify | `amplify.tf` | Conexión con GitHub hecha **a mano** desde la consola |
| Roles y políticas IAM | `iam.tf` | Acceso a ECR y lectura de SSM |
| Parámetros cifrados | `ssm.tf` | `DATABASE_URL`, `JWT_SECRET` |
| Bucket S3 | `s3.tf` | Reservado; hoy no se usa desde el código |

> El estado de Terraform vive en **S3 con bloqueo en DynamoDB**
> (`comandapro-terraform-state-839380010537` / `comandapro-terraform-locks`, cifrado). El
> `infra/terraform.tfstate` local es un fichero vacío que quedó tras la migración: no lo
> uses ni te fíes de él.

### 🚨 Deriva entre Terraform y el servicio vivo

Comprobado el 2026-08-11 con `aws apprunner describe-service`:

| Variable | Declarada en `apprunner.tf` | Presente en el servicio vivo |
|----------|:---------------------------:|:----------------------------:|
| `NODE_ENV`, `APP_URL`, `ALLOWED_ORIGINS`, `ASSETS_BUCKET`, `ASSETS_BASE_URL` | ✅ | ✅ |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | ❌ | ✅ (añadidas a mano por consola) |

**Un `terraform apply` borraría las seis variables de SMTP** y el envío de correos dejaría
de funcionar. Y lo haría **en silencio**: `email.service.ts` traga los errores con
`.catch(console.error)`, así que no habría ni un 500 — simplemente los clientes dejarían de
recibir la verificación de cuenta y la confirmación de pedido.

Corregido en el parche del 2026-08-11: las seis variables ya están en `apprunner.tf` y
`SMTP_PASS` pasa a ser un secreto de SSM.

### 🚨 Amplify se desconectaría de GitHub

El mismo `terraform plan` destapó un segundo caso de deriva, más grave:

```
~ resource "aws_amplify_app" "web" {
  - repository = "https://github.com/lullaby11/comandapro-web" -> null
```

La conexión con GitHub se hizo desde la consola (Terraform no gestiona el token OAuth), así
que **cualquier `terraform apply` la habría borrado** y Amplify habría dejado de construir
el frontend al hacer push, sin más síntoma que dejar de desplegarse.

Corregido añadiendo `lifecycle { ignore_changes = [repository, oauth_token, access_token] }`
a `aws_amplify_app.web`.

> **Norma:** todo lo que se configure a mano en una consola de AWS y Terraform no pueda
> gestionar necesita un `ignore_changes` **en el mismo momento**, o se convierte en una
> bomba de relojería que estalla en el siguiente `apply`, meses después y sin relación
> aparente con el cambio que se estaba haciendo.

### `rds:CreateDBSnapshot` necesita permiso sobre DOS recursos

El 12/08/2026 el despliegue volvió a fallar en el snapshot previo, con un error casi
idéntico al de la víspera pero apuntando a otro recurso:

```
no autorizado sobre arn:aws:rds:...:db:comandapro-db          ← 11/08
no autorizado sobre arn:aws:rds:...:snapshot:...-predeploy-…  ← 12/08
```

`rds:CreateDBSnapshot` evalúa **la instancia de origen y el snapshot de destino**. La
política solo concedía la primera. Corregido añadiendo el ARN del snapshot con el prefijo
del workflow, para no autorizar snapshots arbitrarios.

> **Lección sobre `iam simulate-principal-policy`:** la primera verificación dio `allowed`
> porque solo se simuló contra el ARN de la instancia. **Una simulación solo prueba los
> recursos que le pasas.** Cuando una acción actúa sobre varios, hay que simularlos todos —
> y comprobar además que lo que debe estar denegado lo esté.

### Estado del plan tras el parche

```
Plan: 1 to add, 3 to change, 0 to destroy
```

- `aws_ssm_parameter.smtp_pass` — a crear (con valor de marcador; el real va aparte).
- `aws_apprunner_service.api` — variables de correo y `SMTP_PASS` movida a secreto.
- `aws_iam_policy.apprunner_ssm_read` — permiso de lectura del parámetro nuevo.
- `aws_iam_policy.github_actions` — deriva previa: la política del código ya incluía los
  permisos de snapshot de RDS y de rollback que el workflow usa, pero no se habían
  aplicado. Merece la pena aplicarlo: hoy el workflow depende de permisos concedidos a
  mano.

## 2. Despliegue del backend (automático)

`.github/workflows/deploy-api.yml` se dispara en push a `main` que toque `apps/api/**`:

1. **Snapshot de RDS previo** — `comandapro-db-predeploy-<timestamp>-<sha>`.
2. **Registra la imagen anterior** para poder revertir.
3. **Build y push** a ECR con dos etiquetas: `<sha>` y `latest`.
4. **`aws apprunner start-deployment`**.
5. **Espera** hasta 5 minutos a que el servicio quede en `RUNNING`.
6. **Resumen** en GitHub con las órdenes exactas de rollback.

Secretos requeridos en GitHub: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`RDS_DB_IDENTIFIER`, `ECR_REPOSITORY_NAME`, `APPRUNNER_SERVICE_ARN`.

### Migraciones de base de datos

El contenedor arranca con:

```
npx prisma migrate deploy && node dist/index.js
```

Es decir, **las migraciones se aplican en cada despliegue, sin ventana de mantenimiento**.
Consecuencias:

- Una migración que bloquee una tabla grande deja la API caída mientras dura.
- Si la migración falla, el contenedor no arranca y App Runner mantiene la versión anterior
  (buen comportamiento por defecto), pero la base ya puede estar a medias.
- **Regla:** migraciones siempre compatibles hacia atrás (columna nueva nullable → desplegar
  código → backfill → restringir en un segundo despliegue).

## 3. Despliegue del frontend

AWS Amplify conectado a GitHub, configuración en `amplify.yml`:

- `appRoot: apps/web`
- Instala manualmente los binarios nativos de Linux de Tailwind v4 y `lightningcss` y los
  copia a mano, porque Amplify no ejecuta `postinstall`. **No toques ese bloque sin probar
  el build completo**: es la causa de varios despliegues rotos históricos.
- Artefacto: `.next`, con caché de `.next/cache`.

`NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_APP_URL` se configuran como variables de entorno en la
consola de Amplify (se incrustan en el bundle **en tiempo de build**: cambiarlas exige
reconstruir).

**CORS:** la lista blanca vive en `ALLOWED_ORIGINS`. La configuración que manda en
producción es la de `infra/apprunner.tf` (`runtime_environment_variables`), porque el
despliegue es por imagen ECR; `apps/api/apprunner.yaml` solo aplicaría si App Runner
construyese desde el código.

> ⚠️ **La tienda online llama a la API entre orígenes distintos** (usa
> `NEXT_PUBLIC_API_URL` en absoluto). Si cambia el dominio desde el que se sirve la tienda,
> hay que añadirlo a `ALLOWED_ORIGINS` **antes** de desplegar, o los clientes finales dejan
> de poder pedir. Para comprobar la configuración viva:
>
> ```bash
> aws apprunner describe-service --service-arn "$APPRUNNER_SERVICE_ARN" \
>   --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables'
> ```
>
> Si la variable no estuviera definida, la API se repliega al origen de `APP_URL` en lugar
> de abrirse a todo el mundo.

## 3 bis. Correo saliente con Amazon SES

Desde agosto de 2026 el correo se envía con la **API de Amazon SES autorizada por el rol de
instancia de App Runner**. No hay credenciales: ni contraseña, ni parámetro en SSM, ni nada
que rotar o que se pueda filtrar en un `describe-service`.

### Estado de la identidad (verificado el 2026-08-11)

| | |
|---|---|
| Región de SES | **eu-west-3** (el resto de la infraestructura está en eu-west-1; funciona entre regiones) |
| Dominio `olyda.app` | Verificado |
| DKIM | `SUCCESS` (Easy DKIM, 3 CNAME) |
| MAIL FROM propio `smtp.olyda.app` | `SUCCESS`, con `BehaviorOnMxFailure = USE_DEFAULT_VALUE` |
| Acceso a producción | **Concedido** — 50.000/día, 14/s, cuenta `HEALTHY` |

> El acceso a producción es crítico: en el *sandbox* de SES solo se puede enviar a
> direcciones verificadas, así que los correos de verificación a clientes reales fallarían.

### DNS pendiente

```
TXT   smtp.olyda.app     v=spf1 include:amazonses.com ~all
TXT   _dmarc.olyda.app   v=DMARC1; p=none; rua=mailto:BUZON@olyda.app
```

El MX de `smtp.olyda.app` ya apunta a `feedback-smtp.eu-west-3.amazonses.com`, pero falta
el TXT del SPF, y el dominio no tiene DMARC. Con DKIM ya alineado, DMARC en `p=none` da
informes sin bloquear nada; se sube a `p=quarantine` tras unas semanas limpias.

> Si `olyda.app` se usa además para correo corporativo, el SPF de la raíz tiene que incluir
> también a ese proveedor.

### Permisos

`infra/ses.tf` concede `ses:SendEmail` al rol de instancia, acotado a la identidad del
dominio **y** al remitente concreto:

```hcl
Condition = { StringEquals = { "ses:FromAddress" = var.mail_from_address } }
```

Sin esa condición, el permiso sobre la identidad de dominio permitiría enviar desde
cualquier dirección `@olyda.app`.

### Desplegar

```bash
cd infra
terraform plan    # esperado: 2 to add, 2 to change, 0 to destroy
terraform apply
```

El `apply` retira las seis variables `SMTP_*` (incluida la contraseña en claro) y añade
`MAIL_TRANSPORT`, `SES_REGION`, `MAIL_FROM_ADDRESS` y `MAIL_FROM_BRAND`.

> **Orden:** despliega primero el código y aplica Terraform después. Al arrancar, la API
> registra `[email] Transporte: ses (eu-west-3) · remitente: no-reply@olyda.app`, que
> confirma de un vistazo que la configuración cargó.

### Verificar

Registra una cuenta de prueba en la tienda online y comprueba que el correo llega, que el
remitente muestra el nombre del local y que el enlace de verificación funciona. Si algo
falla, los errores de SES aparecen en CloudWatch (el envío es *fire-and-forget*: no
devuelve error al usuario).

### Rastrear un correo concreto

Cada envío queda registrado en `/aws/events/comandapro/ses` (CloudWatch Logs, **eu-west-3**,
30 días de retención), vía el conjunto de configuración `comandapro-prod`.

Cuando un cliente diga que no le ha llegado el correo:

```bash
aws logs tail /aws/events/comandapro/ses --region eu-west-3 --since 24h --format short \
  | grep "correo@delcliente.com"
```

O con Logs Insights, para ver el desenlace de cada mensaje:

```
fields @timestamp, detail.eventType, detail.mail.destination.0 as destinatario,
       detail.delivery.smtpResponse as respuesta,
       detail.bounce.bounceType as rebote,
       detail.bounce.bouncedRecipients.0.diagnosticCode as motivo
| filter detail.mail.destination.0 = "correo@delcliente.com"
| sort @timestamp desc
```

Lectura de los eventos:

| Evento | Significado | Qué hacer |
|--------|-------------|-----------|
| `Send` | SES aceptó el mensaje | — |
| `Delivery` | El servidor receptor lo aceptó (`250 OK`) | Si el cliente no lo ve, **está en su spam o en la cuarentena de su organización**: SES ya no puede decir más |
| `Bounce` (Permanent) | Buzón inexistente o dominio caído | La dirección entra en la lista de supresión; corregirla |
| `Bounce` (Transient) | Buzón lleno, receptor caído | SES reintenta; si persiste, avisar al cliente |
| `Complaint` | **Alguien marcó el correo como spam** | Lo más grave: si la tasa sube, AWS suspende la cuenta. Investigar de inmediato |
| `DeliveryDelay` | El receptor está difiriendo | Suele resolverse solo |
| `Reject` | SES rechazó el envío (p. ej. virus) | Revisar el contenido |

> **Límite importante:** un `Delivery` no significa que el cliente lo haya visto. Para el
> servidor receptor, meter un correo en cuarentena **es** una entrega correcta. Ocurrió el
> 12/08/2026 con Office 365: los eventos decían `Delivery` y los mensajes estaban retenidos
> en la cuarentena del tenant. Ese diagnóstico solo se hace desde el lado receptor
> (en Microsoft 365: **security.microsoft.com → Quarantine**, y **Seguimiento de mensajes**
> en el centro de administración de Exchange).

### Identidad y DNS no están en Terraform

La identidad de SES, su DKIM y el MAIL FROM se verificaron desde la consola y **no** se
gestionan con Terraform, porque los registros DNS viven fuera de esta cuenta. Está anotado
en `infra/ses.tf` para que nadie intente "arreglar" esa ausencia importándolos a medias.

## 3 ter. Incidencia del 11/08/2026 — lecciones del primer despliegue real

El primer despliegue que pasó por el workflow desde mayo destapó tres problemas
encadenados. Ninguno causó caída, pero conviene tenerlos presentes.

### El pipeline llevaba roto desde mayo

Las ejecuciones #32, #33 y #34 fallaron en `Create pre-deployment RDS snapshot`: el usuario
`comandapro-github-actions` no tenía `rds:CreateDBSnapshot`. Los permisos **ya estaban en
`infra/iam.tf`**, pero nunca se habían aplicado. Mientras tanto los despliegues se hacían a
mano con `docker push`, lo que explica que la imagen en producción fuera del 8 de mayo.

> **Lección:** un `terraform plan` que lleva meses sin aplicarse no es deuda inerte; es una
> diferencia entre lo que crees que está desplegado y lo que hay. Revísalo periódicamente
> aunque no vayas a cambiar nada.

### El contenedor no arrancaba: P3005

```
Error: P3005 — The database schema is not empty
```

`prisma migrate deploy` se niega a operar sobre una base preexistente sin baseline.
Producción se creó con `db push` (deuda P2-9), así que no tenía registrada la migración
inicial. Era la **primera vez que se desplegaba la API desde que existe
`prisma/migrations/`** — la imagen anterior es del 8 de mayo y la migración se creó el 11 —
así que el problema estaba latente desde entonces.

Corregido en el `CMD` del Dockerfile con `migrate resolve --applied`, que marca la
migración como aplicada sin ejecutar su SQL.

**Retirado el 12/08/2026**, una vez comprobado que el baseline coincide exactamente con el
esquema real de producción: el comando ya no hacía nada salvo escribir un `Error: P3008`
en cada arranque —ruido que despista al investigar una incidencia—. El `CMD` vuelve a ser
`prisma migrate deploy && node dist/index.js`.

> **Lo que salvó la situación:** App Runner mantiene la versión anterior mientras la nueva
> no supere el health check. El contenedor nuevo entró en bucle de reinicio y los clientes
> siguieron pidiendo con el código antiguo, sin enterarse. **No toques esa configuración.**

### Terraform no puede actualizar App Runner durante un despliegue

```
InvalidStateException: Service cannot be updated in the current state: OPERATION_IN_PROGRESS
```

Como `auto_deployments_enabled = true`, el push a `:latest` dispara un despliegue por su
cuenta, y `terraform apply` choca con él. **Espera a que el servicio esté `RUNNING` antes de
aplicar Terraform.**

### Orden correcto, ya validado

1. Merge a `main` → el workflow construye, sube la imagen y lanza el despliegue.
2. Esperar a `RUNNING` (`aws apprunner describe-service ... --query 'Service.Status'`).
3. `terraform apply`.
4. Esperar a `RUNNING` otra vez: el cambio de variables provoca un segundo reinicio.

### 🚨 El frontend estuvo tres meses sin desplegarse (11/05 → 12/08/2026)

Descubierto el 12/08/2026 al no aparecer una pantalla recién desplegada. **Los trece
builds de Amplify desde el 11 de mayo habían fallado**, así que producción servía el
frontend del 8 de mayo. Nadie lo notó porque Amplify falla en silencio: no hay aviso, y la
web sigue funcionando con la última versión buena.

Nunca llegaron a producción, entre otras cosas, **los arreglos de detección de endpoints
WebUSB para impresoras genéricas** — precisamente el problema de impresión que más soporte
genera.

**Causa:** `@types/w3c-web-usb` y `@types/web-bluetooth` se añadieron a
`devDependencies` en el commit `1a56d73`, el mismo día en que empezaron los fallos.
**Amplify instala con `NODE_ENV=production`, que se salta las dependencias de
desarrollo**, así que esos tipos no existían durante el build y `next build` abortaba con
`Property 'interfaces' does not exist on type 'USBConfiguration'`.

Todos los demás `@types` del frontend ya estaban en `dependencies` por este mismo motivo
—hay un commit de abril de 2026 titulado *"move all build deps to dependencies to fix
Amplify NODE_ENV=production install"*—. La lección se había aprendido y se volvió a perder.

> **Norma:** en `apps/web`, **todo lo que necesite el build va en `dependencies`**, incluidos
> los `@types`. `devDependencies` no existe para esta app.

**Por qué el CI no lo cazaba:** ejecutaba `tsc --noEmit`, que pasa porque en CI sí se
instalan las devDependencies. Se añade un paso que reproduce el entorno de Amplify
—`NODE_ENV=production npm install` seguido de `next build`— y que sí falla cuando debe.

### Comprobar que el frontend se ha desplegado

El workflow de GitHub **solo despliega la API**. El frontend lo construye Amplify por su
cuenta, y su resultado no aparece en GitHub:

```bash
aws amplify list-jobs --app-id d33spjlfz445rx --branch-name main --region eu-west-1 \
  --max-results 5 --query 'jobSummaries[].[jobId,status,commitId]' --output text
```

Si un despliegue incluye cambios de interfaz, **comprobar esto además del workflow**.

## 3 quater. Crear un administrador de plataforma

El panel de `/plataforma` da acceso transversal a todos los locales. Quién lo tiene se
gestiona con estos comandos, que necesitan alcanzar la base de datos:

```bash
cd apps/api
npm run platform:list
npm run platform:grant  -- persona@ejemplo.com
npm run platform:revoke -- persona@ejemplo.com
```

No crean usuarios: elevan una cuenta que ya existe.

### El primero, cuando no hay ninguno

Problema del huevo y la gallina: nadie puede conceder el primero desde la interfaz, y RDS
está en subred privada sin bastión, así que los comandos de arriba no llegan desde fuera.

Lo resuelve `POST /api/platform/bootstrap`, que **solo funciona mientras no exista ningún
administrador** —después responde 409 para siempre— y exige un secreto que vive en SSM.

```bash
# 1. Generar y guardar el secreto
aws ssm put-parameter --name "/comandapro/prod/PLATFORM_BOOTSTRAP_TOKEN" \
  --value "$(openssl rand -hex 32)" --type SecureString --overwrite --region eu-west-1

# 2. Declararlo en infra/ssm.tf, referenciarlo desde runtime_environment_secrets en
#    apprunner.tf y añadirlo a la política apprunner_ssm_read en iam.tf. Después:
cd infra && terraform apply

# 3. Conceder el acceso (el token se lee de SSM sobre la marcha)
curl -sS -X POST https://api.olyda.app/api/platform/bootstrap \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$(aws ssm get-parameter --name /comandapro/prod/PLATFORM_BOOTSTRAP_TOKEN \
       --with-decryption --region eu-west-1 --query Parameter.Value --output text)\",\
       \"email\":\"persona@ejemplo.com\"}"

# 4. RETIRARLO: deshacer los cambios de Terraform del paso 2 y aplicar.
#    Sin la variable, el endpoint responde 404 como si no existiera.
```

> **Si creas el parámetro con `put-parameter` antes de aplicar Terraform**, este intentará
> crearlo de nuevo y chocará. Impórtalo primero:
> `terraform import aws_ssm_parameter.platform_bootstrap_token "/comandapro/prod/PLATFORM_BOOTSTRAP_TOKEN"`,
> y comprueba en el plan que `ignore_changes` protege el valor —solo deberían cambiar las
> etiquetas—.

**Comprobación útil:** llamar al endpoint con un token cualquiera distingue el estado sin
revelar nada. `404` = no está configurado · `409` = ya hay administrador · `401` = no hay
ninguno y el token es incorrecto.

## 4. Rollback

### Aplicación

```bash
./scripts/rollback.sh <SHA_ANTERIOR>
```

Requiere `AWS_REGION`, `ECR_REGISTRY`, `ECR_REPOSITORY_NAME`, `APPRUNNER_SERVICE_ARN`.
El script verifica que la imagen exista en ECR, la re-etiqueta como `latest` y lanza el
despliegue.

### Aplicación + base de datos

```bash
./scripts/rollback.sh <SHA_ANTERIOR> <SNAPSHOT_ID>
```

Restaurar un snapshot de RDS **crea una instancia nueva**: hay que repuntar
`DATABASE_URL` en SSM y redesplegar. Es una operación con pérdida de datos desde el
snapshot; úsala solo ante corrupción real.

## 5. Comprobaciones tras desplegar

```bash
curl -s https://<app-runner-host>/health
curl -s https://<app-runner-host>/api/public/<slug-de-un-local-con-tienda>
```

Y en el frontend: login → abrir servicio → crear pedido de prueba → imprimir → borrarlo.

## 6. Runbooks

### La API responde 500 en todo

1. Logs de App Runner en CloudWatch: `[Error]` incluye mensaje y stack.
2. Comprueba que las tres variables obligatorias existen (si falta una, el proceso muere al
   arrancar con `[startup] Missing required env vars`).
3. Comprueba la conectividad con RDS (grupo de seguridad y conector VPC).

### La base de datos no acepta conexiones

App Runner se conecta por el conector VPC. Revisa el grupo de seguridad de RDS
(`aws_security_group.rds`) y que el número de conexiones no esté agotado — Prisma abre un
pool por instancia y App Runner escala instancias: **con autoescalado agresivo se puede
agotar `max_connections` de una `db.t3.micro`**. Mitigación: limitar `connection_limit` en
la `DATABASE_URL` (`?connection_limit=5`) y acotar el máximo de instancias.

### Un local no puede imprimir

Ver la guía de incidencias en [06-impresion.md §4](06-impresion.md#4-guía-de-resolución-de-incidencias).

### Los emails no llegan

`email.service.ts` usa nodemailer con timeouts de 8–10 s y los fallos se registran con
`console.error` sin reintento. Revisa CloudWatch, las credenciales SMTP y el límite de
envíos del proveedor. **No hay cola ni reintentos**: si el SMTP estaba caído, ese email se
perdió para siempre.

### Hay que suspender un local moroso

Hoy **no existe** un mecanismo de suspensión. Alternativa manual: poner
`onlineOrderEnabled = false` y cambiar la contraseña del `OWNER`. Es una de las carencias a
resolver en la fase SaaS ([12-roadmap.md](12-roadmap.md)).

## 7. Costes aproximados (orden de magnitud)

| Servicio | Configuración | Coste mensual estimado |
|----------|---------------|------------------------|
| App Runner | 0,25 vCPU / 0,5 GB, siempre activo | 15–25 € |
| RDS | `db.t3.micro`, sin Multi-AZ | 15–20 € (gratis el primer año con free tier) |
| Amplify | build + hosting SSR | 5–15 € según tráfico |
| ECR / SSM / datos | | 1–5 € |
| **Total** | | **≈ 40–60 €/mes** |

Con el plan Básico hipotético de 29 €/mes, la infraestructura se cubre a partir del
**tercer local**. Cualquier decisión de arquitectura debe medirse contra ese margen.

## 8. Copias de seguridad

- Snapshot automático **antes de cada despliegue de la API** (workflow).
- RDS: `backup_retention_period = 7` días, `storage_encrypted = true`,
  `deletion_protection = true`, `skip_final_snapshot = false`, sin acceso público
  (`infra/rds.tf`). Configuración correcta.
- **No hay prueba de restauración periódica.** Un backup no probado no es un backup:
  planifica un simulacro trimestral y anota el resultado aquí.
