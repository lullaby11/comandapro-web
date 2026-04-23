# ── VPC Connector: permite a App Runner salir hacia el VPC (RDS) ──────────────

resource "aws_apprunner_vpc_connector" "api" {
  vpc_connector_name = "${var.project_name}-vpc-connector"
  # Subnets públicas: App Runner necesita salida a internet para llegar a ECR y SSM.
  # Con subnets privadas (sin NAT) el servicio no arranca.
  # App Runner sigue accediendo a RDS (subnet privada) porque están en el mismo VPC
  # y el security group de RDS permite inbound desde este conector.
  subnets         = aws_subnet.public[*].id
  security_groups = [aws_security_group.apprunner_connector.id]

  tags = { Name = "${var.project_name}-vpc-connector" }
}

# ── App Runner Service ────────────────────────────────────────────────────────

resource "aws_apprunner_service" "api" {
  service_name = "${var.project_name}-api"

  source_configuration {
    # Autenticación para hacer pull de la imagen ECR privada
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }

    image_repository {
      image_identifier      = "${aws_ecr_repository.api.repository_url}:latest"
      image_repository_type = "ECR"

      image_configuration {
        port = "4000"

        # Variables de entorno no sensibles
        runtime_environment_variables = {
          NODE_ENV        = "production"
          APP_URL         = "https://${var.domain_name}"
          ALLOWED_ORIGINS = "https://${var.domain_name},https://www.${var.domain_name}"
          ASSETS_BUCKET   = aws_s3_bucket.assets.bucket
          ASSETS_BASE_URL = "https://${aws_s3_bucket.assets.bucket}.s3.${var.aws_region}.amazonaws.com"
        }

        # Secrets leídos de SSM Parameter Store en tiempo de arranque
        runtime_environment_secrets = {
          DATABASE_URL = aws_ssm_parameter.db_url.arn
          JWT_SECRET   = aws_ssm_parameter.jwt_secret.arn
        }
      }
    }

    # App Runner se redespliega automáticamente cuando se hace push a :latest en ECR
    auto_deployments_enabled = true
  }

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.api.arn
    }
    ingress_configuration {
      is_publicly_accessible = true
    }
  }

  instance_configuration {
    cpu               = var.api_cpu
    memory            = var.api_memory
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 3
  }

  tags = { Name = "${var.project_name}-api" }

  lifecycle {
    ignore_changes = [source_configuration[0].image_repository[0].image_identifier]
  }
}

# NOTA: El dominio personalizado se configura manualmente desde la consola de App Runner
# (Servicio → Custom domains → Link domain) porque el recurso
# aws_apprunner_custom_domain_association también puede bloquear el apply.
