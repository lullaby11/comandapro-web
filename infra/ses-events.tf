# ── Trazabilidad de los correos enviados ──────────────────────────────────────
#
# Sin esto, SES solo ofrece métricas agregadas: sabes que se enviaron 4 correos y se
# entregaron 4, pero no cuál fue cada uno ni qué respondió el servidor receptor. Con el
# conjunto de configuración y su destino de eventos, cada mensaje deja rastro consultable.
#
# QUÉ RESUELVE Y QUÉ NO:
#   ✓ Rebotes con motivo (buzón inexistente, lleno, dominio caído).
#   ✓ Quejas: alguien marcó el correo como spam. Es lo más grave que puede pasar —si la
#     tasa sube, AWS suspende la cuenta— y sin esto no te enteras hasta recibir el aviso.
#   ✓ Retrasos de entrega: el receptor está difiriendo el correo.
#   ✓ La respuesta SMTP del servidor receptor en cada entrega.
#   ✗ NO detecta que el receptor haya metido el correo en cuarentena o en spam. Para el
#     servidor de destino eso es una entrega correcta y responde 250 OK. Es exactamente lo
#     que pasó el 12/08/2026 con Office 365: SES informaba "Delivery" y el mensaje estaba
#     retenido en la cuarentena del tenant. Eso solo se ve desde el lado receptor.
#
# No se activan OPEN ni CLICK: exigen píxel de seguimiento y reescritura de enlaces,
# invasivos para correo transaccional y sin valor operativo aquí.
#
# TODO va en var.ses_region (eu-west-3), donde está verificada la identidad. Un conjunto
# de configuración solo es válido en la región de la identidad que lo usa.
#
# NOTA: existe un `my-first-configuration-set` creado a mano desde el asistente de la
# consola, sin destinos de eventos y por tanto inútil. No se importa aquí por su nombre
# autogenerado; se puede borrar desde la consola.

resource "aws_sesv2_configuration_set" "main" {
  provider               = aws.ses
  configuration_set_name = "${var.project_name}-${var.environment}"

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  delivery_options {
    # Exige TLS en la entrega. Los correos llevan datos personales (nombre, dirección,
    # detalle del pedido) y no deben viajar en claro.
    tls_policy = "REQUIRE"
  }
}

resource "aws_sesv2_configuration_set_event_destination" "events" {
  provider               = aws.ses
  configuration_set_name = aws_sesv2_configuration_set.main.configuration_set_name
  event_destination_name = "${var.project_name}-eventos"

  event_destination {
    enabled = true
    matching_event_types = [
      "SEND",
      "DELIVERY",
      "BOUNCE",
      "COMPLAINT",
      "REJECT",
      "DELIVERY_DELAY",
      "RENDERING_FAILURE",
    ]

    event_bridge_destination {
      event_bus_arn = "arn:aws:events:${var.ses_region}:${data.aws_caller_identity.current.account_id}:event-bus/default"
    }
  }
}

# ── EventBridge → CloudWatch Logs ─────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "ses_events" {
  provider          = aws.ses
  name              = "/aws/events/${var.project_name}/ses"
  retention_in_days = 30

  tags = { Name = "${var.project_name}-ses-events" }
}

resource "aws_cloudwatch_event_rule" "ses_events" {
  provider    = aws.ses
  name        = "${var.project_name}-ses-events"
  description = "Vuelca los eventos de envío de SES a CloudWatch Logs"

  event_pattern = jsonencode({
    source = ["aws.ses"]
  })
}

resource "aws_cloudwatch_event_target" "ses_events_to_logs" {
  provider  = aws.ses
  rule      = aws_cloudwatch_event_rule.ses_events.name
  target_id = "cloudwatch-logs"
  arn       = aws_cloudwatch_log_group.ses_events.arn
}

# EventBridge necesita permiso explícito para escribir en el grupo de logs
data "aws_iam_policy_document" "eventbridge_to_logs" {
  provider = aws.ses

  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com", "delivery.logs.amazonaws.com"]
    }
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.ses_events.arn}:*"]

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.ses_events.arn]
    }
  }
}

resource "aws_cloudwatch_log_resource_policy" "eventbridge_to_logs" {
  provider        = aws.ses
  policy_name     = "${var.project_name}-eventbridge-ses-logs"
  policy_document = data.aws_iam_policy_document.eventbridge_to_logs.json
}
