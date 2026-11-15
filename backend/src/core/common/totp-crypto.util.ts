import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const JWT_SECRET_VARS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_SUPERADMIN_SECRET',
  'JWT_PORTAL_SECRET',
] as const;

const KEY_HEX_LENGTH = 64; // 32 bytes en hex
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const FORMAT_PREFIX = 'v1';

/**
 * Valida TOTP_ENCRYPTION_KEY ANTES de que la app arranque -- misma idea que
 * validateJwtSecrets() (ver jwt-secrets.util.ts): obligatoria siempre, no
 * vacía, exactamente 32 bytes en hex (64 caracteres). En producción,
 * además, distinta de los 4 secretos de JWT -- si coincidiera con alguno,
 * quien tenga ese secreto (ej. para firmar tokens) también podría
 * descifrar los secretos TOTP guardados en la base.
 *
 * Los mensajes de error SOLO nombran variables, nunca valores.
 */
export function validateTotpEncryptionKey(env: NodeJS.ProcessEnv = process.env): void {
  const raw = env.TOTP_ENCRYPTION_KEY;
  if (raw === undefined || raw.trim() === '') {
    throw new Error(
      'Falta la variable de entorno TOTP_ENCRYPTION_KEY (o está vacía / solo espacios). ' +
        'Debe ser un hex de 32 bytes -- ver .env.example (openssl rand -hex 32).',
    );
  }

  if (raw.length !== KEY_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error(
      `TOTP_ENCRYPTION_KEY tiene un formato inválido: debe ser exactamente ${KEY_HEX_LENGTH} ` +
        'caracteres hexadecimales (32 bytes) -- generar con `openssl rand -hex 32`.',
    );
  }

  if (env.NODE_ENV !== 'production') return;

  const coincide = JWT_SECRET_VARS.find((key) => env[key] === raw);
  if (coincide) {
    throw new Error(
      `En producción, TOTP_ENCRYPTION_KEY debe ser distinta de ${coincide}, pero tienen el mismo valor.`,
    );
  }
}

/** Error propio para fallos de descifrado -- nunca expone el valor cifrado ni la clave. */
export class TotpDecryptError extends Error {
  constructor() {
    super('No se pudo descifrar el secreto TOTP: clave incorrecta, dato alterado o adminId distinto.');
    this.name = 'TotpDecryptError';
  }
}

function obtenerClave(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.TOTP_ENCRYPTION_KEY;
  if (raw === undefined || raw.length !== KEY_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error('TOTP_ENCRYPTION_KEY inválida o ausente -- validateTotpEncryptionKey() debió detener el arranque antes.');
  }
  return Buffer.from(raw, 'hex');
}

/**
 * Cifra un secreto TOTP en texto plano con AES-256-GCM. IV aleatorio de 12
 * bytes por cada llamada (dos cifrados del mismo texto plano NUNCA dan el
 * mismo resultado). AAD = adminId: ata el texto cifrado a ese admin
 * específico -- copiar el valor cifrado de un admin a la fila de otro
 * falla al descifrar en vez de descifrar "con éxito" algo que no le
 * corresponde.
 *
 * Formato de salida: "v1:<iv>:<tag>:<ct>", cada parte en base64.
 */
export function cifrarSecreto(
  plano: string,
  adminId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const key = obtenerClave(env);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(adminId, 'utf8'));
  const ct = Buffer.concat([cipher.update(plano, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    FORMAT_PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    ct.toString('base64'),
  ].join(':');
}

/**
 * Descifra un valor producido por cifrarSecreto(). Lanza TotpDecryptError
 * (nunca el error crudo de node:crypto, que podría filtrar detalles) si la
 * clave es distinta, el AAD (adminId) no coincide, o el dato fue alterado.
 */
export function descifrarSecreto(
  cifrado: string,
  adminId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const key = obtenerClave(env);
  const partes = cifrado.split(':');
  if (partes.length !== 4 || partes[0] !== FORMAT_PREFIX) {
    throw new TotpDecryptError();
  }
  const [, ivB64, tagB64, ctB64] = partes;

  try {
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from(adminId, 'utf8'));
    decipher.setAuthTag(tag);
    const plano = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plano.toString('utf8');
  } catch {
    throw new TotpDecryptError();
  }
}
