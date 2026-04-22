# La conexión con GitHub se hace manualmente desde la consola de Amplify
# (GitHub → OAuth app) porque los PAT no tienen permisos de webhook por defecto.
# Terraform gestiona la app, las variables de entorno y la rama.

resource "aws_iam_role" "amplify" {
  name = "${var.project_name}-amplify-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "amplify.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "amplify_admin" {
  role       = aws_iam_role.amplify.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess-Amplify"
}

resource "aws_amplify_app" "web" {
  name                 = "${var.project_name}-web"
  iam_service_role_arn = aws_iam_role.amplify.arn

  build_spec = file("${path.module}/../amplify.yml")

  platform = "WEB_COMPUTE" # Necesario para Next.js SSR

  environment_variables = {
    NEXT_PUBLIC_API_URL       = var.api_url != "" ? var.api_url : "https://placeholder.awsapprunner.com"
    NEXT_PUBLIC_APP_URL       = "https://${var.frontend_branch}.${var.project_name}.amplifyapp.com"
    AMPLIFY_MONOREPO_APP_ROOT = "apps/web"
  }

  # Redirige rutas desconocidas a Next.js (App Router)
  custom_rule {
    source = "/<*>"
    target = "/index.html"
    status = "404-200"
  }

  tags = { Name = "${var.project_name}-amplify" }
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.web.id
  branch_name = var.frontend_branch
  stage       = "PRODUCTION"

  enable_auto_build           = true
  enable_pull_request_preview = false

  framework = "Next.js - SSR"

  environment_variables = {
    NODE_ENV = "production"
  }

  tags = { Name = "${var.project_name}-amplify-${var.frontend_branch}" }
}
