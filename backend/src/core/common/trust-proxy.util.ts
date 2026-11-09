/**
 * Lee TRUST_PROXY_HOPS y valida que sea un entero entre 0 y 5 (cantidad de
 * proxies de confianza delante de la app — p. ej. 1 para Caddy solo, 2 si
 * se agrega Cloudflare delante de Caddy). Lanza si el valor es inválido
 * para que la app falle al arrancar en vez de aplicar un trust proxy
 * incorrecto en silencio.
 */
export function resolveTrustProxyHops(
  raw: string | undefined = process.env.TRUST_PROXY_HOPS,
): number {
  if (raw === undefined || raw === '') return 1;

  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 5) {
    throw new Error(
      `TRUST_PROXY_HOPS inválido: "${raw}". Debe ser un entero entre 0 y 5 ` +
        '(cantidad de proxies de confianza delante de la app, p. ej. 1 para Caddy).',
    );
  }
  return n;
}
