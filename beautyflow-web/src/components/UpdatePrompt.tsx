import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './UpdatePrompt.module.css';

/**
 * Aviso de "nueva versión disponible" para la PWA.
 *
 * Por qué existe: el navegador solo revisa si hay un sw.js nuevo al
 * navegar — y esa revisión corre en paralelo a la carga que ya está en
 * curso, así que la PRIMERA reapertura después de publicar un cambio
 * sigue mostrando la versión vieja (servida por el SW anterior, que
 * todavía controla esa carga); recién la SEGUNDA reapertura muestra lo
 * nuevo. Sin este aviso, cada corrección "no se ve" hasta la segunda vez
 * que el usuario abre la app, lo cual parecía (incorrectamente) que el
 * fix no había funcionado.
 *
 * La solución: en vez de recargar solo, mostramos un aviso — así el
 * usuario no pierde una venta/formulario a medio llenar por un reload
 * inesperado en segundo plano. El usuario decide cuándo hacer clic en
 * "Actualizar ahora".
 *
 * IMPORTANTE (2026-09-14): hasta esta fecha, `clientsClaim` NUNCA estuvo
 * activado en `vite.config.ts` (default de Workbox: false) — el service
 * worker nuevo se activaba al recibir el clic en "Actualizar ahora" pero
 * jamás tomaba control de la pestaña ya abierta, así que el reload
 * automático de más abajo (disparado por el evento 'controllerchange' de
 * `workbox-window`) nunca llegaba a ocurrir: el clic no hacía nada
 * visible y la pestaña se quedaba en la versión vieja para siempre, sin
 * importar cuántas veces se recargara a mano — confirmado como la causa
 * real de que ni F5 trajera la versión nueva. Ya está corregido en
 * `vite.config.ts` (`workbox.clientsClaim: true`) — sigue sin activarse
 * solo (`skipWaiting()` solo ocurre tras el mensaje que manda el clic de
 * abajo), solo hace que ese clic ahora sí se note.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Revisa si hay una versión nueva cada 60s mientras la app sigue
      // abierta — sin esto, solo se revisa al navegar/reabrir. Un timer en
      // segundo plano puede pausarse en el celular (pestaña no
      // activa/app minimizada), así que ADEMÁS se revisa cada vez que la
      // pestaña vuelve a estar visible — sin eso, alguien que dejó la app
      // abierta en segundo plano un buen rato solo se enteraría de una
      // versión nueva hasta el próximo tick de 60s, que puede tardar en
      // llegar si el navegador pausó el timer.
      setInterval(() => { registration.update(); }, 60_000);
      const alVolver = () => {
        if (document.visibilityState === 'visible') registration.update();
      };
      document.addEventListener('visibilitychange', alVolver);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className={styles.banner}>
      <span>Hay una nueva versión de Estixa disponible.</span>
      <button onClick={() => updateServiceWorker(true)}>Actualizar ahora</button>
    </div>
  );
}
