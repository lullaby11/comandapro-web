resource "random_password" "jwt_secret" {
  length  = 64
  special = false # JWT secrets solo necesitan chars alfanuméricos
}

# DATABASE_URL construida a partir de los datos de RDS
resource "aws_ssm_parameter" "db_url" {
  name  = "/${var.project_name}/${var.environment}/DATABASE_URL"
  type  = "SecureString"
  value = "postgresql://${var.db_username}:${random_password.db.result}@${aws_db_instance.postgres.address}:5432/${var.db_name}"

  tags = { Name = "${var.project_name}-db-url" }
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/${var.project_name}/${var.environment}/JWT_SECRET"
  type  = "SecureString"
  value = random_password.jwt_secret.result

  tags = { Name = "${var.project_name}-jwt-secret" }
}

# NOTA: el correo saliente NO necesita ningún secreto aquí. Se envía con la API de
# Amazon SES autorizada por el rol de instancia de App Runner (ver ses.tf), así que no
# existe contraseña que guardar, rotar ni filtrar.

# ── Token de arranque del primer administrador de plataforma ──────────────────
# Solo sirve mientras NO exista ningún administrador: el endpoint se autodesactiva en
# cuanto hay uno. Aun así va como SecureString y no como variable en claro, por coherencia
# con el resto de secretos.
#
# El valor real se escribe una sola vez, fuera del estado de Terraform:
#   aws ssm put-parameter --name "/comandapro/prod/PLATFORM_BOOTSTRAP_TOKEN" \
#     --value "$(openssl rand -hex 32)" --type SecureString --overwrite --region eu-west-1
#
# Conviene retirar el parámetro y la variable de App Runner una vez usado.
resource "aws_ssm_parameter" "platform_bootstrap_token" {
  name  = "/${var.project_name}/${var.environment}/PLATFORM_BOOTSTRAP_TOKEN"
  type  = "SecureString"
  value = "PENDIENTE-escribir-con-aws-ssm-put-parameter"

  lifecycle {
    ignore_changes = [value]
  }

  tags = { Name = "${var.project_name}-platform-bootstrap" }
}
