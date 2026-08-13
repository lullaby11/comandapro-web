/**
 * Contrato entre la API y el frontend.
 *
 * Hasta ahora cada página del panel redeclaraba a mano las interfaces de pedido,
 * producto o cliente. Además de repetirse, se desincronizaban en silencio: el frontend
 * declaraba `total: number` cuando la API envía un string, y por eso el código está lleno
 * de `Number(...)` defensivos.
 *
 * DOS NIVELES A PROPÓSITO:
 *
 *   · Los tipos `…DTO` describen **lo que viaja por HTTP**. Prisma serializa los `Decimal`
 *     como string y las fechas como texto ISO, así que copiar los tipos de Prisma habría
 *     sido introducir un error nuevo, no quitarlo.
 *
 *   · Los tipos de dominio (sin sufijo) son lo que usa la interfaz: importes en número y
 *     fechas como `Date`. La conversión ocurre UNA VEZ, en el cliente de API.
 *
 * Se consume por `paths` de TypeScript, no como dependencia de npm: son tipos puros que
 * desaparecen al compilar, así que no hacen falta ni instalación ni resolución en tiempo
 * de ejecución. Eso encaja con el `npm install --no-workspaces` de cada app.
 */

// ─── Enumerados ───────────────────────────────────────────────────────────────

export type Rol = 'OWNER' | 'ADMIN' | 'STAFF';

export type EstadoPedido =
  | 'RECEIVED_ONLINE'
  | 'PENDING'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export type MetodoPago = 'CASH' | 'CARD';

export type ModoImpresora = 'webusb' | 'bluetooth' | 'printserver';

/** Importe tal y como lo envía la API: cadena con dos decimales, p. ej. `"12.50"`. */
export type ImporteDTO = string;
/** Fecha tal y como la envía la API: texto ISO 8601. */
export type FechaDTO = string;

// ─── Local ────────────────────────────────────────────────────────────────────

export interface AjustesLocal {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  phone: string | null;
  /** Buzón del local: recibe las respuestas de los clientes a sus correos. */
  email: string | null;
  address: string | null;
  paperWidth: number;
  printerMode: ModoImpresora;
  printServerUrl: string | null;
  currency: string;
  taxRate: number;
  onlineOrderEnabled: boolean;
}

// ─── Productos ────────────────────────────────────────────────────────────────

export interface ProductoDTO {
  id: string;
  name: string;
  description: string | null;
  price: ImporteDTO;
  stock: number;
  imageUrl: string | null;
  category: string | null;
  active: boolean;
  onlineVisible: boolean;
}

export interface Producto extends Omit<ProductoDTO, 'price'> {
  price: number;
}

// ─── Clientes ─────────────────────────────────────────────────────────────────

export interface Cliente {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
}

// ─── Pedidos ──────────────────────────────────────────────────────────────────

export interface LineaPedidoDTO {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: ImporteDTO;
  subtotal: ImporteDTO;
  notes: string | null;
  product?: { name: string; imageUrl?: string | null };
}

export interface LineaPedido extends Omit<LineaPedidoDTO, 'unitPrice' | 'subtotal'> {
  unitPrice: number;
  subtotal: number;
}

export interface PedidoDTO {
  id: string;
  status: EstadoPedido;
  trackingToken: string;
  subtotal: ImporteDTO;
  tax: ImporteDTO;
  shippingCost: ImporteDTO;
  total: ImporteDTO;
  cashGiven: ImporteDTO | null;
  paymentMethod: MetodoPago | null;
  isPickup: boolean;
  deliveryAddress: string | null;
  notes: string | null;
  estimatedDeliveryAt: FechaDTO | null;
  printRequestedAt: FechaDTO | null;
  printedAt: FechaDTO | null;
  createdAt: FechaDTO;
  customer: { name: string; phone: string };
  items: LineaPedidoDTO[];
}

export interface Pedido
  extends Omit<
    PedidoDTO,
    'subtotal' | 'tax' | 'shippingCost' | 'total' | 'cashGiven' | 'items' | 'createdAt' | 'estimatedDeliveryAt'
  > {
  subtotal: number;
  tax: number;
  shippingCost: number;
  total: number;
  cashGiven: number | null;
  createdAt: Date;
  estimatedDeliveryAt: Date | null;
  items: LineaPedido[];
}

export interface ListadoPedidosDTO {
  orders: PedidoDTO[];
  total: number;
  page: number;
  limit: number;
}

// ─── Servicios (turnos) ───────────────────────────────────────────────────────

export interface ServicioDTO {
  id: string;
  startedAt: FechaDTO;
  endedAt: FechaDTO | null;
}

// ─── Tarifas de envío ─────────────────────────────────────────────────────────

export interface TarifaEnvioDTO {
  id: string;
  name: string;
  price: ImporteDTO;
  active: boolean;
}

export interface TarifaEnvio extends Omit<TarifaEnvioDTO, 'price'> {
  price: number;
}

// ─── Equipo ───────────────────────────────────────────────────────────────────

export interface MiembroEquipo {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Rol;
  disabledAt: FechaDTO | null;
  isMe: boolean;
  joinedAt: FechaDTO;
}

export interface InvitacionEquipo {
  id: string;
  email: string;
  role: Rol;
  expiresAt: FechaDTO;
  createdAt: FechaDTO;
}

export interface RespuestaEquipo {
  members: MiembroEquipo[];
  invitations: InvitacionEquipo[];
}

// ─── Autenticación ────────────────────────────────────────────────────────────

export interface UsuarioSesion {
  id: string;
  name: string;
  email: string;
  role: Rol;
}

export interface LocalSesion {
  id: string;
  name: string;
  slug: string;
}

export interface RespuestaLogin {
  token: string;
  user: UsuarioSesion;
  business: LocalSesion;
}

// ─── Seguimiento público ──────────────────────────────────────────────────────

export interface SeguimientoPedidoDTO {
  id: string;
  status: EstadoPedido;
  isPickup: boolean;
  createdAt: FechaDTO;
  updatedAt: FechaDTO;
  estimatedDeliveryAt: FechaDTO | null;
  customerName: string;
  deliveryAddress: string | null;
  business: { name: string; logoUrl: string | null; phone: string | null };
  items: Array<{ productName: string; productImage: string | null; quantity: number; subtotal: number }>;
  total: number;
}

// ─── Errores ──────────────────────────────────────────────────────────────────

/** Forma de los errores de negocio que devuelve la API. */
export interface ErrorApi {
  error: string;
  /** Presente en el 409 de stock insuficiente. */
  details?: Array<{ productId: string; productName: string; available: number; requested: number }>;
  /** Presente en el 409 de transición de estado inválida. */
  from?: EstadoPedido;
  to?: EstadoPedido;
  allowed?: EstadoPedido[];
  /** Presente en el 403 por editar campos vetados de un producto. */
  fields?: string[];
  /** Presente en el 429 del limitador de intentos. */
  retryAfter?: number;
}
