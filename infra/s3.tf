# ── S3: Almacenamiento de activos (logo, imágenes de productos) ───────────────

resource "aws_s3_bucket" "assets" {
  bucket = "olyda-assets-${data.aws_caller_identity.current.account_id}"
  tags   = { Name = "olyda-assets" }
}

resource "aws_s3_bucket_cors_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE"]
    allowed_origins = [
      "https://${var.domain_name}",
      "https://www.${var.domain_name}",
      "https://api.${var.domain_name}",
      "http://localhost:3000",
    ]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# Permitir acceso público (necesario para servir imágenes directamente)
resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "assets_public_read" {
  bucket     = aws_s3_bucket.assets.id
  depends_on = [aws_s3_bucket_public_access_block.assets]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicRead"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.assets.arn}/*"
    }]
  })
}

# ── IAM: App Runner puede subir y borrar activos ──────────────────────────────

resource "aws_iam_policy" "apprunner_s3_assets" {
  name        = "${var.project_name}-apprunner-s3-assets"
  description = "Permite a App Runner leer/escribir activos en S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AssetsReadWrite"
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket",
      ]
      Resource = [
        aws_s3_bucket.assets.arn,
        "${aws_s3_bucket.assets.arn}/*",
      ]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_s3" {
  role       = aws_iam_role.apprunner_instance.name
  policy_arn = aws_iam_policy.apprunner_s3_assets.arn
}

# ── IAM: GitHub Actions puede subir activos (logo inicial, seeding) ───────────

resource "aws_iam_policy" "github_actions_s3" {
  name        = "${var.project_name}-github-actions-s3"
  description = "Permite a GitHub Actions subir activos a S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AssetsReadWrite"
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket",
      ]
      Resource = [
        aws_s3_bucket.assets.arn,
        "${aws_s3_bucket.assets.arn}/*",
      ]
    }]
  })
}

resource "aws_iam_user_policy_attachment" "github_actions_s3" {
  user       = aws_iam_user.github_actions.name
  policy_arn = aws_iam_policy.github_actions_s3.arn
}

# ── Outputs ───────────────────────────────────────────────────────────────────

output "s3_assets_bucket_name" {
  description = "Nombre del bucket S3 de activos"
  value       = aws_s3_bucket.assets.bucket
}

output "s3_assets_base_url" {
  description = "URL base para acceder a los activos públicos"
  value       = "https://${aws_s3_bucket.assets.bucket}.s3.${var.aws_region}.amazonaws.com"
}
