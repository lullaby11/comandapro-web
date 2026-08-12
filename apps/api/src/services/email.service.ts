import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import nodemailer from 'nodemailer';

// ─── Remitente ────────────────────────────────────────────────────────────────
// La dirección es de la plataforma y el nombre visible es el del local, para que el
// cliente reconozca de quién viene el correo:
//     "Pizzería Bella Italia vía Olyda" <no-reply@olyda.app>
//
// Antes se usaba SMTP_FROM tal cual, que en producción tenía el nombre de UN local
// concreto: los clientes de cualquier otro negocio recibían sus correos firmados por él.

/** Extrae `alguien@dominio` de un valor tipo `Nombre <alguien@dominio>`. */
function parseAddress(value: string | undefined): string | null {
  if (!value) return null;
  const angled = value.match(/<([^>]+)>/);
  if (angled) return angled[1].trim();
  return value.includes('@') ? value.trim() : null;
}

const FROM_ADDRESS =
  process.env.MAIL_FROM_ADDRESS ?? parseAddress(process.env.SMTP_FROM) ?? 'no-reply@olyda.app';
const BRAND    = process.env.MAIL_FROM_BRAND ?? 'Olyda';
/** Buzón de la plataforma al que llegan las respuestas. Opcional. */
const REPLY_TO = process.env.MAIL_REPLY_TO;

/**
 * El nombre del local lo escribe el propio cliente, así que se limpia antes de meterlo
 * en una cabecera: fuera saltos de línea (inyección de cabeceras) y comillas.
 */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n"<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 78);
}

/**
 * Codifica el nombre visible según RFC 2047 si tiene caracteres no ASCII. SES rechaza o
 * estropea las cabeceras con acentos sin codificar, y aquí casi todos los locales se
 * llaman "Pizzería…" o "El Rincón de…".
 */
function encodeDisplayName(name: string): string {
  const isAscii = /^[\x20-\x7E]*$/.test(name);
  return isAscii ? `"${name}"` : `=?UTF-8?B?${Buffer.from(name, 'utf8').toString('base64')}?=`;
}

function from(businessName: string): string {
  const name = sanitizeHeader(businessName);
  const display = name ? `${name} vía ${BRAND}` : BRAND;
  return `${encodeDisplayName(display)} <${FROM_ADDRESS}>`;
}

/** Escapa el texto que se interpola en el HTML del correo. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Transporte ───────────────────────────────────────────────────────────────
// En producción se usa la API de Amazon SES con el rol de instancia de App Runner: no
// hay contraseña que guardar, rotar ni filtrar. Se mantiene SMTP para quien despliegue
// fuera de AWS, y un modo de consola para desarrollo local, donde antes los correos
// fallaban en silencio y no había forma cómoda de seguir el enlace de verificación.

type Transport = 'ses' | 'smtp' | 'log';

const TRANSPORT: Transport =
  (process.env.MAIL_TRANSPORT as Transport | undefined) ??
  (process.env.SES_REGION ? 'ses' : process.env.SMTP_HOST ? 'smtp' : 'log');

const sesClient =
  TRANSPORT === 'ses' ? new SESv2Client({ region: process.env.SES_REGION }) : null;

/**
 * Conjunto de configuración de SES. Sin él, SES solo publica métricas agregadas y no hay
 * forma de saber qué pasó con un mensaje concreto: si rebotó, por qué, o si alguien lo
 * marcó como spam. Opcional para no romper el envío si no está configurado.
 */
const SES_CONFIGURATION_SET = process.env.SES_CONFIGURATION_SET;

const smtpTransporter =
  TRANSPORT === 'smtp'
    ? nodemailer.createTransport({
        host:              process.env.SMTP_HOST,
        port:              Number(process.env.SMTP_PORT ?? 587),
        secure:            process.env.SMTP_SECURE === 'true',
        connectionTimeout: 10_000,
        greetingTimeout:   8_000,
        socketTimeout:     10_000,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      })
    : null;

console.log(
  `[email] Transporte: ${TRANSPORT}${TRANSPORT === 'ses' ? ` (${process.env.SES_REGION})` : ''} · remitente: ${FROM_ADDRESS}` +
    (SES_CONFIGURATION_SET ? ` · conjunto: ${SES_CONFIGURATION_SET}` : '')
);

interface Mail {
  to: string;
  subject: string;
  html: string;
  /**
   * Alternativa en texto plano. Un correo solo-HTML es una señal de spam de manual y
   * los filtros de Microsoft y Google la penalizan, especialmente en dominios sin
   * histórico de envío. Además es lo que ven los lectores de pantalla y los clientes
   * que bloquean HTML.
   */
  text: string;
  businessName: string;
}

/**
 * El asunto lleva el nombre del local, que escribe el propio cliente. Aunque tanto SES
 * como nodemailer codifican las cabeceras, no se les delega la seguridad: los saltos de
 * línea se eliminan aquí antes de construir el mensaje.
 */
function sanitizeSubject(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
}

async function deliver({ to, subject: rawSubject, html, text, businessName }: Mail): Promise<void> {
  const fromHeader = from(businessName);
  const subject    = sanitizeSubject(rawSubject);

  if (TRANSPORT === 'ses') {
    await sesClient!.send(
      new SendEmailCommand({
        FromEmailAddress:     fromHeader,
        Destination:          { ToAddresses: [to] },
        ReplyToAddresses:     REPLY_TO ? [REPLY_TO] : undefined,
        ConfigurationSetName: SES_CONFIGURATION_SET,
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: html, Charset: 'UTF-8' },
              Text: { Data: text, Charset: 'UTF-8' },
            },
          },
        },
      })
    );
    return;
  }

  if (TRANSPORT === 'smtp') {
    await smtpTransporter!.sendMail({ from: fromHeader, replyTo: REPLY_TO, to, subject, html, text });
    return;
  }

  // Desarrollo: sin credenciales de envío, el correo se vuelca a la consola con los
  // enlaces, que es lo único que hace falta para seguir el flujo en local.
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  console.log(
    `\n[email:log] Para: ${to}\n  De     : ${fromHeader}\n  Asunto : ${subject}` +
      (links.length ? `\n  Enlaces:\n${links.map((l) => `    ${l}`).join('\n')}` : '') +
      '\n'
  );
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

  const text = [
    `${businessName}`,
    '',
    'Confirma tu correo electrónico',
    '',
    `Para completar tu registro en ${businessName}, confirma tu dirección de correo`,
    'abriendo este enlace:',
    '',
    verifyUrl,
    '',
    'El enlace caduca en 24 horas. Si no has solicitado este registro, ignora este mensaje.',
    '',
    `Enviado por ${businessName} a través de ${BRAND}.`,
  ].join('\n');

  await deliver({
    to,
    businessName,
    text,
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

  const text = [
    `${businessName}`,
    '',
    'Pedido confirmado',
    '',
    `Hola ${customerName},`,
    '',
    `Tu pedido #${orderRef} en ${businessName} ha sido confirmado y está siendo`,
    'preparado. Te avisaremos cuando esté listo.',
    '',
    'Sigue tu pedido aquí:',
    trackingUrl,
    '',
    `Enviado por ${businessName} a través de ${BRAND}.`,
  ].join('\n');

  await deliver({
    to,
    businessName,
    text,
    subject: `¡Tu pedido ha sido confirmado! — ${businessName}`,
    html:    baseTemplate(businessName, '¡Pedido confirmado!', body),
  });
}
