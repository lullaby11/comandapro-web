import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { prisma } from '../../prisma/client';

/**
 * Factorías para montar el escenario de cada test sin repetir veinte líneas de `create`.
 * Todo lleva valores por defecto razonables y admite sobreescritura parcial.
 */

let contador = 0;
/** Sufijo único para que dos escenarios del mismo test no choquen en los índices únicos. */
function unico(): string {
  contador += 1;
  return `${Date.now().toString(36)}${contador}`;
}

export async function crearLocal(datos: Partial<{ name: string; slug: string; taxRate: number; onlineOrderEnabled: boolean }> = {}) {
  return prisma.business.create({
    data: {
      name: datos.name ?? 'Local de prueba',
      slug: datos.slug ?? `local-${unico()}`,
      taxRate: datos.taxRate ?? 0,
      onlineOrderEnabled: datos.onlineOrderEnabled ?? false,
    },
  });
}

export async function crearUsuario(
  businessId: string,
  datos: Partial<{ email: string; password: string; name: string; role: Role }> = {}
) {
  const password = datos.password ?? 'contrasena1234';
  const user = await prisma.user.create({
    data: {
      email: datos.email ?? `usuario-${unico()}@ejemplo.com`,
      name: datos.name ?? 'Usuaria de prueba',
      passwordHash: await bcrypt.hash(password, 4), // coste bajo: los tests no miden fuerza bruta
    },
  });

  const businessUser = await prisma.businessUser.create({
    data: { userId: user.id, businessId, role: datos.role ?? 'OWNER' },
  });

  return { user, businessUser, password };
}

/** Cabecera lista para usar con supertest. */
export function cabeceraAuth(userId: string, businessId: string, role: Role = 'OWNER') {
  const token = jwt.sign({ userId, businessId, role }, process.env.JWT_SECRET!, { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

export async function crearProducto(
  businessId: string,
  datos: Partial<{ name: string; price: number; stock: number; active: boolean; onlineVisible: boolean }> = {}
) {
  return prisma.product.create({
    data: {
      businessId,
      name: datos.name ?? `Producto ${unico()}`,
      price: datos.price ?? 10,
      stock: datos.stock ?? 100,
      active: datos.active ?? true,
      onlineVisible: datos.onlineVisible ?? false,
    },
  });
}

export async function crearCliente(businessId: string, datos: Partial<{ name: string; phone: string; address: string }> = {}) {
  return prisma.customer.create({
    data: {
      businessId,
      name: datos.name ?? 'Cliente de prueba',
      phone: datos.phone ?? `6${unico().slice(-8)}`,
      address: datos.address ?? 'Calle de prueba 1',
    },
  });
}

/** Abre un servicio: sin él la API rechaza cualquier pedido. */
export async function abrirServicio(businessId: string) {
  return prisma.service.create({ data: { businessId } });
}

export async function crearTarifaEnvio(businessId: string, price = 3) {
  return prisma.shippingRate.create({
    data: { businessId, name: `Zona ${unico()}`, price },
  });
}

/**
 * Escenario completo y listo para pedir: local con servicio abierto, dueño autenticado,
 * un cliente y un producto con stock.
 */
export async function escenarioBase(opciones: { taxRate?: number; stock?: number; precio?: number } = {}) {
  const business = await crearLocal({ taxRate: opciones.taxRate ?? 0 });
  const { user } = await crearUsuario(business.id);
  const service = await abrirServicio(business.id);
  const customer = await crearCliente(business.id);
  const product = await crearProducto(business.id, {
    stock: opciones.stock ?? 100,
    price: opciones.precio ?? 10,
  });

  return {
    business,
    user,
    service,
    customer,
    product,
    auth: cabeceraAuth(user.id, business.id),
  };
}
