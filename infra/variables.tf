variable "aws_region" {
  description = "Región AWS donde se despliega toda la infraestructura"
  type        = string
  default     = "eu-west-1" # Irlanda — más cercana a España
}

variable "project_name" {
  description = "Prefijo usado en todos los recursos AWS"
  type        = string
  default     = "comandapro"
}

variable "environment" {
  description = "Entorno de despliegue"
  type        = string
  default     = "prod"
}

# ── Red ───────────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block del VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "AZs a usar (mínimo 2 para RDS Multi-AZ)"
  type        = list(string)
  default     = ["eu-west-1a", "eu-west-1b"]
}

# ── Base de datos ─────────────────────────────────────────────────────────────

variable "db_name" {
  description = "Nombre de la base de datos PostgreSQL"
  type        = string
  default     = "comandapro"
}

variable "db_username" {
  description = "Usuario administrador de RDS"
  type        = string
  default     = "comandapro"
}

variable "db_instance_class" {
  description = "Tipo de instancia RDS"
  type        = string
  default     = "db.t3.micro" # Cambiar a db.t3.small o db.t3.medium en producción real
}

variable "db_allocated_storage" {
  description = "Almacenamiento inicial en GB"
  type        = number
  default     = 20
}

variable "db_multi_az" {
  description = "Habilitar Multi-AZ para alta disponibilidad (incrementa coste)"
  type        = bool
  default     = false
}

# ── App Runner ────────────────────────────────────────────────────────────────

variable "api_cpu" {
  description = "vCPU para App Runner (0.25, 0.5, 1, 2, 4)"
  type        = string
  default     = "0.25 vCPU"
}

variable "api_memory" {
  description = "Memoria para App Runner (0.5, 1, 2, 3, 4, 6, 8, 10, 12 GB)"
  type        = string
  default     = "0.5 GB"
}

variable "api_url" {
  description = <<-EOT
    URL pública de la API (App Runner).
    Dejar vacío en el primer apply. Después de obtener la URL,
    ejecutar: terraform apply -var="api_url=https://x4ra2uy3w2.eu-west-1.awsapprunner.com"
  EOT
  type        = string
  default     = ""
}

# ── Frontend (Amplify) ────────────────────────────────────────────────────────
# La conexión con GitHub se hace manualmente desde la consola de Amplify.
# Ver DEPLOY.md → Paso 2b.

variable "frontend_branch" {
  description = "Rama de GitHub que Amplify despliega en producción"
  type        = string
  default     = "main"
}

variable "frontend_url" {
  description = <<-EOT
    URL pública del frontend (Amplify).
    Dejar vacío en el primer apply. Después actualizar con la URL de Amplify.
  EOT
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Dominio principal de la aplicación (sin protocolo)"
  type        = string
  default     = "olyda.app"
}

# ── Correo saliente (Amazon SES) ──────────────────────────────────────────────
# Estas variables estaban configuradas a mano en la consola de App Runner y no en
# Terraform: un `apply` las habría borrado, dejando el sistema sin envío de correo
# en silencio (email.service.ts se traga los errores). Ahora se gestionan aquí.
#
# No hay credenciales: el envío se autoriza con el rol de instancia (ver ses.tf).

variable "ses_region" {
  description = <<-EOT
    Región donde está verificada la identidad de SES. No tiene por qué coincidir con
    aws_region: la identidad de olyda.app se verificó en eu-west-3 y funciona igual
    desde App Runner en eu-west-1.
  EOT
  type        = string
  default     = "eu-west-3"
}

variable "mail_domain" {
  description = "Dominio verificado en SES desde el que se envía el correo"
  type        = string
  default     = "olyda.app"
}

variable "mail_from_address" {
  description = <<-EOT
    Dirección remitente de la plataforma. El nombre visible lo pone la aplicación con
    el nombre de cada local: "Pizzería Bella Italia vía Olyda" <no-reply@olyda.app>.
    Debe ser una dirección que el servidor SMTP autorice a enviar.
  EOT
  type        = string
  default     = "no-reply@olyda.app"
}

variable "mail_from_brand" {
  description = "Marca que acompaña al nombre del local en el remitente"
  type        = string
  default     = "Olyda"
}

variable "mail_reply_to" {
  description = <<-EOT
    Buzón al que llegan las respuestas de los clientes. Vacío = sin Reply-To.
    Ideal: un buzón atendido de soporte. Cuando Business tenga un campo de email
    propio, esto debería pasar a ser el del local (ver docs/11-deuda-tecnica.md P1-8b).
  EOT
  type        = string
  default     = ""
}
