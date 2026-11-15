const JWT_SECRET_VARS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_SUPERADMIN_SECRET',
  'JWT_PORTAL_SECRET',
] as const;

const MIN_LENGTH_PROD = 32;

/**
 * Valida los 4 secretos de JWT (personal, refresh, superadmin, portal)
 * ANTES de que la app arranque -- exige que existan y no estén vacíos ni
 * sean solo espacios. En producción (NODE_ENV==='production') exige
 * además que cada uno tenga 32+ caracteres y que los 4 sean distintos
 * entre sí (si dos coincidieran, un token de un dominio verificaría
 * también en el otro, anulando la separación de secretos). Fuera de
 * producción (local/staging) acepta secretos cortos, como los de
 * backend/.env.example, para no romper el flujo de desarrollo.
 *
 * Los mensajes de error SOLO nombran las variables con problema, nunca
 * sus valores -- no hay que filtrar secretos en un log de arranque.
 */
export function validateJwtSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const valores: Partial<Record<(typeof JWT_SECRET_VARS)[number], string>> = {};
  const faltantes: string[] = [];

  for (const key of JWT_SECRET_VARS) {
    const raw = env[key];
    if (raw === undefined || raw.trim() === '') {
      faltantes.push(key);
    } else {
      valores[key] = raw;
    }
  }

  if (faltantes.length > 0) {
    throw new Error(
      `Faltan estas variables de entorno (o están vacías / solo espacios): ${faltantes.join(', ')}. ` +
        'Cada una debe tener un secreto real -- ver .env.example.',
    );
  }

  if (env.NODE_ENV !== 'production') return;

  const cortas = JWT_SECRET_VARS.filter((key) => (valores[key] as string).length < MIN_LENGTH_PROD);
  if (cortas.length > 0) {
    throw new Error(
      `En producción, estas variables deben tener ${MIN_LENGTH_PROD} caracteres o más: ${cortas.join(', ')}.`,
    );
  }

  const varsPorValor = new Map<string, string[]>();
  for (const key of JWT_SECRET_VARS) {
    const valor = valores[key] as string;
    const grupo = varsPorValor.get(valor) ?? [];
    grupo.push(key);
    varsPorValor.set(valor, grupo);
  }
  const grupoRepetido = [...varsPorValor.values()].find((grupo) => grupo.length > 1);
  if (grupoRepetido) {
    throw new Error(
      `En producción, los 4 secretos de JWT deben ser distintos entre sí, pero estas variables ` +
        `tienen el mismo valor: ${grupoRepetido.join(' y ')}.`,
    );
  }
}
