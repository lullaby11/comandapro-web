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

# ── Rol para GitHub Actions (CI/CD) ──────────────────────────────────────────
# Usado por el workflow para hacer push a ECR y triggear despliegues

resource "aws_iam_user" "github_actions" {
  name = "${var.project_name}-github-actions"
  tags = { Purpose = "CI/CD desde GitHub Actions" }
}

resource "aws_iam_access_key" "github_actions" {
  user = aws_iam_user.github_actions.name
}

resource "aws_iam_policy" "github_actions" {
  name        = "${var.project_name}-github-actions"
  description = "Permite a GitHub Actions hacer push a ECR y desplegar App Runner"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRAuth"
        Effect = "Allow"
        Action = ["ecr:GetAuthorizationToken"]
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
        Action = ["apprunner:StartDeployment"]
        Resource = [aws_apprunner_service.api.arn]
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "github_actions" {
  user       = aws_iam_user.github_actions.name
  policy_arn = aws_iam_policy.github_actions.arn
}

# Las credenciales se muestran en outputs para añadirlas a GitHub Secrets
output "github_actions_access_key_id" {
  description = "AWS_ACCESS_KEY_ID para GitHub Secrets"
  value       = aws_iam_access_key.github_actions.id
  sensitive   = true
}

output "github_actions_secret_access_key" {
  description = "AWS_SECRET_ACCESS_KEY para GitHub Secrets"
  value       = aws_iam_access_key.github_actions.secret
  sensitive   = true
}
