output "api_url" {
  description = "URL pública de la API (App Runner) — úsala como var.api_url en el segundo apply"
  value       = "https://${aws_apprunner_service.api.service_url}"
}

output "amplify_url" {
  description = "URL pública del frontend (Amplify) — úsala como var.frontend_url en el segundo apply"
  value       = "https://${var.frontend_branch}.${aws_amplify_app.web.default_domain}"
}

output "ecr_repository_url" {
  description = "URL del repositorio ECR — necesaria para el workflow de GitHub Actions"
  value       = aws_ecr_repository.api.repository_url
}

output "apprunner_service_arn" {
  description = "ARN del servicio App Runner — necesario para el workflow de GitHub Actions"
  value       = aws_apprunner_service.api.arn
}

output "rds_endpoint" {
  description = "Endpoint del RDS (sin puerto)"
  value       = aws_db_instance.postgres.address
  sensitive   = true
}

output "db_url_ssm_arn" {
  description = "ARN del parámetro SSM que contiene DATABASE_URL"
  value       = aws_ssm_parameter.db_url.arn
}

# ── Estado remoto (instrucciones) ────────────────────────────────────────────

output "terraform_state_bucket_name" {
  description = "Nombre sugerido para el bucket S3 del estado Terraform — créalo manualmente antes de habilitar el backend"
  value       = "comandapro-terraform-state-${data.aws_caller_identity.current.account_id}"
}

data "aws_caller_identity" "current" {}
