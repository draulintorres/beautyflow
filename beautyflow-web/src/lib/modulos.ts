/** Mapeo canónico ruta → módulo requerido. */
export const RUTA_MODULO: Record<string, string> = {
  '/dashboard':          'dashboard',
  '/agenda':             'agenda',
  '/pos':                'pos',
  '/clientes':           'clientes',
  '/cuentas-por-cobrar': 'cobros',
  '/inventario':         'inventario',
  '/catalogo':           'catalogo',
  '/reportes':           'reportes',
  '/equipo':             'equipo',
  '/empleados':          'equipo',
  '/comisiones':         'comisiones',
  '/usuarios':           'usuarios',
  '/sucursales':         'sucursales',
  '/ajustes':            'usuarios',
  '/auditoria':          'auditoria',
};

/** Devuelve true si el usuario puede ver la ruta dada. */
export function puedeVer(modulos: string[] | undefined, ruta: string): boolean {
  if (!modulos) return false;
  const modulo = RUTA_MODULO[ruta];
  if (!modulo) return true; // rutas no mapeadas (sin-acceso, etc.) no tienen restricción
  return modulos.includes(modulo);
}

const ORDEN_RUTAS = [
  '/dashboard',
  '/agenda',
  '/pos',
  '/clientes',
  '/cuentas-por-cobrar',
  '/inventario',
  '/catalogo',
  '/reportes',
  '/equipo',
  '/comisiones',
  '/usuarios',
  '/sucursales',
];

/** Devuelve la primera ruta a la que el usuario tiene acceso. */
export function rutaInicial(modulos: string[]): string {
  for (const ruta of ORDEN_RUTAS) {
    if (puedeVer(modulos, ruta)) return ruta;
  }
  return '/agenda'; // fallback absoluto (nunca debería ocurrir)
}