import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

// Crockford Base32: sin I, L, O, U (se confunden con 1, 1, 0, V al
// transcribir a mano) -- alfabeto estándar para códigos que una persona
// puede necesitar copiar de una pantalla.
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const CANTIDAD_CODIGOS = 8;
// 10 bytes = 80 bits de entropía (>= 64 bits pedidos), y 80/5=16 es
// múltiplo exacto de 5 bits por carácter Base32 -- sin padding.
const BYTES_POR_CODIGO = 10;
const BCRYPT_ROUNDS = 12; // mismo costo que passwordHash en el resto del proyecto

function codificarCrockford(bytes: Buffer): string {
  let bits = '';
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let salida = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    const indice = parseInt(bits.slice(i, i + 5), 2);
    salida += CROCKFORD_ALPHABET[indice];
  }
  return salida;
}

/** Agrupa en bloques de 4 separados por guion, ej. "ABCD-EFGH-JKMN-PQRS". */
function agruparEnBloques(codigo: string): string {
  const bloques: string[] = [];
  for (let i = 0; i < codigo.length; i += 4) {
    bloques.push(codigo.slice(i, i + 4));
  }
  return bloques.join('-');
}

/** Genera 8 códigos de respaldo de un solo uso, cada uno con 80 bits de
 * entropía, en Base32 Crockford, mostrados en grupos de 4 ("ABCD-EFGH-...").
 * Se devuelven en claro -- el llamador los muestra UNA sola vez y guarda
 * solo su hash (ver hashCodigoRespaldo). */
export function generarCodigosRespaldo(cantidad: number = CANTIDAD_CODIGOS): string[] {
  const codigos: string[] = [];
  for (let i = 0; i < cantidad; i++) {
    const crudo = codificarCrockford(randomBytes(BYTES_POR_CODIGO));
    codigos.push(agruparEnBloques(crudo));
  }
  return codigos;
}

/** Normaliza lo que el usuario tipeó: mayúsculas, sin guiones ni espacios
 * -- así "abcd-efgh-jkmn-pqrs" y "ABCDEFGHJKMNPQRS" son el mismo código al
 * comparar contra el hash guardado. */
export function normalizarCodigoRespaldo(entrada: string): string {
  return entrada.toUpperCase().replace(/[\s-]/g, '');
}

/** Hashea un código de respaldo (ya normalizado) con bcrypt -- mismo
 * costo que los hashes de contraseña del resto del proyecto. */
export async function hashCodigoRespaldo(codigo: string): Promise<string> {
  return bcrypt.hash(normalizarCodigoRespaldo(codigo), BCRYPT_ROUNDS);
}

/** Verifica un código de respaldo (en cualquier formato que haya tipeado
 * el usuario) contra un hash guardado. El llamador es responsable de
 * marcar el código como usado si esto devuelve true -- esta función no
 * tiene estado ni toca la base de datos. */
export async function verificarCodigoRespaldo(entrada: string, hash: string): Promise<boolean> {
  return bcrypt.compare(normalizarCodigoRespaldo(entrada), hash);
}
