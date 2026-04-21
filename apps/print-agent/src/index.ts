import 'dotenv/config';
import HID from 'node-hid';

const REQUIRED = [
  'PRINT_AGENT_API_URL',
  'PRINT_AGENT_EMAIL',
  'PRINT_AGENT_PASSWORD',
  'PRINT_AGENT_BUSINESS_SLUG',
] as const;

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[print-agent] Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const API_URL = process.env.PRINT_AGENT_API_URL!;
const EMAIL = process.env.PRINT_AGENT_EMAIL!;
const PASSWORD = process.env.PRINT_AGENT_PASSWORD!;
const BUSINESS_SLUG = process.env.PRINT_AGENT_BUSINESS_SLUG!;
const POLL_MS = Number(process.env.PRINT_AGENT_POLL_INTERVAL_MS ?? 5000);

// USB Vendor/Product IDs — ajusta según tu modelo de impresora
// Epson TM-T20: 0x04b8 / 0x0202
// Star TSP100:  0x0519 / 0x0003
const PRINTER_VENDOR_ID = parseInt(process.env.PRINTER_VENDOR_ID ?? '0x04b8', 16);
const PRINTER_PRODUCT_ID = parseInt(process.env.PRINTER_PRODUCT_ID ?? '0x0202', 16);

let jwtToken: string | null = null;
let printer: HID.HID | null = null;

// ── Auth ──────────────────────────────────────────────────────────────────────

async function login(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, slug: BUSINESS_SLUG }),
    });
    if (!res.ok) {
      console.error('[print-agent] Login failed:', res.status, await res.text());
      return false;
    }
    const data = (await res.json()) as { token: string };
    jwtToken = data.token;
    console.log('[print-agent] Autenticado correctamente');
    return true;
  } catch (err) {
    console.error('[print-agent] Error en login:', (err as Error).message);
    return false;
  }
}

// ── Printer ───────────────────────────────────────────────────────────────────

function connectPrinter(): boolean {
  try {
    printer = new HID.HID(PRINTER_VENDOR_ID, PRINTER_PRODUCT_ID);
    console.log(`[print-agent] Impresora conectada (VID=0x${PRINTER_VENDOR_ID.toString(16)} PID=0x${PRINTER_PRODUCT_ID.toString(16)})`);
    printer.on('error', (err: Error) => {
      console.error('[print-agent] Error impresora:', err.message);
      printer = null;
    });
    return true;
  } catch {
    console.warn('[print-agent] Impresora no encontrada, reintentando...');
    return false;
  }
}

function sendToPrinter(buffer: Buffer): void {
  if (!printer) throw new Error('Impresora no conectada');
  const CHUNK = 63;
  for (let i = 0; i < buffer.length; i += CHUNK) {
    const chunk = [...buffer.subarray(i, i + CHUNK)];
    printer.write([0x00, ...chunk]);
  }
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${jwtToken}` },
  });
  if (res.status === 401) {
    jwtToken = null;
    throw new Error('Token expirado, se volverá a autenticar');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} GET ${path}`);
  return res.json() as Promise<T>;
}

async function apiPostRaw(path: string): Promise<Buffer | null> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwtToken}` },
  });
  if (res.status === 401) {
    jwtToken = null;
    throw new Error('Token expirado, se volverá a autenticar');
  }
  if (!res.ok) {
    console.error(`[print-agent] Error ${res.status} POST ${path}`);
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  if (!jwtToken) {
    const ok = await login();
    if (!ok) return;
  }

  if (!printer) {
    connectPrinter();
    if (!printer) return;
  }

  let orders: { id: string; trackingToken: string }[];
  try {
    const result = await apiGet<{ orders: { id: string; trackingToken: string }[] }>(
      '/api/orders?status=PENDING&notPrinted=true&limit=10'
    );
    orders = result.orders;
  } catch (err) {
    console.error('[print-agent] Error consultando pedidos:', (err as Error).message);
    return;
  }

  for (const order of orders) {
    try {
      const escBuffer = await apiPostRaw(`/api/orders/${order.id}/print`);
      if (!escBuffer) continue;
      sendToPrinter(escBuffer);
      console.log(`[print-agent] ✓ Pedido ${order.id} impreso`);
    } catch (err) {
      console.error(`[print-agent] Error imprimiendo ${order.id}:`, (err as Error).message);
      if ((err as Error).message.includes('no conectada')) printer = null;
    }
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

console.log('[print-agent] Iniciando agente de impresión local...');
console.log(`  API: ${API_URL}`);
console.log(`  Local: ${BUSINESS_SLUG} | Intervalo: ${POLL_MS}ms`);

connectPrinter();
poll();
setInterval(poll, POLL_MS);
