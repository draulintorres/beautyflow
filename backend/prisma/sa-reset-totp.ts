import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Reinicio de emergencia del segundo factor (TOTP) de un SuperAdmin -- para
 * cuando pierde el teléfono Y los 8 códigos de respaldo. Corre por SSH en
 * el servidor, con docker compose exec (ver README). NO necesita
 * TOTP_ENCRYPTION_KEY: no descifra nada, solo borra el secreto cifrado y
 * los hashes de los códigos de respaldo -- el admin vuelve a enrolar desde
 * cero la próxima vez que inicie sesión.
 *
 * SA_RESET_EMAIL y SA_RESET_CONFIRM se leen SOLO de variables de entorno
 * (nunca argumentos de línea de comandos, que quedan en el historial de la
 * shell y en `ps`, ni prompts interactivos, que no sirven en un script no
 * interactivo de docker compose exec). SA_RESET_CONFIRM debe ser EXACTAMENTE
 * "RESET-TOTP:<el mismo correo>" -- una confirmación explícita por admin,
 * no un flag genérico tipo --yes que alguien podría copiar de un historial
 * y aplicar sin querer a un correo distinto.
 */
async function main() {
  const email = process.env.SA_RESET_EMAIL;
  if (!email) {
    throw new Error('Falta SA_RESET_EMAIL en el entorno -- no se puede reiniciar el segundo factor sin un correo.');
  }

  const confirmacionEsperada = `RESET-TOTP:${email}`;
  const confirmacion = process.env.SA_RESET_CONFIRM;
  if (confirmacion !== confirmacionEsperada) {
    throw new Error(
      'SA_RESET_CONFIRM no coincide -- no se tocó nada. ' +
        `Debe ser exactamente "RESET-TOTP:${email}" (el mismo correo que SA_RESET_EMAIL).`,
    );
  }

  const admin = await prisma.superAdmin.findFirst({
    where: { email, activo: true, deletedAt: null },
    select: { id: true, totpActivo: true },
  });
  if (!admin) {
    // No se revela si el correo no existe, está inactivo o borrado --
    // mismo criterio que el login real, nunca distinguir esos tres casos.
    throw new Error(`No se encontró un SuperAdmin activo con ese correo -- no se tocó nada.`);
  }

  if (!admin.totpActivo) {
    console.log(`${email}: el segundo factor ya estaba desactivado -- nada que reiniciar.`);
    return;
  }

  await prisma.$transaction([
    prisma.superAdmin.update({
      where: { id: admin.id },
      data: { totpActivo: false, totpSecretCifrado: null, totpUltimoPaso: null },
    }),
    prisma.superAdminCodigoRespaldo.deleteMany({ where: { superAdminId: admin.id } }),
  ]);

  console.log(`${email}: segundo factor reiniciado.`);
  console.log(
    'IMPORTANTE: inicia sesión y vuelve a registrar tu app autenticadora DE INMEDIATO. ' +
      'Mientras no lo hagas, cualquiera que tenga la contraseña de esta cuenta podría ' +
      'registrar la suya en tu lugar. Las sesiones ya emitidas antes de este reinicio ' +
      '(hasta 8 horas) siguen siendo válidas -- este reinicio no las revoca.',
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
