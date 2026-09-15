import { PlanType, RoleKey } from '@prisma/client';

export const MODULOS = [
  'dashboard',
  'agenda',
  'pos',
  'clientes',
  'cobros',
  'inventario',
  'catalogo',
  'reportes',
  'equipo',
  'comisiones',
  'usuarios',
  'sucursales',
  'auditoria',
] as const;

export type Modulo = (typeof MODULOS)[number];

/** Siempre activos — ningún plan los apaga. */
export const MODULOS_BASE: Modulo[] = [
  'dashboard', 'agenda', 'pos', 'clientes', 'catalogo', 'equipo', 'usuarios',
  // 'auditoria' es base (no depende del plan) pero NO es de nadie por
  // default — solo entra en MATRIZ[OWNER] más abajo, así que la
  // intersección MATRIZ[rol] ∩ disponibles la deja fuera para todos los
  // demás roles automáticamente.
  'auditoria',
];

/** Controlados por plan — se leen de modulos_activos por empresa. */
export const MODULOS_GATEABLES: Modulo[] = [
  'cobros', 'inventario', 'reportes', 'comisiones', 'sucursales',
];

/**
 * Qué gateables incluye cada plan (los base nunca aparecen aquí). Mapa de
 * negocio aprobado — cobros/comisiones/inventario en TODOS los planes;
 * reportes desde PRO; sucursales solo TRIAL (de prueba) y ENTERPRISE.
 */
export const MODULOS_POR_PLAN: Record<PlanType, Modulo[]> = {
  [PlanType.TRIAL]:      ['cobros', 'comisiones', 'inventario', 'reportes', 'sucursales'],
  [PlanType.BASIC]:      ['cobros', 'comisiones', 'inventario'],
  [PlanType.PRO]:        ['cobros', 'comisiones', 'inventario', 'reportes'],
  [PlanType.ENTERPRISE]: ['cobros', 'comisiones', 'inventario', 'reportes', 'sucursales'],
};

export const MATRIZ: Record<RoleKey, Modulo[]> = {
  [RoleKey.OWNER]: [...MODULOS],
  // Auditoría es exclusiva del OWNER (mismo criterio que la sección
  // Seguridad de Ajustes — el candado de PIN): ni siquiera ADMIN la ve,
  // aunque ADMIN por lo demás espeja la lista completa de OWNER.
  [RoleKey.ADMIN]: MODULOS.filter((m) => m !== 'auditoria'),
  [RoleKey.MANAGER]: [
    'dashboard', 'agenda', 'pos', 'clientes', 'cobros',
    'inventario', 'catalogo', 'reportes', 'equipo',
  ],
  [RoleKey.CASHIER]:     ['dashboard', 'agenda', 'pos', 'clientes', 'cobros'],
  [RoleKey.RECEPCION]:   ['dashboard', 'agenda', 'clientes'],
  [RoleKey.BARBERO]:     ['agenda'],
  [RoleKey.ESTILISTA]:   ['agenda'],
  [RoleKey.MANICURISTA]: ['agenda'],
  [RoleKey.ESTETICISTA]: ['agenda'],
  [RoleKey.MASAJISTA]:   ['agenda'],
  // Inquilino de silla (Fase B2). Pieza 3 fuerza en el backend que agenda/
  // pos/cobros muestren SOLO lo del inquilino (clientes sigue compartido
  // por decisión). Sin dashboard: sus KPIs son del NEGOCIO completo (ventas
  // totales, top empleados, etc.), no de un inquilino — su rutaInicial cae
  // en 'agenda'. Sin reportes, equipo, comisiones ni inventario tampoco.
  [RoleKey.ALQUILER]:    ['agenda', 'pos', 'clientes', 'cobros'],
};

export function modulosDeRol(rol: RoleKey): Modulo[] {
  return MATRIZ[rol] ?? [];
}

/**
 * True si el rol tiene AL MENOS UNO de los módulos indicados.
 * OWNER siempre devuelve true (omnipotente dentro de su empresa).
 */
export function puedeVerModulo(rol: RoleKey, ...modulos: Modulo[]): boolean {
  if (rol === RoleKey.OWNER) return true;
  const permitidos = new Set<string>(MATRIZ[rol] ?? []);
  return modulos.some((m) => permitidos.has(m));
}