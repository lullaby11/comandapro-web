import 'dotenv/config';
import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

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
const PRINTER_NAME = process.env.PRINTER_NAME ?? 'Printer_USB_Printer_P';

let jwtToken: string | null = null;

// ── Auth ──────────────────────────────────────────────────────────────────────

async function login(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, businessSlug: BUSINESS_SLUG }),
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

function sendToPrinter(buffer: Buffer): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const tmpFile = join(tmpdir(), `print-agent-${Date.now()}.bin`);
    try {
      await writeFile(tmpFile, buffer);
      execFile('lp', ['-d', PRINTER_NAME, '-o', 'raw', tmpFile], (err) => {
        unlink(tmpFile).catch(() => {});
        if (err) reject(err);
        else resolve();
      });
    } catch (err) {
      unlink(tmpFile).catch(() => {});
      reject(err);
    }
  });
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

  let orders: { id: string }[];
  try {
    const result = await apiGet<{ orders: { id: string }[] }>(
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
      await sendToPrinter(escBuffer);
      console.log(`[print-agent] ✓ Pedido ${order.id} impreso`);
    } catch (err) {
      console.error(`[print-agent] Error imprimiendo ${order.id}:`, (err as Error).message);
    }
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

console.log('[print-agent] Iniciando agente de impresión local...');
console.log(`  API:      ${API_URL}`);
console.log(`  Negocio:  ${BUSINESS_SLUG}`);
console.log(`  Impresora: ${PRINTER_NAME}`);
console.log(`  Intervalo: ${POLL_MS}ms`);

poll();
setInterval(poll, POLL_MS);
