import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host:            process.env.SMTP_HOST ?? 'localhost',
  port:            Number(process.env.SMTP_PORT ?? 587),
  secure:          process.env.SMTP_SECURE === 'true',
  connectionTimeout: 10_000,
  greetingTimeout:   8_000,
  socketTimeout:     10_000,
  auth:   process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

// ─── Remitente ────────────────────────────────────────────────────────────────
// La dirección es de la plataforma y el nombre visible es el del local, para que el
// cliente reconozca de quién viene el correo:
//     "Pizzería Bella Italia vía Olyda" <no-reply@olyda.app>
//
// Antes se usaba SMTP_FROM tal cual, que en producción tenía el nombre de UN local
// concreto: los clientes de cualquier otro negocio recibían sus correos firmados por él.
//
// Si MAIL_FROM_ADDRESS no está configurada se reutiliza la dirección que haya dentro de
// SMTP_FROM. Así este cambio se puede desplegar antes de tener el buzón de olyda.app: el
// servidor SMTP seguiría enviando desde una dirección que sí le pertenece y no rechazaría
// el correo.

/** Extrae `alguien@dominio` de un valor tipo `Nombre <alguien@dominio>`. */
function parseAddress(value: string | undefined): string | null {
  if (!value) return null;
  const angled = value.match(/<([^>]+)>/);
  if (angled) return angled[1].trim();
  return value.includes('@') ? value.trim() : null;
}

const FROM_ADDRESS =
  process.env.MAIL_FROM_ADDRESS ?? parseAddress(process.env.SMTP_FROM) ?? 'no-reply@olyda.app';
const BRAND     = process.env.MAIL_FROM_BRAND ?? 'Olyda';
/** Buzón de la plataforma al que llegan las respuestas. Opcional. */
const REPLY_TO  = process.env.MAIL_REPLY_TO;

/**
 * El nombre del local lo escribe el propio cliente, así que se limpia antes de meterlo
 * en una cabecera: fuera saltos de línea (inyección de cabeceras) y comillas.
 */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n"<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 78);
}

function from(businessName: string): string {
  const name = sanitizeHeader(businessName);
  return name ? `"${name} vía ${BRAND}" <${FROM_ADDRESS}>` : `"${BRAND}" <${FROM_ADDRESS}>`;
}

/** Escapa el texto que se interpola en el HTML del correo. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Plantilla ────────────────────────────────────────────────────────────────
// Colores corporativos de Olyda: #004177 (azul) y #ff6a03 (naranja).
function baseTemplate(businessName: string, title: string, body: string) {
  const business = escapeHtml(businessName);
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
        <tr><td style="background:#004177;padding:28px 32px">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${business}</h1>
        </td></tr>
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:18px">${title}</h2>
          ${body}
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f8f8fc;border-top:1px solid #ebebf5">
          <p style="margin:0;font-size:12px;color:#888;line-height:1.5">
            Enviado por <strong>${business}</strong> a través de ${BRAND}.
            Este mensaje se ha generado automáticamente.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;padding:13px 28px;background:#ff6a03;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
      ${label}
    </a>`;
}

export async function sendVerificationEmail(
  to: string,
  verifyUrl: string,
  businessName: string,
) {
  const body = `
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px">
      Para completar tu registro en <strong>${escapeHtml(businessName)}</strong>, confirma tu dirección de correo haciendo clic en el botón de abajo.
    </p>
    ${button(verifyUrl, 'Verificar mi email')}
    <p style="color:#999;font-size:13px;margin:20px 0 0;line-height:1.5">
      Este enlace caduca en 24 horas. Si no has solicitado este registro, ignora este email.
    </p>`;

  await transporter.sendMail({
    from:    from(businessName),
    replyTo: REPLY_TO,
    to,
    subject: `Verifica tu email — ${businessName}`,
    html:    baseTemplate(businessName, 'Confirma tu correo electrónico', body),
  });
}

export async function sendOrderConfirmedEmail(
  to: string,
  customerName: string,
  orderRef: string,
  businessName: string,
  trackingUrl: string,
) {
  const body = `
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 8px">
      Hola <strong>${escapeHtml(customerName)}</strong>,
    </p>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px">
      Tu pedido <strong>#${escapeHtml(orderRef)}</strong> en <strong>${escapeHtml(businessName)}</strong> ha sido <strong style="color:#22c55e">confirmado</strong> y está siendo preparado. Te avisaremos cuando esté listo.
    </p>
    ${button(trackingUrl, 'Seguir mi pedido')}`;

  await transporter.sendMail({
    from:    from(businessName),
    replyTo: REPLY_TO,
    to,
    subject: `¡Tu pedido ha sido confirmado! — ${businessName}`,
    html:    baseTemplate(businessName, '¡Pedido confirmado!', body),
  });
}
