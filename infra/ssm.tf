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

# NOTA: el token de arranque del primer administrador de plataforma existió aquí entre el
# 13/08/2026 y ese mismo día. Se retiró en cuanto se creó el administrador. El endpoint
# POST /api/platform/bootstrap sigue en el código pero queda inerte sin esta variable: si
# algún día hace falta levantar un entorno nuevo, se vuelve a crear el parámetro, se usa y
# se retira. Ver docs/09-despliegue.md.
