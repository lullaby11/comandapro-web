import 'dotenv/config';
import { prisma } from '../src/prisma/client';

/**
 * Concede o revoca acceso de administrador de plataforma.
 *
 * El primer administrador no puede crearse desde la interfaz —no habría nadie que
 * pudiera concederlo—, así que el arranque se hace por consola, con acceso a la base de
 * datos. A partir de ahí queda registrado quién concedió qué.
 *
 *   npm run platform:grant  -- persona@ejemplo.com
 *   npm run platform:revoke -- persona@ejemplo.com
 *   npm run platform:list
 *
 * La persona debe tener ya una cuenta en la plataforma (haber creado un local o haber
 * aceptado una invitación): esto no crea usuarios, solo eleva los que existen.
 */
async function main() {
  const accion = process.argv[2];
  const email = process.argv[3]?.toLowerCase().trim();

  if (accion === 'list') {
    const admins = await prisma.platformAdmin.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (admins.length === 0) {
      console.log('No hay ningún administrador de plataforma.');
    } else {
      console.log(`Administradores de plataforma (${admins.length}):`);
      for (const a of admins) {
        console.log(`  · ${a.user.name} <${a.user.email}>  desde ${a.createdAt.toISOString().slice(0, 10)}`);
      }
    }
    return;
  }

  if (!email || !['grant', 'revoke'].includes(accion)) {
    console.error('Uso: tsx scripts/conceder-acceso-plataforma.ts <grant|revoke|list> [email]');
    process.exit(1);
  }

  const usuario = await prisma.user.findUnique({
    where: { email },
    include: { platformAdmin: true },
  });

  if (!usuario) {
    console.error(
      `No existe ningún usuario con el correo ${email}.\n` +
        'Este script no crea cuentas: la persona debe registrarse o aceptar una invitación primero.'
    );
    process.exit(1);
  }

  if (accion === 'grant') {
    if (usuario.platformAdmin) {
      console.log(`${email} ya era administrador de plataforma.`);
      return;
    }
    await prisma.platformAdmin.create({
      data: { userId: usuario.id, grantedBy: 'consola' },
    });
    await prisma.platformAuditLog.create({
      data: { adminEmail: 'consola', action: 'conceder_acceso_plataforma', detail: email },
    });
    console.log(`✓ ${usuario.name} <${email}> ya es administrador de plataforma.`);
    console.log('  Entra en /plataforma con su contraseña habitual.');
    return;
  }

  if (!usuario.platformAdmin) {
    console.log(`${email} no era administrador de plataforma.`);
    return;
  }
  await prisma.platformAdmin.delete({ where: { id: usuario.platformAdmin.id } });
  await prisma.platformAuditLog.create({
    data: { adminEmail: 'consola', action: 'revocar_acceso_plataforma', detail: email },
  });
  console.log(`✓ Revocado el acceso de plataforma a ${email}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
