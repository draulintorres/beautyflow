# Estixa

SaaS multi-tenant de gestión para salones de belleza, barberías y negocios
similares (agenda, POS/caja, clientes, inventario, comisiones, portal del
cliente, panel de SuperAdmin). Backend en NestJS + Prisma/PostgreSQL,
frontend en React + Vite.

Este repositorio es para **clonar y levantar en tu propia máquina** — todavía
no hay un despliegue en vivo compartido.

## Estructura

```
backend/           API NestJS + Prisma (puerto 3000)
beautyflow-web/     Frontend React + Vite (puerto 5173 en dev, 4173 en preview)
```

## Requisitos

- Node.js 18 LTS o superior
- PostgreSQL 14 o superior (local, o cualquier instancia a la que tengas acceso)
- npm

## 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edita `.env` con tus propios valores:

- `DATABASE_URL` — tu conexión a Postgres (crea la base de datos vacía antes,
  ej. `createdb estixa`).
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_SUPERADMIN_SECRET` — pon
  cualquier string largo distinto en cada uno (ej. `openssl rand -hex 32`).
- El resto de las variables ya tienen valores por defecto razonables para
  desarrollo local — ver la sección **Qué no vas a tener funcionando de
  entrada** más abajo antes de asumir que algo está roto.

Luego:

```bash
npx prisma migrate dev
npm run db:seed              # datos demo — empresa, usuario dueño, servicios, clientes
npm run start:dev            # API en http://localhost:3000/api/v1
```

Datos demo del seed (una sola empresa ficticia, "Beauty Glam", con datos de
ejemplo — no es un cliente real):

- Empresa: `beauty-glam`
- Login: `owner@beautyglam.do` / `Password123`

Opcional — más datos de ejemplo para probar el Portal del Cliente (puntos,
membresía, historial de compras) sobre la misma clienta demo "Ana Perez":

```bash
npx ts-node prisma/seed-portal-ana.ts
```

## 2. Frontend

En otra terminal:

```bash
cd beautyflow-web
npm install
cp .env.example .env.local
npm run dev                  # http://localhost:5173
```

`.env.local` ya apunta por defecto a `http://localhost:3000/api/v1` — no
hace falta tocarlo si el backend corre en el puerto por defecto.

## 3. Entrar

Abre `http://localhost:5173/login` y entra con las credenciales demo de
arriba. También existen `/admin/login` (panel de SuperAdmin — ver
credenciales en `backend/prisma/seed-superadmin.ts`, hay que correr ese seed
aparte con `npx ts-node prisma/seed-superadmin.ts` si lo quieres probar) y
`/portal/login` (Portal del Cliente).

## Qué NO vas a tener funcionando de entrada

Esto es esperado, no son bugs:

- **Correos reales** (reseteo de contraseña, etc.): sin una `RESEND_API_KEY`
  propia (gratis en [resend.com](https://resend.com)) en tu `.env`, el envío
  de correos falla silenciosamente — la app sigue funcionando igual (el
  endpoint de "olvidé mi contraseña" responde bien y en modo desarrollo
  devuelve un `devToken` en la respuesta para poder probar el flujo sin
  correo real).
- **Login biométrico (huella/Face ID)**: WebAuthn ata cada credencial al
  dominio exacto (`WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN`) donde se activó. Los
  valores por defecto del `.env.example` apuntan a
  `http://localhost:4173` (el resultado de `npm run preview` del frontend,
  no `npm run dev`) — si pruebas en `localhost:5173` (modo dev) no va a
  coincidir. Para probar biometría: usa `npm run build && npm run preview`
  en el frontend en vez de `npm run dev`.
- **Probar desde el celular**: por defecto el frontend solo escucha en tu
  red local. Si quieres exponerlo por internet (ej. con
  [ngrok](https://ngrok.com)) para probar en un teléfono real, corre el
  preview con `NGROK_MODE=true npx vite preview` (ver el comentario en
  `vite.config.ts`) y actualiza `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN`/
  `FRONTEND_URL` en el backend a la URL de tu túnel mientras dure la prueba.

## Comandos útiles

| Comando | Dónde | Qué hace |
|---|---|---|
| `npm run start:dev` | `backend/` | API con recarga automática |
| `npx prisma studio` | `backend/` | Explorador visual de la base de datos |
| `npm run dev` | `beautyflow-web/` | Frontend con recarga automática |
| `npm run build` | `beautyflow-web/` | Build de producción |
| `npx tsc --noEmit` | ambos | Chequeo de tipos sin generar archivos |
