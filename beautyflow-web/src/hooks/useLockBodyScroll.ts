import { useLayoutEffect } from 'react';

/**
 * Bloquea el scroll del body mientras un modal/hoja (overlay position:fixed)
 * está abierto. Sin esto, en iOS Safari la página de atrás puede seguir
 * scrolleando detrás del overlay fijo, lo que desalinea el viewport visual
 * y corta visualmente la parte superior del modal (barra de progreso,
 * título) detrás de la barra de direcciones.
 *
 * Llamar incondicionalmente en el componente del modal (se monta solo
 * cuando el modal está abierto, así que el lock/unlock sigue su ciclo
 * de vida automáticamente).
 */
export function useLockBodyScroll() {
  useLayoutEffect(() => {
    const { overflow, position, top, width } = document.body.style;
    const scrollY = window.scrollY;

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      document.body.style.overflow = overflow;
      document.body.style.position = position;
      document.body.style.top = top;
      document.body.style.width = width;
      window.scrollTo(0, scrollY);
    };
  }, []);
}
