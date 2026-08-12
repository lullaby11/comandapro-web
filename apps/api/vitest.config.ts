import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Se fijan aquí y no en el fichero de setup porque los módulos del servidor leen
    // estas variables al importarse, antes de que ningún setup haya podido ejecutarse.
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      JWT_SECRET: 'secreto-solo-para-tests',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
      MAIL_TRANSPORT: 'log', // no se envía correo de verdad en los tests
    },
    // Prisma necesita una base de datos real: simularla daría tests que pasan mientras
    // producción falla. Se usa PostgreSQL de verdad contra una base aparte.
    globalSetup: ['./src/__tests__/setup/global-setup.ts'],
    setupFiles: ['./src/__tests__/setup/setup.ts'],
    // Los tests comparten una única base de datos y se limpian entre ficheros, así que
    // no pueden correr en paralelo.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
