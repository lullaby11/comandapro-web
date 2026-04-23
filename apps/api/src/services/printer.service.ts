import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import QRCode from 'qrcode';
import Jimp from 'jimp';

export interface PrintOrderPayload {
  business: {
    name: string;
    address?: string;
    phone?: string;
    logoUrl?: string;
    paperWidth: 58 | 80;
    currency: string;
  };
  customer: {
    name: string;
    phone: string;
    address?: string;
  };
  order: {
    id: string;
    trackingToken: string;
    notes?: string;
    createdAt: Date;
    items: Array<{
      productName: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }>;
    subtotal: number;
    tax: number;
    total: number;
    paymentMethod: 'CASH' | 'CARD';
    cashGiven?: number;
  };
  trackingUrl: string;
}

/**
 * Genera un buffer ESC/POS para impresoras térmicas usando
 * @point-of-sale/receipt-printer-encoder (sucesor oficial de thermal-printer-encoder).
 * Soporta 58mm (32 chars/línea) y 80mm (48 chars/línea).
 */
export async function generateEscPosBuffer(
  payload: PrintOrderPayload
): Promise<Uint8Array> {
  const { business, customer, order, trackingUrl } = payload;

  // Caracteres por línea según ancho de papel
  const lineWidth = business.paperWidth === 58 ? 32 : 48;
  // Dots por línea: 58mm ≈ 384px / 80mm ≈ 576px
  const dotWidth = business.paperWidth === 58 ? 384 : 576;

  const encoder = new ReceiptPrinterEncoder({
    language: 'esc-pos',
    columns: lineWidth,
  } as ConstructorParameters<typeof ReceiptPrinterEncoder>[0]);

  let enc = encoder.initialize();

  // ──────────────────────────────────────────
  // LOGO (si existe)
  // ──────────────────────────────────────────
  if (business.logoUrl) {
    try {
      const logoImage = await Jimp.read(business.logoUrl);
      const logoWidth = Math.min(dotWidth / 2, 256);
      const logoHeight = Math.round((logoImage.getHeight() * logoWidth) / logoImage.getWidth());
      logoImage.resize(logoWidth, logoHeight);

      enc = enc
        .align('center')
        .image(
          { data: logoImage.bitmap.data, width: logoImage.bitmap.width, height: logoImage.bitmap.height },
          logoImage.bitmap.width,
          logoImage.bitmap.height,
          'atkinson'
        )
        .newline();
    } catch (err) {
      console.warn('[PrinterService] No se pudo cargar el logo:', err);
    }
  }

  // ──────────────────────────────────────────
  // CABECERA
  // ──────────────────────────────────────────
  enc = enc
    .align('center')
    .bold(true)
    .size(1, 1)
    .line(truncate(business.name.toUpperCase(), lineWidth))
    .bold(false)
    .size(1, 1);

  if (business.address) enc = enc.line(truncate(business.address, lineWidth));
  if (business.phone)   enc = enc.line(`Tel: ${business.phone}`);

  enc = enc
    .newline()
    .align('left')
    .rule({ style: 'single', width: lineWidth });

  // ──────────────────────────────────────────
  // DATOS DEL CLIENTE
  // ──────────────────────────────────────────
  const dateStr = formatDate(order.createdAt);
  enc = enc
    .bold(true).line('CLIENTE').bold(false)
    .line(`Nombre : ${customer.name}`)
    .line(`Tel    : ${customer.phone}`);

  if (customer.address) {
    enc = enc.line(`Dir    : ${truncate(customer.address, lineWidth - 9)}`);
  }

  enc = enc
    .newline()
    .line(`Pedido : #${order.id.slice(-8).toUpperCase()}`)
    .line(`Fecha  : ${dateStr}`)
    .rule({ style: 'single', width: lineWidth });

  // ──────────────────────────────────────────
  // ARTÍCULOS
  // ──────────────────────────────────────────
  enc = enc.bold(true).line('ARTÍCULOS').bold(false);

  for (const item of order.items) {
    const qty        = `${item.quantity}x`;
    const price      = formatCurrency(item.unitPrice, business.currency);
    const subtotal   = formatCurrency(item.subtotal, business.currency);
    const name       = truncate(item.productName, lineWidth - 4);

    enc = enc.line(`${qty} ${name}`);

    const priceCol   = `   ${price}`;
    const subtotalPad = subtotal.padStart(lineWidth - priceCol.length);
    enc = enc.line(`${priceCol}${subtotalPad}`);
  }

  enc = enc.rule({ style: 'double', width: lineWidth });

  // ──────────────────────────────────────────
  // TOTALES
  // ──────────────────────────────────────────
  enc = enc
    .line(rightAlign('Subtotal:', formatCurrency(order.subtotal, business.currency), lineWidth))
    .line(rightAlign('IVA:',      formatCurrency(order.tax,      business.currency), lineWidth));

  enc = enc
    .bold(true)
    .line(rightAlign('TOTAL:', formatCurrency(order.total, business.currency), lineWidth))
    .bold(false);

  // ──────────────────────────────────────────
  // PAGO
  // ──────────────────────────────────────────
  enc = enc.rule({ style: 'single', width: lineWidth });

  const isCash = (order.paymentMethod ?? 'CASH') === 'CASH';
  const payLabel = isCash ? 'Efectivo' : 'Tarjeta';
  enc = enc.line(rightAlign('Forma de pago:', payLabel, lineWidth));

  if (isCash && order.cashGiven != null) {
    const change = order.cashGiven - order.total;
    enc = enc
      .line(rightAlign('Entrega cliente:', formatCurrency(order.cashGiven, business.currency), lineWidth))
      .bold(true)
      .line(rightAlign('CAMBIO:', formatCurrency(Math.max(change, 0), business.currency), lineWidth))
      .bold(false);
  }

  // ──────────────────────────────────────────
  // NOTAS
  // ──────────────────────────────────────────
  if (order.notes) {
    enc = enc
      .rule({ style: 'single', width: lineWidth })
      .bold(true).line('NOTAS:').bold(false)
      .line(truncate(order.notes, lineWidth));
  }

  // ──────────────────────────────────────────
  // QR DE SEGUIMIENTO
  // ──────────────────────────────────────────
  enc = enc
    .rule({ style: 'single', width: lineWidth })
    .align('center')
    .bold(true).line('SEGUIMIENTO DE PEDIDO').bold(false);

  try {
    const qrSize   = business.paperWidth === 58 ? 160 : 240;
    const qrBuffer = await QRCode.toBuffer(trackingUrl, {
      type: 'png',
      width: qrSize,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    const qrJimp = await Jimp.read(qrBuffer);
    enc = enc
      .image(
        { data: qrJimp.bitmap.data, width: qrJimp.bitmap.width, height: qrJimp.bitmap.height },
        qrJimp.bitmap.width,
        qrJimp.bitmap.height,
        'atkinson'
      )
      .newline()
      .line(truncate(trackingUrl, lineWidth))
      .newline();
  } catch (err) {
    console.warn('[PrinterService] Error generando QR:', err);
    enc = enc.line(truncate(trackingUrl, lineWidth)).newline();
  }

  // ──────────────────────────────────────────
  // PIE Y CORTE
  // ──────────────────────────────────────────
  enc = enc
    .align('center')
    .line('¡Gracias por su pedido!')
    .newline()
    .newline()
    .cut();

  return enc.encode();
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function truncate(str: string, maxLen: number): string {
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function rightAlign(label: string, value: string, width: number): string {
  const spaces = width - label.length - value.length;
  return spaces <= 0 ? `${label}${value}` : `${label}${' '.repeat(spaces)}${value}`;
}
