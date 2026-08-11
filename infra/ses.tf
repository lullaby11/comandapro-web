# ── Correo saliente con Amazon SES ────────────────────────────────────────────
#
# El envío se autoriza con el rol de instancia de App Runner, no con credenciales:
# no hay contraseña que guardar en SSM, que rotar ni que se pueda filtrar en un
# `describe-service`. Esto sustituye a la configuración SMTP anterior, que tenía la
# contraseña de un buzón de Office 365 en claro entre las variables de entorno.
#
# La identidad de dominio (olyda.app), su DKIM y el MAIL FROM personalizado se
# verificaron a mano en la consola de SES y NO se gestionan aquí: importarlos
# obligaría a mover también los registros DNS, que están fuera de esta cuenta.
# Estado verificado el 2026-08-06: dominio verificado, DKIM SUCCESS,
# MAIL FROM smtp.olyda.app SUCCESS, acceso a producción concedido.
#
# OJO: SES está en eu-west-3 y el resto de la infraestructura en eu-west-1. Funciona
# entre regiones; por eso el permiso apunta explícitamente a la región de SES.

# `data.aws_caller_identity.current` ya está declarado en outputs.tf

locals {
  ses_identity_arn = "arn:aws:ses:${var.ses_region}:${data.aws_caller_identity.current.account_id}:identity/${var.mail_domain}"
}

resource "aws_iam_policy" "apprunner_ses_send" {
  name        = "${var.project_name}-apprunner-ses-send"
  description = "Permite a la API enviar correo con SES desde el dominio de la plataforma"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SendFromPlatformIdentity"
        Effect = "Allow"
        Action = [
          "ses:SendEmail"
        ]
        Resource = [local.ses_identity_arn]
        # Sin esta condición, el permiso sobre la identidad de dominio permitiría enviar
        # desde CUALQUIER dirección @olyda.app. Se acota al remitente de la plataforma.
        Condition = {
          StringEquals = {
            "ses:FromAddress" = var.mail_from_address
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_ses" {
  role       = aws_iam_role.apprunner_instance.name
  policy_arn = aws_iam_policy.apprunner_ses_send.arn
}
