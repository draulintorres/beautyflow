import { randomBytes, createHash } from 'crypto';

// Crockford Base32: sin I, L, O, U (se confunden con 1, 1, 0, V al
// transcribir a mano) -- alfabeto estándar para códigos que una persona
// puede necesitar copiar de una pantalla.
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const CANTIDAD_CODIGOS = 8;
// 10 bytes = 80 bits de entropía (>= 64 bits pedidos), y 80/5=16 es
// múltiplo exacto de 5 bits por carácter Base32 -- sin padding.
const BYTES_POR_CODIGO = 10;

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

/** Normaliza lo que el usuario tipeó: mayúsculas, sin guiones ni espacios,
 * y mapea los caracteres que NO existen en el alfabeto Crockford pero que
 * alguien puede escribir por error al transcribir a mano (O->0, I->1,
 * L->1) -- así "O" y "0", o "I"/"L" y "1", siempre caen en el mismo
 * código al comparar contra el hash guardado. */
export function normalizarCodigoRespaldo(entrada: string): string {
  return entrada
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/**
 * Hashea un código de respaldo (ya normalizado) con SHA-256 -- síncrono y
 * determinista a propósito: la verificación es por BÚSQUEDA del hash en
 * la base (buscar la fila con codigoHash=X y usadoEn=null), no por
 * comparación 1-a-1 como con una contraseña. Un código de respaldo ya
 * tiene 80 bits de entropía propios (ver generarCodigosRespaldo) -- no
 * necesita el costo ni el salt de bcrypt, que además impediría buscarlo
 * directo por hash en una consulta SQL.
 */
export function hashCodigoRespaldo(codigo: string): string {
  return createHash('sha256').update(normalizarCodigoRespaldo(codigo), 'utf8').digest('hex');
}
