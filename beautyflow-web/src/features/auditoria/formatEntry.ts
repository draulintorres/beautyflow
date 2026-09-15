import { formatMoney } from '../../lib/format';

export interface AuditItem {
  id: string;
  usuarioId: string | null;
  usuarioNombre: string;
  modulo: string;
  entidad: string;
  entidadId: string | null;
  accion: string;
  datosAntes: any;
  datosDespues: any;
  createdAt: string;
}

/** Módulos conocidos — para el filtro y para el chip de cada fila. */
export const MODULOS_AUDITORIA: { value: string; label: string }[] = [
  { value: 'POS', label: 'Caja / POS' },
  { value: 'AGENDA', label: 'Agenda' },
  { value: 'CAJA', label: 'Caja (apertura/cierre)' },
  { value: 'COMISIONES', label: 'Comisiones' },
  { value: 'USUARIOS', label: 'Usuarios' },
  { value: 'EQUIPO', label: 'Equipo' },
  { value: 'CONFIG', label: 'Configuración' },
  { value: 'CATALOGO', label: 'Catálogo' },
  { value: 'INVENTARIO', label: 'Inventario' },
];

/**
 * Acciones conocidas — para el filtro. Agrupadas por tema (`grupo`) para
 * que el desplegable no sea una lista plana de 18 ítems difícil de leer —
 * el <select> las renderiza en <optgroup>.
 */
export const ACCIONES_AUDITORIA: { value: string; label: string; grupo: string }[] = [
  { value: 'CREATE', label: 'Creación de venta', grupo: 'Ventas y caja' },
  { value: 'CREATE_FROM_CITA', label: 'Facturación desde cita', grupo: 'Ventas y caja' },
  { value: 'ABONO', label: 'Abono', grupo: 'Ventas y caja' },
  { value: 'VOID', label: 'Anulación de venta', grupo: 'Ventas y caja' },
  { value: 'OPEN', label: 'Apertura de caja', grupo: 'Ventas y caja' },
  { value: 'CLOSE', label: 'Cierre de caja', grupo: 'Ventas y caja' },
  { value: 'CANCEL', label: 'Cancelación de cita', grupo: 'Agenda' },
  { value: 'RESCHEDULE', label: 'Reprogramación de cita', grupo: 'Agenda' },
  { value: 'SETTLE', label: 'Cierre de corte', grupo: 'Comisiones' },
  { value: 'PAY', label: 'Pago de liquidación', grupo: 'Comisiones' },
  { value: 'CHANGE_ROLE', label: 'Cambio de rol', grupo: 'Usuarios y equipo' },
  { value: 'ACTIVATE', label: 'Activación de usuario', grupo: 'Usuarios y equipo' },
  { value: 'DEACTIVATE', label: 'Desactivación de usuario', grupo: 'Usuarios y equipo' },
  { value: 'RESET_PASSWORD', label: 'Reseteo de contraseña', grupo: 'Usuarios y equipo' },
  { value: 'ADJUST', label: 'Ajuste de inventario', grupo: 'Catálogo e inventario' },
  { value: 'TRANSFER', label: 'Transferencia de inventario', grupo: 'Catálogo e inventario' },
  { value: 'PRICE_CHANGE', label: 'Cambio de precio', grupo: 'Catálogo e inventario' },
  { value: 'UPDATE', label: 'Edición / configuración', grupo: 'General' },
];

/** `ACCIONES_AUDITORIA` agrupado en el orden de aparición — listo para <optgroup>. */
export const ACCIONES_AGRUPADAS: { grupo: string; opciones: typeof ACCIONES_AUDITORIA }[] = (() => {
  const orden: string[] = [];
  const porGrupo = new Map<string, typeof ACCIONES_AUDITORIA>();
  for (const a of ACCIONES_AUDITORIA) {
    if (!porGrupo.has(a.grupo)) { porGrupo.set(a.grupo, []); orden.push(a.grupo); }
    porGrupo.get(a.grupo)!.push(a);
  }
  return orden.map((grupo) => ({ grupo, opciones: porGrupo.get(grupo)! }));
})();

