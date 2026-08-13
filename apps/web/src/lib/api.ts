import type {
  ErrorApi,
  Pedido,
  PedidoDTO,
  LineaPedidoDTO,
  Producto,
  ProductoDTO,
  TarifaEnvio,
  TarifaEnvioDTO,
} from '@comandapro/shared-types';

/**
 * Cliente de API del panel.
 *
 * Antes, cada página redeclaraba `apiHeaders()` y `const API = ''` —ocho copias— y
 * manejaba los errores a su manera. Nadie redirigía al login de forma consistente cuando
 * caducaba la sesión: las pantallas se quedaban vacías sin explicar por qué.
 *
 * Las llamadas van en relativo a propósito: el rewrite de `next.config.ts` las redirige a
 * `NEXT_PUBLIC_API_URL`, así que el navegador y la API comparten origen y no hay CORS de
 * por medio. Ver docs/02-arquitectura.md.
 */

export class ErrorDeApi extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly cuerpo: ErrorApi | null = null
  ) {
    super(message);
    this.name = 'ErrorDeApi';
  }

  /** El limitador de intentos devuelve 429 con los segundos que faltan. */
  get esLimiteDeIntentos(): boolean {
    return this.status === 429;
  }
}

function token(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem('token');
}

function cerrarSesion(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('business');
  // Se conserva a dónde iba para volver ahí tras identificarse de nuevo
  const destino = encodeURIComponent(window.location.pathname);
  window.location.href = `/login?volver=${destino}`;
}

interface Opciones extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Por defecto, un 401 cierra la sesión y lleva al login. */
  ignorar401?: boolean;
}

async function peticion(ruta: string, opciones: Opciones = {}): Promise<Response> {
  const { body, ignorar401, headers, ...resto } = opciones;
  const t = token();

  const res = await fetch(ruta, {
    ...resto,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  // La sesión caducada se trata en un solo sitio, no en cada pantalla
  if (res.status === 401 && !ignorar401) {
    cerrarSesion();
    throw new ErrorDeApi(401, 'Tu sesión ha caducado');
  }

  return res;
}

/**
 * Devuelve la `Response` tal cual, con la cabecera de autenticación puesta y el 401
 * tratado en un solo sitio. Es lo que usan las pantallas que ya tienen su propia lógica
 * de `res.ok` y mensajes: migrarlas a `api<T>()` de golpe habría sido reescribir su
 * manejo de errores, y eso es un cambio de comportamiento, no una limpieza.
 */
export async function apiRes(ruta: string, opciones: Opciones = {}): Promise<Response> {
  return peticion(ruta, opciones);
}

/** Lanza `ErrorDeApi` con el mensaje que haya mandado la API, que suele ser legible. */
async function comprobar(res: Response): Promise<Response> {
  if (res.ok) return res;

  let cuerpo: ErrorApi | null = null;
  try {
    cuerpo = (await res.json()) as ErrorApi;
  } catch {
    // Respuesta sin JSON: nos quedamos con el código
  }

  const mensaje =
    typeof cuerpo?.error === 'string'
      ? cuerpo.error
      : `Error ${res.status}`;

  throw new ErrorDeApi(res.status, mensaje, cuerpo);
}

/** GET/POST/PATCH/DELETE que devuelven JSON. */
export async function api<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const res = await comprobar(await peticion(ruta, opciones));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Para el endpoint de impresión, que devuelve un binario ESC/POS y no JSON. */
export async function apiBinario(ruta: string, opciones: Opciones = {}): Promise<Uint8Array> {
  const res = await comprobar(await peticion(ruta, { method: 'POST', ...opciones }));
  return new Uint8Array(await res.arrayBuffer());
}

// ─── Normalización del formato de cable ───────────────────────────────────────
// Prisma serializa los Decimal como string y las fechas como texto ISO. La conversión
// ocurre aquí, una sola vez, en lugar de repartir `Number(...)` por las pantallas.

const aNumero = (v: string | null | undefined): number => (v == null ? 0 : Number(v));
const aFecha = (v: string | null | undefined): Date | null => (v == null ? null : new Date(v));

function normalizarLinea(l: LineaPedidoDTO) {
  return { ...l, unitPrice: aNumero(l.unitPrice), subtotal: aNumero(l.subtotal) };
}

export function normalizarPedido(p: PedidoDTO): Pedido {
  return {
    ...p,
    subtotal: aNumero(p.subtotal),
    tax: aNumero(p.tax),
    shippingCost: aNumero(p.shippingCost),
    total: aNumero(p.total),
    cashGiven: p.cashGiven == null ? null : aNumero(p.cashGiven),
    createdAt: new Date(p.createdAt),
    estimatedDeliveryAt: aFecha(p.estimatedDeliveryAt),
    items: p.items.map(normalizarLinea),
  };
}

export function normalizarProducto(p: ProductoDTO): Producto {
  return { ...p, price: aNumero(p.price) };
}

export function normalizarTarifa(t: TarifaEnvioDTO): TarifaEnvio {
  return { ...t, price: aNumero(t.price) };
}
