import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useAuthStore } from '../store/auth';
import { useSAAuthStore } from '../store/saAuth';
import { usePortalAuth } from '../store/portalAuth';
import styles from './UpdatePrompt.module.css';

/** Store con el shape que expone el middleware `persist` de Zustand
 * (`store.persist.hasHydrated()` / `.onFinishHydration()`), sin acoplarse
 * al tipo de estado interno de cada store. */
interface StoreConPersist {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (listener: () => void) => () => void;
  };
}

/** true recién cuando `store` terminó de leer lo guardado en
 * localStorage/sessionStorage — antes de eso, el estado en memoria es solo
 * el default inicial (`isAuthenticated: false`), que NO dice nada todavía
 * sobre si hay o no una sesión real. Los 3 stores de auth de esta app usan
 * storages síncronos (`localStorage`/`sessionStorage` directo, sin
 * IndexedDB ni nada async), así que en la práctica esto ya es `true` desde
 * el primer render — pero lo chequeamos explícito en vez de asumirlo, para
 * no depender de que eso siga siendo cierto para siempre. */
function useHidratado(store: StoreConPersist): boolean {
  const [hidratado, setHidratado] = useState(store.persist.hasHydrated());
  useEffect(() => {
    if (hidratado) return;
    return store.persist.onFinishHydration(() => setHidratado(true));
  }, [hidratado, store]);
  return hidratado;
}

/** true solo cuando los 3 stores de auth (tenant, super-admin, portal)
 * terminaron de hidratarse — nunca decidir "no hay sesión" antes de esto,
 * o un instante inicial con el default en falso podría disparar la
 * auto-actualización aunque SÍ haya una sesión real guardada. */
function useSesionActiva(): { listo: boolean; haySesion: boolean } {
  const tenantListo = useHidratado(useAuthStore);
  const saListo = useHidratado(useSAAuthStore);
  const portalListo = useHidratado(usePortalAuth);

  const tenantAuth = useAuthStore((s) => s.isAuthenticated);
  const saAuth = useSAAuthStore((s) => s.isAuthenticated);
  const portalToken = usePortalAuth((s) => s.accessToken);

  return {
    listo: tenantListo && saListo && portalListo,
    haySesion: tenantAuth || saAuth || !!portalToken,
  };
}

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
 * EXCEPCIÓN (2026-09-21): sin sesión activa en ninguno de los 3 stores de
 * auth (tenant/super-admin/portal) — típicamente alguien nuevo cayendo en
 * una pantalla de login con un Service Worker viejo cacheado de una visita
 * anterior (confirmado 2 veces: WhatsApp in-app browser, y un navegador de
 * escritorio) — la actualización se aplica sola, sin esperar el clic. No
 * hay nada que perder ahí, y es justo donde un tester nuevo se quedaba
 * pegado viendo rutas rotas sin saber que "borrar datos del sitio" era la
 * salida. Con sesión activa, el comportamiento de siempre no cambia en
 * nada.
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
 * `vite.config.ts` (`workbox.clientsClaim: true`).
 *
 * OJO (2026-09-21) — `clientsClaim: true` tiene un efecto secundario que no
 * es obvio a primera vista: cuando UNA pestaña activa la versión nueva, esa
 * versión toma control de TODAS las pestañas abiertas del mismo sitio, no
 * solo la que la pidió — y `vite-plugin-pwa` trae cableado un reload
 * automático e INCONDICIONAL en cada pestaña que reacciona a eso (evento
 * 'controlling' de workbox-window, por debajo `controllerchange`), sin
 * mirar para nada si esa pestaña en particular tiene una sesión activa.
 * Confirmado con una prueba real (Playwright): una pestaña con sesión
 * seteada SÍ se recargaba sola con la primera versión de este archivo,
 * disparada por una pestaña de login sin sesión actualizándose al lado —
 * el chequeo de sesión de más abajo NO alcanzaba para evitarlo, porque
 * solo decidía si ESTA pestaña pide la actualización, no si debe
 * recargarse cuando la pide OTRA. Por eso el `onNeedReload` de acá abajo:
 * es el único punto donde CADA pestaña decide, con su PROPIO estado de
 * sesión (vía `sesionRef`, no una variable capturada al montar — el
 * evento puede llegar mucho después de que cambie), si a ELLA le toca
 * recargarse o no cuando el control cambia.
 */
export function UpdatePrompt() {
  const { listo, haySesion } = useSesionActiva();
  // El callback de más abajo lo registra `useRegisterSW` una sola vez al
  // montar y puede dispararse mucho después (cuando OTRA pestaña activa la
  // actualización) — sin este ref, usaría el `listo`/`haySesion` de aquel
  // primer render (cerrado sobre el callback), ya desactualizado para
  // cuando el evento realmente llega.
  const sesionRef = useRef({ listo, haySesion });
  sesionRef.current = { listo, haySesion };

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
    // Se dispara cuando el service worker nuevo YA tomó control de ESTA
    // pestaña — sin importar en cuál pestaña se originó la actualización
    // (ver nota de arriba). Sin sesión: recargar ya, es el caso sano que
    // se quiere arreglar. Con sesión activa (o mientras los stores
    // todavía no terminan de hidratar — nunca asumir "sin sesión" sin
    // estar seguros): NO recargar, la pestaña sigue corriendo en memoria
    // con el JS viejo hasta que la persona la recargue o navegue por su
    // cuenta, sin perder nada de lo que tenía a medio llenar.
    onNeedReload() {
      if (!sesionRef.current.listo || sesionRef.current.haySesion) return;
      window.location.reload();
    },
  });

  useEffect(() => {
    // `listo` primero: sin los 3 stores hidratados no sabemos de verdad si
    // hay sesión o no — nunca decidir con el default en falso.
    if (needRefresh && listo && !haySesion) {
      updateServiceWorker(true);
    }
  }, [needRefresh, listo, haySesion, updateServiceWorker]);

  if (!needRefresh) return null;
  // Sin sesión: se auto-actualiza por el efecto de arriba (o todavía se
  // está determinando si hay sesión) — en ambos casos, sin banner.
  if (!listo || !haySesion) return null;

  return (
    <div className={styles.banner}>
      <span>Hay una nueva versión de Estixa disponible.</span>
      <button
        onClick={async () => {
          // No depender de que siga habiendo un worker "esperando" para
          // este momento — si otra pestaña sin sesión ya lo consumió en
          // segundo plano (el nuevo SW ya está activo, solo no recargó
          // esta pestaña por tener sesión), `updateServiceWorker` no
          // tendría nada que hacer. El clic es un pedido explícito de la
          // persona: recargar siempre, sea cual sea el estado del SW.
          await updateServiceWorker(true);
          window.location.reload();
        }}
      >
        Actualizar ahora
      </button>
    </div>
  );
}
