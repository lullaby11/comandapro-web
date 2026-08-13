import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

/**
 * Derecho de supresión (RGPD art. 17) y de portabilidad (art. 20).
 *
 * LA TENSIÓN A RESOLVER: el cliente puede exigir que se borren sus datos, pero el local
 * tiene obligación de conservar sus pedidos por motivos contables y fiscales. Borrar la
 * ficha sin más rompería el histórico —y de hecho la base de datos ni lo permite, porque
 * los pedidos la referencian—.
 *
 * La salida es anonimizar: el pedido sobrevive con sus importes y sus líneas, pero deja
 * de estar asociado a una persona identificable.
 */

const NOMBRE_ANONIMO = 'Cliente eliminado';

/**
 * Vacía todo dato personal de un cliente y de sus pedidos.
 *
 * Cubre los TRES sitios donde vive el dato, que es lo que se olvida al hacer esto a mano:
 *   1. La ficha del cliente (`Customer`).
 *   2. La cuenta de la tienda online (`CustomerAccount`), si la tiene.
 *   3. Los propios pedidos: dirección de entrega, notas —suelen llevar datos como "llamar
 *      al telefonillo de la vecina"— y el token de seguimiento.
 *
 * El token se regenera a propósito: es un enlace público que muestra nombre y dirección,
 * viaja impreso en el ticket y por correo, y seguiría funcionando indefinidamente.
 */
export async function anonimizarCliente(
  tx: Prisma.TransactionClient,
  businessId: string,
  customerId: string
): Promise<{ pedidosAfectados: number; cuentaOnline: boolean }> {
  const cliente = await tx.customer.findFirstOrThrow({
    where: { id: customerId, businessId },
  });

  // El teléfono es único por local: no se puede dejar vacío ni repetido
  const marcador = `eliminado-${crypto.randomBytes(6).toString('hex')}`;

  await tx.customer.update({
    where: { id: cliente.id },
    data: {
      name: NOMBRE_ANONIMO,
      phone: marcador,
      email: null,
      address: null,
      notes: null,
      anonymizedAt: new Date(),
    },
  });

  // La cuenta de la tienda online, si existe, se localiza por el teléfono o el correo
  // que tenía la ficha antes de vaciarla.
  const cuentas = await tx.customerAccount.findMany({
    where: {
      businessId,
      anonymizedAt: null,
      OR: [
        { phone: cliente.phone },
        ...(cliente.email ? [{ email: cliente.email }] : []),
      ],
    },
  });

  for (const cuenta of cuentas) {
    await tx.customerAccount.update({
      where: { id: cuenta.id },
      data: {
        name: NOMBRE_ANONIMO,
        phone: `eliminado-${crypto.randomBytes(6).toString('hex')}`,
        // El email es único por local y no admite nulo: se sustituye por uno inservible
        email: `eliminado-${crypto.randomBytes(8).toString('hex')}@invalid`,
        address: '',
        // Contraseña imposible de acertar: la cuenta deja de poder iniciar sesión
        passwordHash: crypto.randomBytes(32).toString('hex'),
        verifyToken: null,
        verifyExpiresAt: null,
        anonymizedAt: new Date(),
      },
    });
  }

  // Los pedidos conservan importes y líneas; pierden lo que identifica a la persona
  const pedidos = await tx.order.findMany({
    where: { customerId: cliente.id, businessId },
    select: { id: true },
  });

  for (const pedido of pedidos) {
    await tx.order.update({
      where: { id: pedido.id },
      data: {
        deliveryAddress: null,
        notes: null,
        // Invalida el enlace público de seguimiento, que mostraba nombre y dirección
        trackingToken: crypto.randomUUID(),
      },
    });
  }

  return { pedidosAfectados: pedidos.length, cuentaOnline: cuentas.length > 0 };
}

/**
 * Exporta todo lo que el local tiene en la plataforma (derecho de portabilidad).
 *
 * Es un volcado legible por máquina y por persona: JSON con los datos tal cual, no un
 * formato propietario. Incluye los pedidos borrados lógicamente, porque siguen siendo
 * datos del local.
 */
export async function exportarDatosDelLocal(businessId: string) {
  const [business, productos, clientes, servicios, tarifas, equipo, cuentas, pedidos] =
    await Promise.all([
      prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
      prisma.product.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } }),
      prisma.customer.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } }),
      prisma.service.findMany({ where: { businessId }, orderBy: { startedAt: 'asc' } }),
      prisma.shippingRate.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } }),
      prisma.businessUser.findMany({
        where: { businessId },
        include: { user: { select: { name: true, email: true, createdAt: true } } },
      }),
      prisma.customerAccount.findMany({
        where: { businessId },
        select: {
          id: true, name: true, phone: true, email: true, address: true,
          emailVerified: true, acceptedTermsAt: true, anonymizedAt: true, createdAt: true,
        },
      }),
      prisma.order.findMany({
        where: { businessId },
        include: { items: { include: { product: { select: { name: true } } } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

  return {
    exportadoEl: new Date().toISOString(),
    formato: 'olyda-export-v1',
    local: business,
    equipo: equipo.map((m) => ({
      nombre: m.user.name,
      email: m.user.email,
      rol: m.role,
      desactivadoEl: m.disabledAt,
      desde: m.createdAt,
    })),
    productos,
    clientes,
    cuentasDeClienteOnline: cuentas,
    servicios,
    tarifasDeEnvio: tarifas,
    pedidos,
    resumen: {
      productos: productos.length,
      clientes: clientes.length,
      pedidos: pedidos.length,
      servicios: servicios.length,
    },
  };
}