// Solo para mostrar la etiqueta corta de la acción en el chip de cada fila
// (ahí no interesa el nombre largo "Creación de venta", solo "Creación").
const ACCION_LABEL_CORTA: Record<string, string> = {
  CREATE: 'Creación', UPDATE: 'Edición', CHANGE_ROLE: 'Cambio de rol', VOID: 'Anulación',
  CANCEL: 'Cancelación', RESCHEDULE: 'Reprogramación', ABONO: 'Abono',
  CREATE_FROM_CITA: 'Facturación', SETTLE: 'Cierre de corte', PAY: 'Pago',
  OPEN: 'Apertura', CLOSE: 'Cierre', ACTIVATE: 'Activación', DEACTIVATE: 'Desactivación',
  RESET_PASSWORD: 'Reseteo de clave', ADJUST: 'Ajuste', TRANSFER: 'Transferencia',
  PRICE_CHANGE: 'Cambio de precio',
};
const MODULO_LABEL = new Map(MODULOS_AUDITORIA.map((m) => [m.value, m.label]));

export function moduloLabel(modulo: string): string {
  return MODULO_LABEL.get(modulo) ?? modulo;
}
export function accionLabel(accion: string): string {
  return ACCION_LABEL_CORTA[accion] ?? accion;
}

const money = (v: unknown) => `RD$ ${formatMoney(Number(v ?? 0))}`;
// Para montos que pueden faltar en entradas viejas (ej. VOID antes de que se
// empezara a guardar el total) — mostrar "monto no registrado" es honesto;
// mostrar "RD$ 0.00" sugeriría (falsamente) que la venta no valía nada.
const moneyOpt = (v: unknown) => (v === undefined || v === null ? 'monto no registrado' : money(v));
const numero = (n: unknown) => (n !== undefined && n !== null ? `#${String(n).padStart(5, '0')}` : '');

/**
 * Convierte una fila de auditoría en una oración legible en español ("quién
 * hizo qué, sobre qué") — es lo que se ve en la lista, sin abrir el detalle.
 */
export function formatTitulo(item: AuditItem): string {
  const d = item.datosDespues ?? {};
  const a = item.datosAntes ?? {};
  const key = `${item.entidad}:${item.accion}`;

  switch (key) {
    case 'Venta:CREATE':
      return `Creó la factura ${numero(d.numero)} por ${money(d.total)}`;
    case 'Venta:CREATE_FROM_CITA':
      return `Facturó una cita por ${money(d.total)}`;
    case 'Venta:VOID':
      return `Anuló la factura ${numero(a.numero)} por ${moneyOpt(a.total)}`;
    case 'Venta:ABONO':
      return `Registró un abono de ${money(d.monto)} en la factura ${numero(d.numero)}`;
    case 'Cita:CREATE':
      return 'Creó una cita';
    case 'Cita:CANCEL':
      return 'Canceló una cita';
    case 'Cita:RESCHEDULE':
      return 'Reprogramó una cita';
    case 'LiquidacionComision:SETTLE':
      return `Cerró el corte de comisiones de ${d.empleadoNombre ?? 'un empleado'} (${money(d.totalPagar)})`;
    case 'LiquidacionComision:PAY':
      return `Marcó como pagada la liquidación de ${d.empleadoNombre ?? 'un empleado'} (${money(d.totalPagar)})`;
    case 'LiquidacionComision:VOID':
      return `Anuló la liquidación de ${d.empleadoNombre ?? 'un empleado'}`;
    case 'AperturaCaja:OPEN':
      return `Abrió ${d.cajaNombre ?? 'una caja'} con fondo ${money(d.montoInicial)}`;
    case 'AperturaCaja:CLOSE':
      return `Cerró ${d.cajaNombre ?? 'una caja'}${
        d.diferencia ? ` — diferencia ${money(d.diferencia)}` : ' — cuadró exacto'
      }`;
    case 'Usuario:CREATE':
      return `Creó el usuario ${d.nombre ?? ''} (${d.email ?? ''})`;
    case 'Usuario:UPDATE':
      return `Editó al usuario ${d.nombre ?? a.nombre ?? ''}`;
    case 'Usuario:CHANGE_ROLE':
      return `Cambió el rol de ${a.nombre ?? ''}: ${a.rol ?? '—'} → ${d.rol ?? '—'}`;
    case 'Usuario:ACTIVATE':
      return `Activó a ${d.nombre ?? ''}`;
    case 'Usuario:DEACTIVATE':
      return `Desactivó a ${d.nombre ?? ''}`;
    case 'Usuario:RESET_PASSWORD':
      return `Reseteó la contraseña de ${d.nombre ?? ''}`;
    case 'ComisionConfig:UPDATE':
      return `Actualizó la comisión de ${d.empleadoNombre ?? 'un empleado'}`;
    case 'AlquilerConfig:UPDATE':
      return `Actualizó la configuración de alquiler de ${d.empleadoNombre ?? 'un empleado'}`;
    case 'Empresa:UPDATE':
      return d.pinAnulacionCambiado
        ? 'Actualizó la configuración del negocio (incluye el PIN de anulación)'
        : 'Actualizó la configuración del negocio';
    case 'Servicio:PRICE_CHANGE':
      return `Cambió el precio de un servicio: ${money(a.precio)} → ${money(d.precio)}`;
    case 'Producto:ADJUST':
      return `Ajustó el inventario de un producto (${d.ajuste > 0 ? '+' : ''}${d.ajuste})`;
    case 'Transferencia:TRANSFER':
      return `Transfirió inventario entre sucursales (${d.items?.length ?? 0} ítem(s))`;
    default:
      return `${accionLabel(item.accion)} · ${item.entidad}`;
  }
}

