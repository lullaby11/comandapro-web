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

  // Se aplican las MIGRACIONES, no `db push`. Dos motivos:
  //   1. El esquema incluye SQL que Prisma no sabe declarar —el índice único parcial que
  //      garantiza un solo servicio activo por local—, y `db push` se lo saltaría.
  //   2. Obliga a que todo cambio de esquema lleve su migración: si alguien toca
  //      schema.prisma sin generarla, los tests corren contra el esquema viejo y fallan.
  //      Es justo la disciplina que faltaba y que dejó producción sin historial.
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
