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
