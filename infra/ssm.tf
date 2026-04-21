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
