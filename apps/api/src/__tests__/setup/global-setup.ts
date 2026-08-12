import { execSync } from 'child_process';

/**
 * Prepara la base de datos de test una sola vez por ejecución.
 *
 * Se usa una base REAL de PostgreSQL, no un doble: Prisma genera SQL y las reglas que
 * más importan aquí (el descuento de stock con `UPDATE ... WHERE stock >= n`, los índices
 * únicos, las transacciones) solo se comportan de verdad contra el motor.
 */
export default function globalSetup() {
  const url = process.env.DATABASE_URL_TEST;

  if (!url) {
    throw new Error(
      'Falta DATABASE_URL_TEST. Ejemplo:\n' +
        '  DATABASE_URL_TEST="postgresql://comandapro:comandapro@localhost:5432/comandapro_test"\n' +
        'Arranca la base con `docker-compose up -d` y crea la base de test si no existe.'
    );
  }

  if (!/test/i.test(url)) {
    // Salvaguarda: nunca ejecutar la suite contra desarrollo o, peor, producción.
    throw new Error(`DATABASE_URL_TEST debe apuntar a una base con "test" en el nombre. Recibido: ${url}`);
  }

  // `db push` en lugar de `migrate deploy`: aquí interesa el esquema declarado en
  // schema.prisma, no reproducir el historial de migraciones.
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
