import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST ?? 'localhost',
  port:   Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth:   process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

const FROM = process.env.SMTP_FROM ?? 'ComandaPro <no-reply@comandapro.com>';

function baseTemplate(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
        <tr><td style="background:#6c63ff;padding:28px 32px">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700">ComandaPro</h1>
        </td></tr>
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:18px">${title}</h2>
          ${body}
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f8f8fc;border-top:1px solid #ebebf5">
          <p style="margin:0;font-size:12px;color:#888;line-height:1.5">
            Este email fue generado automáticamente. No respondas a este mensaje.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendVerificationEmail(
  to: string,
  verifyUrl: string,
  businessName: string,
) {
  const body = `
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px">
      Para completar tu registro en <strong>${businessName}</strong>, confirma tu dirección de correo haciendo clic en el botón de abajo.
    </p>
    <a href="${verifyUrl}" style="display:inline-block;padding:13px 28px;background:#6c63ff;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
      Verificar mi email
    </a>
    <p style="color:#999;font-size:13px;margin:20px 0 0;line-height:1.5">
      Este enlace caduca en 24 horas. Si no has solicitado este registro, ignora este email.
    </p>`;

  await transporter.sendMail({
    from:    FROM,
    to,
    subject: `Verifica tu email — ${businessName}`,
    html:    baseTemplate('Confirma tu correo electrónico', body),
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
      Hola <strong>${customerName}</strong>,
    </p>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px">
      Tu pedido <strong>#${orderRef}</strong> en <strong>${businessName}</strong> ha sido <strong style="color:#22c55e">confirmado</strong> y está siendo preparado. Te avisaremos cuando esté listo.
    </p>
    <a href="${trackingUrl}" style="display:inline-block;padding:13px 28px;background:#6c63ff;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
      Seguir mi pedido
    </a>`;

  await transporter.sendMail({
    from:    FROM,
    to,
    subject: `¡Tu pedido ha sido confirmado! — ${businessName}`,
    html:    baseTemplate('¡Pedido confirmado!', body),
  });
}
