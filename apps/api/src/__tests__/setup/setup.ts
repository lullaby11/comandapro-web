import { beforeAll, afterEach, afterAll } from 'vitest';
import { prisma } from '../../prisma/client';

// Las variables de entorno se fijan en vitest.config.ts (bloque `test.env`), no aquí:
// los módulos del servidor las leen al importarse, antes de que este fichero corra.

/** Tablas en orden inverso de dependencia, para que los borrados no choquen con las FK. */
const TABLAS = [
  'email_outbox',
  'order_items',
  'orders',
  'services',
  'products',
  'customers',
  'customer_accounts',
  'shipping_rates',
  'business_users',
  'users',
  'businesses',
];

export async function limpiarBaseDeDatos(): Promise<void> {
  // TRUNCATE ... CASCADE es más rápido que borrar fila a fila y reinicia las secuencias.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLAS.map((t) => `"${t}"`).join(', ')} CASCADE`);
}

beforeAll(async () => {
  await limpiarBaseDeDatos();
});

// Cada test arranca con la base vacía: así el orden de ejecución nunca importa y un test
// que falla no arrastra a los siguientes.
afterEach(async () => {
  await limpiarBaseDeDatos();
});

afterAll(async () => {
  await prisma.$disconnect();
});
