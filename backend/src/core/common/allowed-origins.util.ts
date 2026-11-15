/**
 * Parsea ALLOWED_ORIGINS para app.enableCors(): split por coma, trim de
 * cada entrada, descarta vacíos (listas con espacios, ej.
 * "https://app.estixa.com, https://admin.estixa.com", quedaban rotas
 * antes de esto -- la entrada con espacio inicial nunca coincidía con el
 * header Origin real del navegador).
 *
 * undefined (variable no definida) devuelve `true` (cualquier origen
 * permitido) -- mismo comportamiento que antes de este cambio. Definida
 * pero sin ningún origen real tras limpiar (ej. "", " ", ",,") devuelve
 * un arreglo vacío (ningún origen permitido) en vez de `true`: si
 * alguien definió la variable, se respeta su intención aunque quede
 * vacía, en vez de caer silenciosamente a "permitir cualquier origen".
 */
export function parseAllowedOrigins(raw: string | undefined): string[] | true {
  if (raw === undefined) return true;

  return raw
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen.length > 0);
}
