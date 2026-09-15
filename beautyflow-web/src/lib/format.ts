const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

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
