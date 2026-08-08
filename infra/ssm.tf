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

# ── Contraseña SMTP ───────────────────────────────────────────────────────────
# Terraform crea el parámetro pero NO gestiona su valor: la contraseña real se escribe
# una sola vez, fuera del estado de Terraform, para que no acabe en terraform.tfstate
# ni en un .tfvars:
#
#   aws ssm put-parameter \
#     --name "/comandapro/prod/SMTP_PASS" \
#     --value "LA_CONTRASEÑA" \
#     --type SecureString --overwrite --region eu-west-1
#
# `ignore_changes` evita que un `apply` posterior la machaque con el marcador.
resource "aws_ssm_parameter" "smtp_pass" {
  name  = "/${var.project_name}/${var.environment}/SMTP_PASS"
  type  = "SecureString"
  value = "PENDIENTE-escribir-con-aws-ssm-put-parameter"

  lifecycle {
    ignore_changes = [value]
  }

  tags = { Name = "${var.project_name}-smtp-pass" }
}
