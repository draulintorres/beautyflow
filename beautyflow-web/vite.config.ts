import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Activa el proxy/allowedHosts de ngrok (ver bloque `preview` más abajo)
// solo cuando se pide explícitamente — así el comportamiento por defecto
// del proyecto (clonarlo y levantarlo en local) no depende de nada de
// ngrok. Uso: NGROK_MODE=true npx vite preview
const ngrokMode = process.env.NGROK_MODE === 'true';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' + registro manual vía virtual:pwa-register/react
      // (src/components/UpdatePrompt.tsx) en vez del script mínimo
      // auto-inyectado (que solo hacía un register() una vez al cargar,
      // sin detectar actualizaciones mientras la app seguía abierta —
      // eso causaba que un build nuevo necesitara DOS reaperturas para
      // verse, confirmado con prueba real).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Estixa Business',
        short_name: 'Estixa',
        description: 'Gestión profesional para salones y barberías',
        start_url: '/dashboard',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0a0b',
        theme_color: '#0a0a0b',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // OJO: `navigateFallback` explícitamente en `undefined` — no basta
        // con omitirlo. vite-plugin-pwa trae `navigateFallback: 'index.html'`
        // como default PROPIO (no de Workbox) y lo mezcla con este objeto
        // vía `Object.assign`, así que si no se sobreescribe explícitamente
        // queda activo igual. Y workbox-build compila ese `navigateFallback`
        // como la PRIMERA `registerRoute` del `sw.js` generado — antes que
        // cualquier entrada de `runtimeCaching` — así que cualquier
        // estrategia puesta ahí para navegación NUNCA se alcanza mientras
        // `navigateFallback` siga activo (el router de Workbox usa la
        // PRIMERA ruta que haga match; confirmado inspeccionando el
        // `dist/sw.js` real generado — un primer intento de este fix solo
        // agregando la entrada de `runtimeCaching` sin desactivar
        // `navigateFallback` resultó ser inerte, no arreglaba nada).
        // `navigateFallback` sirve el `index.html` directo desde el
        // precache del service worker YA instalado, sin intentar la red —
        // así que un enlace nuevo (correo de reseteo, WhatsApp, un link
        // compartido) abierto en una pestaña/navegador con un SW viejo ya
        // activo carga el shell VIEJO (marca vieja, rutas viejas) sin
        // darle chance al servidor de responder con la versión real.
        // Confirmado como causa real: un enlace de /reset-password abierto
        // así redirigía a login porque el SW viejo ni conocía esa ruta. La
        // navegación/documento principal se maneja en cambio abajo, en
        // `runtimeCaching`, con NetworkFirst.
        navigateFallback: undefined,
        // Sin esto (default: false) el service worker NUEVO se activa al
        // recibir SKIP_WAITING (clic en "Actualizar ahora" en
        // UpdatePrompt.tsx) pero NUNCA toma control de la pestaña que ya
        // estaba abierta — solo controla navegaciones FUTURAS. Como
        // vite-plugin-pwa solo dispara el reload automático cuando el
        // navegador avisa que el controlador de ESTA pestaña cambió
        // (evento 'controllerchange'), sin clientsClaim ese aviso nunca
        // llega: el clic en "Actualizar ahora" no hacía nada visible y la
        // pestaña seguía en la versión vieja indefinidamente — confirmado
        // como la causa real de que ni recargar (F5) trajera la versión
        // nueva. skipWaiting() sigue ocurriendo SOLO cuando el usuario
        // hace clic (ver el listener de mensajes más abajo), así que esto
        // no cambia en nada que la actualización siga esperando su
        // confirmación — solo hace que, una vez confirmada, se note.
        clientsClaim: true,
        runtimeCaching: [
          // Navegación (documento principal / rutas de SPA): red primero,
          // con límite de tiempo, y solo cae al caché de esta estrategia
          // si no hay conexión — ese caché se llena solo, en la primera
          // navegación exitosa online (que siempre ocurre, porque instalar
          // el service worker ya requirió estar online).
          {
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' && !url.pathname.startsWith('/api'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell-pages',
              networkTimeoutSeconds: 4,
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: { enabled: false }, // SW solo activo en build de producción
    }),
  ],
  server: {
    port: 5173,
    strictPort: false,
  },
  // Prueba móvil vía ngrok con 1 solo túnel (cuenta free de ngrok solo
  // permite 1 endpoint público a la vez): reenvía /api al backend local
  // para que frontend y API compartan la misma URL pública. Se activa
  // solo con NGROK_MODE=true (ver arriba) — no es el comportamiento por
  // defecto de `vite preview`.
  preview: {
    port: 4173,
    ...(ngrokMode && {
      allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app'],
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    }),
  },
})
