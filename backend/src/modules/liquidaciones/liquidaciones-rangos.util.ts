/**
 * Lógica pura (sin Prisma) de elegibilidad de comisiones para liquidar --
 * separada para poder probarla sin base de datos. Venta.createdAt es un
 * INSTANTE REAL; "desde"/"hasta" son fechas-calendario RD "YYYY-MM-DD"
 * que el usuario elige en el formulario de Cerrar Corte.
 */
import { rangoDiaRDReal } from '../../core/common/fecha-rd.util';

/**
 * ¿Una línea de venta (por su Venta.createdAt) es elegible para el corte
 * "hasta" esa fecha-calendario RD? El día "hasta" entra completo --
 * equivale a `createdAt < inicio real del día siguiente a "hasta"`.
 */
export function ventaElegibleParaLiquidar(ventaCreatedAt: Date, hasta: string): boolean {
  return ventaCreatedAt.getTime() < rangoDiaRDReal(hasta).lt.getTime();
}

/**
 * ¿Una línea ya elegible cuenta como "arrastre" (de antes del inicio del
 * período "desde")? Sin "desde" (preview sin filtro de inicio), nunca es
 * arrastre. NO es un filtro de exclusión -- solo marca informativamente
 * cuáles de las líneas elegibles vienen de antes del período pedido; lo
 * viejo sin liquidar sigue liquidándose igual (ver cerrarCorte(), que no
 * tiene cota inferior en absoluto).
 */
export function esLineaDeArrastre(ventaCreatedAt: Date, desde: string | undefined): boolean {
  if (!desde) return false;
  return ventaCreatedAt.getTime() < rangoDiaRDReal(desde).gte.getTime();
}