/** Pares clave/valor legibles para el detalle expandible de una fila. */
export function formatDetalle(item: AuditItem): { label: string; value: string }[] {
  const d = item.datosDespues ?? {};
  const a = item.datosAntes ?? {};
  const rows: { label: string; value: string }[] = [];

  const push = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    rows.push({ label, value: String(value) });
  };

  switch (`${item.entidad}:${item.accion}`) {
    case 'Venta:VOID':
      push('Factura', numero(a.numero));
      push('Monto de la venta', moneyOpt(a.total));
      push('Estado anterior', a.estado);
      push('Motivo de anulación', d.motivo);
      break;
    case 'Venta:CREATE':
      push('Factura', numero(d.numero));
      push('Total', money(d.total));
      push('Estado', d.estado);
      push('Saldo', d.saldo !== undefined ? money(d.saldo) : undefined);
      break;
    case 'Venta:ABONO':
      push('Factura', numero(d.numero));
      push('Monto abonado', money(d.monto));
      push('Saldo anterior', a.saldo !== undefined ? money(a.saldo) : undefined);
      push('Saldo nuevo', money(d.saldoNuevo));
      push('Estado resultante', d.estado);
      break;
    case 'AperturaCaja:CLOSE':
      push('Caja', d.cajaNombre);
      push('Efectivo esperado', money(d.efectivoEsperado));
      push('Efectivo contado', money(d.efectivoContado));
      push('Diferencia', money(d.diferencia));
      push('Total facturado', money(d.totalFacturado));
      push('Cantidad de ventas', d.numVentas);
      break;
    case 'AperturaCaja:OPEN':
      push('Caja', d.cajaNombre);
      push('Fondo inicial', money(d.montoInicial));
      break;
    case 'Usuario:CHANGE_ROLE':
      push('Rol anterior', a.rol);
      push('Rol nuevo', d.rol);
      break;
    case 'LiquidacionComision:SETTLE':
      push('Empleado', d.empleadoNombre);
      push('Período', d.periodoIni && d.periodoFin ? `${d.periodoIni} — ${d.periodoFin}` : undefined);
      push('Total a pagar', money(d.totalPagar));
      push('Líneas incluidas', d.cantidadLineas);
      push('Nota', d.nota);
      break;
    case 'LiquidacionComision:PAY':
    case 'LiquidacionComision:VOID':
      push('Empleado', d.empleadoNombre);
      push('Total', money(d.totalPagar ?? a.totalPagar));
      break;
    default:
      // Fallback genérico: mostrar los campos tal cual, sin volcar JSON crudo.
      for (const [k, v] of Object.entries(d)) {
        if (v !== null && typeof v === 'object') continue; // evita anidados feos
        push(k, v);
      }
  }
  return rows;
}
