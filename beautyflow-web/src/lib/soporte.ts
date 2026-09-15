// Número de WhatsApp de soporte de Estixa (RD, código de país +1).
const NUMERO_SOPORTE = '18492606783';

export function linkWhatsAppSoporte(mensaje: string): string {
  return `https://wa.me/${NUMERO_SOPORTE}?text=${encodeURIComponent(mensaje)}`;
}
