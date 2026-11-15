import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';

const ISSUER = 'Estixa';
const PERIOD_SECONDS = 30;
const DIGITS = 6;

function crearTotp(secret?: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    crypto: new NobleCryptoPlugin(),
    base32: new ScureBase32Plugin(),
    digits: DIGITS,
    period: PERIOD_SECONDS,
    ...(secret !== undefined && { secret }),
  });
}

/** Genera un secreto nuevo en Base32 (20 bytes, el tamaño recomendado por
 * el RFC 4226/6238 para HMAC-SHA1). */
export function generarSecretoTotp(): string {
  return crearTotp().generateSecret();
}

/** Construye la URI otpauth://totp/... para el QR de alta -- issuer fijo
 * "Estixa", label = email del SuperAdmin. */
export function construirUriTotp(secret: string, email: string): string {
  return crearTotp(secret).toURI({ label: email, issuer: ISSUER });
}

export interface VerificacionTotp {
  valido: boolean;
  /** Paso de tiempo concreto (RFC 6238: floor(epoch/30)) que coincidió --
   * solo presente si valido=true. Sirve para anti-repetición: el
   * llamador debe rechazar cualquier verificación futura con
   * paso <= al último paso aceptado para este admin. */
  paso?: number;
}

const FORMATO_CODIGO = /^\d{6}$/;

/**
 * Verifica un código TOTP de 6 dígitos con ventana ±1 paso (tolera hasta
 * 30s de drift de reloj en cualquier dirección, como pide RFC 6238
 * sección 5.2). otplib ya compara en tiempo constante internamente.
 *
 * `ultimoPasoAceptado`, si se pasa, rechaza cualquier paso <= ese valor
 * (anti-repetición real -- no solo "el código es matemáticamente válido
 * en la ventana", sino "este paso específico no se usó ya").
 *
 * Nunca lanza por una entrada mal formada (vacía, con letras, de 5/8
 * dígitos, null/undefined) -- el llamador es un endpoint HTTP que no
 * debe distinguir "formato inválido" de "código incorrecto" en su
 * respuesta, así que ambos casos devuelven simplemente {valido:false}.
 *
 * `ahoraMs`, si se pasa (epoch en milisegundos), fija el reloj usado
 * para verificar -- pensado para pruebas deterministas que no dependan
 * de en qué punto del paso de 30s esté el reloj real al correr.
 */
export async function verificarCodigoTotp(
  codigo: string | null | undefined,
  secret: string,
  ultimoPasoAceptado?: number,
  ahoraMs: number = Date.now(),
): Promise<VerificacionTotp> {
  if (typeof codigo !== 'string') return { valido: false };
  const limpio = codigo.replace(/\s+/g, '');
  if (!FORMATO_CODIGO.test(limpio)) return { valido: false };

  const totp = crearTotp(secret);
  const resultado = await totp.verify(limpio, {
    secret,
    epoch: ahoraMs / 1000,
    epochTolerance: [PERIOD_SECONDS, PERIOD_SECONDS],
    ...(ultimoPasoAceptado !== undefined && { afterTimeStep: ultimoPasoAceptado }),
  });

  if (!resultado.valid) return { valido: false };
  return { valido: true, paso: resultado.timeStep };
}
