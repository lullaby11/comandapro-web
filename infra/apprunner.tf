# ── VPC Connector: permite a App Runner salir hacia el VPC (RDS) ──────────────

resource "aws_apprunner_vpc_connector" "api" {
  # El sufijo forma parte del nombre porque los conectores son inmutables: cambiar de
  # subredes obliga a crear uno nuevo, y el nombre no puede repetirse mientras conviven.
  vpc_connector_name = "${var.project_name}-vpc-connector-2"

  # Subredes PRIVADAS, con salida por el NAT gateway (ver vpc.tf).
  #
  # Antes estaban las públicas, con este comentario: «App Runner necesita salida a
  # internet para llegar a ECR y SSM». Era falso, y costó caro: la imagen y los secretos
  # los resuelve la infraestructura de App Runner por su cuenta, fuera del conector, así
  # que el servicio arrancaba bien y parecía correcto. Pero las ENI del conector no
  # reciben IP pública, y un Internet Gateway no encamina tráfico sin ella: la aplicación
  # se quedó sin ninguna salida a internet, y el correo llevaba desde el principio
  # fallando con `connect ETIMEDOUT` sin que nadie lo mirara.
  subnets         = aws_subnet.private[*].id
  security_groups = [aws_security_group.apprunner_connector_2.id]

  tags = { Name = "${var.project_name}-vpc-connector" }

  # El servicio tiene que apuntar al nuevo antes de que se pueda borrar el viejo
  lifecycle {
    create_before_destroy = true
  }
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
        runtime_environment_variables = merge(
          {
            NODE_ENV        = "production"
            APP_URL         = "https://${var.domain_name}"
            ALLOWED_ORIGINS = "https://${var.domain_name},https://www.${var.domain_name}"
            ASSETS_BUCKET   = aws_s3_bucket.assets.bucket
            ASSETS_BASE_URL = "https://${aws_s3_bucket.assets.bucket}.s3.${var.aws_region}.amazonaws.com"

            # Correo saliente con SES. Sin credenciales: el permiso lo da el rol de
            # instancia (ver ses.tf).
            MAIL_TRANSPORT        = "ses"
            SES_REGION            = var.ses_region
            SES_CONFIGURATION_SET = aws_sesv2_configuration_set.main.configuration_set_name
            MAIL_FROM_ADDRESS     = var.mail_from_address
            MAIL_FROM_BRAND       = var.mail_from_brand
          },
          # Reply-To solo si hay un buzón atendido configurado
          var.mail_reply_to != "" ? { MAIL_REPLY_TO = var.mail_reply_to } : {}
        )

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
