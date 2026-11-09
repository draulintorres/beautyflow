const HEX_GRUPO = /^[0-9a-fA-F]{1,4}$/;
const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const IPV4_MAPEADA = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

/**
 * Expande una IPv6 (tolerando compresión "::") a sus 8 grupos de 16 bits,
 * normalizados sin ceros a la izquierda, y devuelve el prefijo /64 (los
 * primeros 4 grupos — la parte de red, no la de host). Devuelve null si
 * el formato no es una IPv6 válida.
 */
function prefijoIpv6_64(raw: string): string | null {
  const ip = raw.split('%')[0]; // descarta zone id ("%eth0"), si viniera

  const primeraDoble = ip.indexOf('::');
  let izquierda: string[];
  let derecha: string[];

  if (primeraDoble !== -1) {
    if (ip.indexOf('::', primeraDoble + 1) !== -1) return null; // más de un "::"
    const [partIzq, partDer] = ip.split('::');
    izquierda = partIzq ? partIzq.split(':') : [];
    derecha = partDer ? partDer.split(':') : [];
  } else {
    izquierda = ip.split(':');
    derecha = [];
  }

  const faltantes = 8 - (izquierda.length + derecha.length);
  if (faltantes < 0) return null; // demasiados grupos -> formato inválido
  if (primeraDoble === -1 && faltantes !== 0) return null; // sin "::", deben ser exactamente 8

  const grupos = [...izquierda, ...Array(primeraDoble !== -1 ? faltantes : 0).fill('0'), ...derecha];
  if (grupos.length !== 8) return null;

  const normalizados: string[] = [];
  for (const g of grupos) {
    if (!HEX_GRUPO.test(g)) return null;
    normalizados.push(parseInt(g, 16).toString(16));
  }

  return normalizados.slice(0, 4).join(':');
}

/**
 * Normaliza una IP para usarla en llaves de rate-limit:
 * - IPv4: igual.
 * - IPv4 mapeada en IPv6 (::ffff:a.b.c.d): se devuelve solo la parte IPv4
 *   -- es la misma dirección, solo escrita distinto según cómo la haya
 *   anotado Express/Node.
 * - IPv6: se devuelve el prefijo /64 (primeros 4 grupos), no la dirección
 *   completa. En IPv6 un mismo cliente suele rotar la parte de host (los
 *   últimos 64 bits) dentro de su propia red — usar la dirección completa
 *   dejaría que cada fallo cayera en una llave distinta y el límite nunca
 *   se alcanzara. Dos direcciones del mismo /64 comparten llave; de /64
 *   distintos, no.
 * - Vacío, no-string o que no parsea como IP válida: 'desconocida'. Esto
 *   implica que TODAS las requests sin IP utilizable comparten una sola
 *   llave global — si TRUST_PROXY_HOPS está mal configurado (o el proxy
 *   no manda X-Forwarded-For) y muchos clientes legítimos caen en
 *   'desconocida', compartirán el mismo contador y podrían bloquearse
 *   entre sí. No es un escenario esperado en producción (Caddy siempre
 *   manda la IP real), pero es la razón por la que trust-proxy (ETAPA 10a)
 *   debe estar bien configurado.
 */
export function normalizarIp(raw: string | undefined | null): string {
  if (typeof raw !== 'string') return 'desconocida';
  const ip = raw.trim();
  if (!ip) return 'desconocida';

  const mapeada = IPV4_MAPEADA.exec(ip);
  if (mapeada) return mapeada[1];

  if (IPV4.test(ip)) return ip;

  if (ip.includes(':')) {
    const prefijo = prefijoIpv6_64(ip);
    if (prefijo) return prefijo;
  }

  return 'desconocida';
}
