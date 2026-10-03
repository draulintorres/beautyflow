export const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function mesCorto(yyyyMM: string): string {
  const idx = parseInt(yyyyMM.split('-')[1]) - 1;
  return MESES_CORTOS[idx] ?? yyyyMM;
}

export function initiales(nombre: string): string {
  return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/** Máscara de teléfono dominicano 3-3-4 (ej. "809-313-6783") mientras se escribe. */
export function fmtTelefono(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}
