# ── Rol para que App Runner pueda hacer pull de imágenes ECR ─────────────────
# Este rol lo usa el plano de control de App Runner (no la instancia)

resource "aws_iam_role" "apprunner_ecr_access" {
  name = "${var.project_name}-apprunner-ecr-access"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "build.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr_access" {
  role       = aws_iam_role.apprunner_ecr_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

# ── Rol de instancia: la app en ejecución (lee SSM) ───────────────────────────

resource "aws_iam_role" "apprunner_instance" {
  name = "${var.project_name}-apprunner-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "tasks.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_policy" "apprunner_ssm_read" {
  name        = "${var.project_name}-apprunner-ssm-read"
  description = "Permite a App Runner leer los secrets de SSM Parameter Store"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = [
          aws_ssm_parameter.db_url.arn,
          aws_ssm_parameter.jwt_secret.arn
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = ["*"]
        Condition = {
          StringEquals = {
            "kms:ViaService" = "ssm.${var.aws_region}.amazonaws.com"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_ssm" {
  role       = aws_iam_role.apprunner_instance.name
  policy_arn = aws_iam_policy.apprunner_ssm_read.arn
}

# ── Política para GitHub Actions (CI/CD) ─────────────────────────────────────
# El workflow asume aws_iam_role.github_actions (infra/github-oidc.tf) vía OIDC,
# sin credenciales de larga duración. Esta política se adjunta a ese rol.

resource "aws_iam_policy" "github_actions" {
  name        = "${var.project_name}-github-actions"
  description = "Permite a GitHub Actions hacer push a ECR y desplegar App Runner"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ECRAuth"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = ["*"]
      },
      {
        Sid    = "ECRPush"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer"
        ]
        Resource = [aws_ecr_repository.api.arn]
      },
      {
        Sid    = "AppRunnerDeploy"
        Effect = "Allow"
        Action = [
          "apprunner:StartDeployment",
          "apprunner:DescribeService",
          "apprunner:UpdateService"
        ]
        Resource = [aws_apprunner_service.api.arn]
      },
      {
        Sid    = "RDSPreDeploySnapshot"
        Effect = "Allow"
        Action = [
          "rds:CreateDBSnapshot",
          "rds:DescribeDBInstances"
        ]
        # rds:CreateDBSnapshot exige permiso sobre DOS recursos: la instancia de origen y
        # el snapshot que se va a crear. Con solo el primero, la llamada falla con un
        # AccessDenied que menciona el ARN del snapshot, no el de la instancia.
        # El comodín se limita al prefijo que usa el workflow, para no autorizar la
        # creación de snapshots arbitrarios.
        Resource = [
          aws_db_instance.postgres.arn,
          "arn:aws:rds:${var.aws_region}:${data.aws_caller_identity.current.account_id}:snapshot:${var.project_name}-db-predeploy-*"
        ]
      },
      {
        Sid      = "RDSDescribeSnapshots"
        Effect   = "Allow"
        Action   = ["rds:DescribeDBSnapshots"]
        Resource = ["*"]
      },
      {
        Sid    = "ECRDescribeForRollback"
        Effect = "Allow"
        Action = [
          "ecr:DescribeImages",
          "ecr:PutImage"
        ]
        Resource = [aws_ecr_repository.api.arn]
      }
    ]
  })
}

