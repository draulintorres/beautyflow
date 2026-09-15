# Estixa — API (Auth + Multi-Tenant)

Backend NestJS + Prisma. Esta entrega cubre la **Fase 2**: autenticación, JWT, refresh token, recuperación de contraseña, roles y el middleware multi-tenant con filtrado automático por `empresaId`.

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar entorno
cp .env.example .env
#    Editar DATABASE_URL y generar secrets:
#    openssl rand -hex 32   (uno para ACCESS, otro para REFRESH)

# 3. Generar cliente Prisma y migrar
npm run prisma:generate
npm run prisma:migrate

# 4. Sembrar datos demo (empresa + roles + usuario OWNER)
npm run db:seed

# 5. Arrancar
npm run start:dev
```

API en `http://localhost:3000/api/v1`.

## Arquitectura de la autenticación

```
Request
  └─ TenantMiddleware        verifica el access token, resuelve { empresaId, usuarioId, rol }
     └─ AsyncLocalStorage    propaga el contexto por toda la cadena
        └─ JwtAuthGuard      exige auth salvo @Public()
           └─ RolesGuard     verifica @Roles() (OWNER siempre pasa)
              └─ Handler      el servicio usa prisma.db (filtrado por empresaId)
```

El `empresaId` viaja **solo dentro del JWT**, nunca en el body o query. `PrismaService.db` inyecta `empresaId` y excluye soft-deletes automáticamente en cada operación, leyendo el contexto en runtime.

## Estructura JWT

```json
{
  "sub": "usuario_id",
  "empresaId": "empresa_id",
  "rol": "OWNER"
}
```

## Endpoints

### Auth
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/auth/login` | público | Login (empresaSlug + email + password) |
| POST | `/auth/refresh` | público | Rota el refresh token, emite nuevos tokens |
| POST | `/auth/forgot-password` | público | Genera token de recuperación |
| POST | `/auth/reset-password` | público | Cambia la contraseña con el token |
| POST | `/auth/logout` | sí | Revoca el refresh token |
| GET | `/auth/me` | sí | Perfil del usuario autenticado |

### Empresa (el tenant del usuario; sin :id, sale del JWT)
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/empresa` | autenticado | Datos y configuración de la empresa |
| PATCH | `/empresa` | OWNER, ADMIN | Actualiza datos, config y verticales |

### Sucursales (CRUD dentro de la empresa)
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/sucursales` | autenticado | Lista (principal primero) |
| GET | `/sucursales/:id` | autenticado | Detalle |
| POST | `/sucursales` | OWNER, ADMIN | Crear |
| PATCH | `/sucursales/:id` | OWNER, ADMIN | Actualizar |
| DELETE | `/sucursales/:id` | OWNER, ADMIN | Eliminar (soft delete) |

### Usuarios
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/usuarios` | OWNER, ADMIN | Lista |
| GET | `/usuarios/:id` | OWNER, ADMIN | Detalle |
| POST | `/usuarios` | OWNER, ADMIN | Crear (password temporal si se omite) |
| PATCH | `/usuarios/:id` | OWNER, ADMIN | Actualizar nombre/teléfono/rol |
| PATCH | `/usuarios/:id/activar` | OWNER, ADMIN | Activar |
| PATCH | `/usuarios/:id/desactivar` | OWNER, ADMIN | Desactivar + revocar sesiones |
| PATCH | `/usuarios/:id/reset-password` | OWNER, ADMIN | Reset (temporal si se omite) |

### Empleados
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/empleados` | autenticado | Lista |
| GET | `/empleados/:id` | autenticado | Detalle (con especialidades, horarios, comisiones) |
| POST | `/empleados` | OWNER, ADMIN, MANAGER | Crear |
| PATCH | `/empleados/:id` | OWNER, ADMIN, MANAGER | Actualizar (incluye vacaciones) |
| DELETE | `/empleados/:id` | OWNER, ADMIN | Eliminar (soft delete) |
| GET | `/empleados/:id/disponibilidad?fecha=YYYY-MM-DD` | autenticado | **Huecos libres del día** |
| GET/PUT | `/empleados/:id/especialidades` | — / MANAGER+ | Servicios que ejecuta |
| PUT | `/empleados/:id/horarios` | MANAGER+ | Horario semanal |
| GET/POST | `/empleados/:id/bloqueos` | — / RECEPCION+ | Almuerzo, vacaciones, etc. |
| DELETE | `/empleados/:id/bloqueos/:bloqueoId` | RECEPCION+ | Eliminar bloqueo |
| GET/PUT | `/empleados/:id/comisiones` | MANAGER / OWNER-ADMIN | Configuración de comisiones |

### Catálogo — Categorías
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/categorias` | autenticado | Lista (por orden) |
| GET | `/categorias/:id` | autenticado | Detalle |
| POST | `/categorias` | OWNER, ADMIN, MANAGER | Crear |
| PATCH | `/categorias/:id` | OWNER, ADMIN, MANAGER | Actualizar |
| DELETE | `/categorias/:id` | OWNER, ADMIN | Eliminar (bloquea si tiene servicios) |

### Catálogo — Servicios
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/servicios?categoriaId=&vertical=&activo=` | autenticado | Lista filtrable |
| GET | `/servicios/:id` | autenticado | Detalle |
| POST | `/servicios` | OWNER, ADMIN, MANAGER | Crear |
| PATCH | `/servicios/:id` | OWNER, ADMIN, MANAGER | Actualizar |
| DELETE | `/servicios/:id` | OWNER, ADMIN | Eliminar (soft delete) |

### Catálogo — Paquetes (combos)
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/paquetes` | autenticado | Lista (con ahorro calculado) |
| GET | `/paquetes/:id` | autenticado | Detalle |
| POST | `/paquetes` | OWNER, ADMIN, MANAGER | Crear (ej. "Combo Novia") |
| PATCH | `/paquetes/:id` | OWNER, ADMIN, MANAGER | Actualizar |
| DELETE | `/paquetes/:id` | OWNER, ADMIN | Eliminar (soft delete) |

### Agenda — Citas
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/citas?fecha=YYYY-MM-DD[&empleadoId=]` | autenticado | Agenda del día |
| GET | `/citas/:id` | autenticado | Detalle |
| POST | `/citas` | OWNER…CASHIER | Crear (anti-solapamiento + cabina) |
| PATCH | `/citas/:id/estado` | OWNER…CASHIER | Cambiar estado (transiciones válidas) |
| PATCH | `/citas/:id/cancelar` | OWNER…CASHIER | Cancelar |
| PATCH | `/citas/:id/reprogramar` | OWNER…CASHIER | Reprogramar (revalida solapamiento) |

Estados (español): `PENDIENTE · CONFIRMADA · EN_PROCESO · FINALIZADA · CANCELADA · NO_ASISTIO`.
Transiciones: PENDIENTE→CONFIRMADA/EN_PROCESO/CANCELADA/NO_ASISTIO · CONFIRMADA→EN_PROCESO/CANCELADA/NO_ASISTIO · EN_PROCESO→FINALIZADA/CANCELADA. FINALIZADA/CANCELADA/NO_ASISTIO son terminales.

### Cabinas (salas para servicios que requieren cabina)
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/cabinas?sucursalId=` | autenticado | Lista |
| POST | `/cabinas` | OWNER, ADMIN, MANAGER | Crear |
| PATCH | `/cabinas/:id` | OWNER, ADMIN, MANAGER | Actualizar |
| DELETE | `/cabinas/:id` | OWNER, ADMIN | Eliminar |

### Clientes (CRM)
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/clientes?q=&etiqueta=&activo=` | autenticado | Lista (búsqueda + filtro etiqueta) |
| GET | `/clientes/:id` | autenticado | Detalle (con etiquetas y gasto) |
| GET | `/clientes/:id/citas` | autenticado | Historial de citas |
| GET | `/clientes/:id/compras` | autenticado | Historial de compras/facturas |
| GET | `/clientes/:id/balance` | autenticado | Crédito, deuda y disponible |
| POST | `/clientes` | OWNER…CASHIER | Crear |
| PATCH | `/clientes/:id` | OWNER…CASHIER | Actualizar |
| DELETE | `/clientes/:id` | OWNER, ADMIN | Eliminar (soft delete) |

Etiquetas dinámicas (calculadas, no almacenadas): `NUEVO` (<30 días) · `FRECUENTE` (≥ umbral de visitas) · `VIP` (gasto ≥ umbral empresa) · `MOROSO` (balance > 0) · `CUMPLEANOS` (cumple este mes). Filtrar con `?etiqueta=MOROSO`.

### POS — Facturación
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/facturas?fecha=&estado=` | autenticado | Lista de ventas |
| GET | `/facturas/:id` | autenticado | Detalle de factura |
| POST | `/facturas` | OWNER…CASHIER | Venta directa (rápida) |
| POST | `/facturas/from-cita/:citaId` | OWNER…CASHIER | Venta desde cita (marca FINALIZADA) |
| POST | `/facturas/:id/abono` | OWNER…CASHIER | Abono a deuda (fiao) |
| PATCH | `/facturas/:id/anular` | OWNER, ADMIN | Anular (revierte inventario y crédito) |

Estados (español): `BORRADOR · PAGADA · PARCIAL · PENDIENTE · ANULADA`.

### POS — Métodos de pago y Caja
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET/POST/PATCH/DELETE | `/metodos-pago` | — / OWNER-ADMIN | CRUD de métodos de pago |
| GET | `/caja?sucursalId=` | autenticado | Lista de cajas |
| POST | `/caja` | OWNER, ADMIN, MANAGER | Crear caja |
| POST | `/caja/abrir` | OWNER…CASHIER | Abrir caja (monto inicial) |
| GET | `/caja/:aperturaId/resumen` | autenticado | Resumen en vivo de la sesión |
| POST | `/caja/:aperturaId/cerrar` | OWNER…CASHIER | Cierre + arqueo (efectivo esperado vs contado) |

### Inventario — Productos y Categorías
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/productos?q=&categoriaId=&activo=` | autenticado | Lista filtrable |
| GET | `/productos/:id` | autenticado | Detalle (con stock por sucursal) |
| POST/PATCH/DELETE | `/productos[/:id]` | OWNER-ADMIN-MANAGER | CRUD (stock se mueve vía ajustes) |
| GET/POST/PATCH/DELETE | `/categorias-producto[/:id]` | — / MANAGER+ | CRUD categorías |

### Inventario — Proveedores y Compras
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET/POST/PATCH/DELETE | `/proveedores[/:id]` | — / MANAGER+ | CRUD proveedores |
| GET | `/compras` · `/compras/:id` | autenticado | Lista / detalle |
| POST | `/compras` | MANAGER+ | Crear compra (borrador) |
| PATCH | `/compras/:id/confirmar` | MANAGER+ | Confirmar → suma stock + ENTRADA/COMPRA |

### Inventario — Movimientos
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/inventario/stock-bajo` | autenticado | Productos en/bajo el mínimo |
| GET | `/inventario/kardex/:productoId?desde=&hasta=` | autenticado | Kardex con saldos |
| POST | `/inventario/ajustes` | MANAGER+ | Ajuste manual (±cantidad + motivo) |
| POST | `/inventario/transferencias` | MANAGER+ | Transferencia entre sucursales (transaccional) |

Motivos de movimiento en el kardex: `COMPRA · VENTA · AJUSTE · DEVOLUCION · TRANSFERENCIA`.

### Auditoría
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/auditoria?modulo=&entidad=&entidadId=&desde=&hasta=` | OWNER, ADMIN | Historial de acciones críticas |

Eventos auditados: crear/anular factura, crear/cancelar cita, ajuste e inventario, transferencias, cambio de precio, cambio de configuración. Ver `AUDITORIA_FASE_9_5.md` para el informe completo de hardening.

### Dashboard Ejecutivo
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/dashboard` | OWNER, ADMIN, MANAGER | Resumen completo (KPIs + gráficas + rankings) |
| GET | `/dashboard/kpis` | OWNER, ADMIN, MANAGER | Ventas hoy/mes, citas, clientes nuevos/VIP, CxC, ticket, ocupación |
| GET | `/dashboard/graficas` | OWNER, ADMIN, MANAGER | Ventas 12 meses, por sucursal, top servicios/productos, formas de pago, flujo de caja |
| GET | `/dashboard/rankings` | OWNER, ADMIN, MANAGER | Top empleados, comisiones acumuladas, clientes con mayor gasto |

### Reportes (exportables a PDF / Excel / CSV)
Todos aceptan `?desde=&hasta=&sucursalId=&empleadoId=&formato=`. `formato` = `json` (default) · `pdf` · `excel` · `csv`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/reportes/ventas` | Ventas por fecha |
| GET | `/reportes/citas` | Citas por estado |
| GET | `/reportes/comisiones` | Comisiones por empleado |
| GET | `/reportes/inventario` | Inventario con valorización |
| GET | `/reportes/kardex?productoId=` | Kardex de un producto |
| GET | `/reportes/cuentas-por-cobrar` | Facturas con saldo (fiao) |
| GET | `/reportes/flujo-caja` | Entradas por día |
| GET | `/reportes/agenda-diaria?desde=` | Agenda de un día |

Roles: OWNER, ADMIN, MANAGER. Ejemplo: `GET /reportes/ventas?desde=2026-01-01&hasta=2026-01-31&formato=pdf`.
Nota: PDF requiere `pdfkit` y Excel `exceljs` (ya en package.json; instalar con `npm install`). CSV es nativo. Si una librería falta, el endpoint degrada a CSV automáticamente.

### Notificaciones
Servicio central con canales WhatsApp/Email/SMS (proveedores *stub* que registran en consola; conectar credenciales reales en `channels/providers.ts`). Plantillas por evento con variables `{{cliente}}`, `{{fecha}}`, `{{hora}}`, `{{total}}`, `{{saldo}}`, etc.

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/notificaciones?clienteId=&status=` | OWNER, ADMIN, MANAGER | Historial de envíos |
| GET | `/notificaciones/plantillas` | OWNER, ADMIN | Plantillas (personalizadas + por defecto) |
| PUT | `/notificaciones/plantillas` | OWNER, ADMIN | Crear/editar plantilla por evento+canal |
| POST | `/notificaciones/enviar` | OWNER, ADMIN, MANAGER | Envío manual a un cliente |
| POST | `/notificaciones/jobs/recordatorios-24h` | OWNER, ADMIN | Disparar recordatorios de mañana |
| POST | `/notificaciones/jobs/cumpleanos` | OWNER, ADMIN | Felicitaciones de hoy |
| POST | `/notificaciones/jobs/avisos-deuda` | OWNER, ADMIN | Avisos a clientes con saldo |

Eventos: `CITA_CREADA · RECORDATORIO_24H · CONFIRMACION · CANCELACION · REPROGRAMACION · FACTURA_EMITIDA · PAGO_RECIBIDO · CUMPLEANOS · AVISO_DEUDA`. Los eventos `CITA_CREADA`/`CANCELACION` se disparan solos desde la Agenda; `FACTURA_EMITIDA`/`PAGO_RECIBIDO` desde el POS. Los jobs (recordatorios, cumpleaños, deuda) se invocan desde un scheduler externo (cron) o manualmente.

### Portal del Cliente
Sistema de autenticación **separado** del de empleados (login por OTP a teléfono/email). El token lleva `tipo='portal'` y cada cliente solo accede a SUS propios datos.

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/portal/auth/solicitar-otp` | público | Envía OTP (empresaSlug + destino) |
| POST | `/portal/auth/verificar-otp` | público | Verifica OTP → tokens |
| POST | `/portal/auth/refresh` | público | Refresca el token del portal |
| GET | `/portal/dashboard` | cliente | Próxima cita, gasto, puntos, membresía, balance |
| GET | `/portal/mis-citas` | cliente | Historial de citas propias |
| GET | `/portal/mis-facturas` | cliente | Facturas propias con detalle |
| GET | `/portal/mi-credito` | cliente | Límite, usado, disponible |
| GET | `/portal/mis-membresias` | cliente | Membresías con beneficios consumidos |
| GET | `/portal/servicios` | cliente | Servicios disponibles (paso 1 reserva) |
| GET | `/portal/servicios/:id/empleados` | cliente | Especialistas del servicio (paso 2) |
| GET | `/portal/empleados/:id/horas?fecha=` | cliente | Horas disponibles (paso 3) |
| POST | `/portal/citas` | cliente | Reservar (reusa anti-solapamiento interno) |
| PATCH | `/portal/citas/:id/reagendar` | cliente | Reagendar cita propia |
| PATCH | `/portal/citas/:id/cancelar` | cliente | Cancelar cita propia |

Seguridad: el `clienteId` siempre sale del token, nunca del body. Reagendar/cancelar verifican que la cita pertenezca al cliente (403 si no). Las reservas usan el mismo `DisponibilidadService` que la agenda interna, con origen `APP`.

### Super Admin SaaS
Auth **separada** (secret propio `JWT_SUPERADMIN_SECRET`, token `tipo='superadmin'`). Opera por encima del multi-tenant: gestiona TODAS las empresas.

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/admin/login` | Login de super admin |
| GET | `/admin/dashboard` | Empresas activas/suspendidas, ingresos SaaS, nuevos, planes, facturas vencidas |
| GET | `/admin/empresas?estado=` | Listar empresas con su plan y uso |
| POST | `/admin/empresas` | Crear empresa + suscripción + OWNER + sucursal (transaccional) |
| PATCH | `/admin/empresas/:id` | Editar (nombre, cambiar plan) |
| PATCH | `/admin/empresas/:id/suspender` | Suspender |
| PATCH | `/admin/empresas/:id/reactivar` | Reactivar |
| DELETE | `/admin/empresas/:id` | Eliminar (soft delete) |
| GET/POST/PATCH | `/admin/planes[/:id]` | CRUD de planes (precio, límites, módulos) |
| GET | `/admin/facturas?status=` | Facturas SaaS |
| POST | `/admin/facturas/generar-mes` | Generar facturas del período |
| POST | `/admin/facturas/pagar` | Registrar pago (reactiva empresa) |
| POST | `/admin/jobs/suspender-morosas` | Job diario: suspende empresas con factura vencida |

**Límites automáticos:** al crear usuario/sucursal/empleado, el sistema consulta `LimitsService` contra el plan de la empresa. Si se alcanza el límite → HTTP 403 "Ha alcanzado el límite de [recurso] de su plan". `null` en un límite = ilimitado.

**Suspensión automática:** el job `suspender-morosas` (disparado por cron diario) marca facturas vencidas e impagas como VENCIDA y pone la empresa en SUSPENDED. Al registrar el pago, la empresa se reactiva sola.

## Ejemplos

### Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"empresaSlug":"beauty-glam","email":"owner@beautyglam.do","password":"Password123"}'
```
Respuesta:
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "...", "nombre": "Luis Rodríguez", "rol": "OWNER", "empresaSlug": "beauty-glam" }
}
```

### Usar el access token
```bash
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

### Refrescar
```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

### Empresa: ver y actualizar
```bash
# Ver la empresa
curl http://localhost:3000/api/v1/empresa \
  -H "Authorization: Bearer <accessToken>"

# Actualizar config y verticales
curl -X PATCH http://localhost:3000/api/v1/empresa \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Beauty Glam","verticales":["SALON","NAIL_BAR"],"itbisPct":18,"permiteFiao":true}'
```

### Sucursales
```bash
# Crear
curl -X POST http://localhost:3000/api/v1/sucursales \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Estixa Piantini","direccion":"Piantini, Santo Domingo","telefono":"809-555-0110","esPrincipal":true}'

# Listar
curl http://localhost:3000/api/v1/sucursales \
  -H "Authorization: Bearer <accessToken>"
```

### Empleados: disponibilidad (base de la Agenda)
```bash
curl "http://localhost:3000/api/v1/empleados/<empleadoId>/disponibilidad?fecha=2026-06-20" \
  -H "Authorization: Bearer <accessToken>"
```
Respuesta:
```json
{
  "fecha": "2026-06-20",
  "trabaja": true,
  "horaInicio": "09:00",
  "horaFin": "18:00",
  "ocupado": [
    { "inicio": "10:00", "fin": "10:30" },
    { "inicio": "14:00", "fin": "15:00" }
  ],
  "disponible": [
    { "inicio": "09:00", "fin": "10:00" },
    { "inicio": "10:30", "fin": "14:00" },
    { "inicio": "15:00", "fin": "18:00" }
  ]
}
```

### Agenda: crear cita (con anti-solapamiento)
```bash
curl -X POST http://localhost:3000/api/v1/citas \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId":"<uuid>",
    "empleadoId":"<uuid>",
    "fecha":"2026-07-10",
    "horaInicio":"10:00",
    "servicios":["<servicioId1>","<servicioId2>"],
    "notas":"Cliente prefiere productos sin amoníaco"
  }'
```
Si el empleado está ocupado, responde `409`:
```json
{ "message": "El empleado ya tiene una cita o bloqueo en ese horario" }
```
La hora fin se calcula sumando la duración de los servicios. Si algún servicio
tiene `requiereCabina:true`, el sistema asigna automáticamente una cabina libre
de la sucursal (o responde 409 si no hay).

### POS: venta con pago mixto
```bash
curl -X POST http://localhost:3000/api/v1/facturas \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId":"<uuid>",
    "lineas":[
      {"tipo":"SERVICIO","servicioId":"<uuid>","empleadoId":"<uuid>","cantidad":1},
      {"tipo":"PRODUCTO","productoId":"<uuid>","cantidad":2}
    ],
    "pagos":[
      {"metodoPagoId":"<efectivo>","monto":500},
      {"metodoPagoId":"<tarjeta>","monto":1270}
    ]
  }'
```

### POS: venta a crédito (fiao)
```bash
# Paga parte y deja el resto a crédito (valida límite del cliente)
curl -X POST http://localhost:3000/api/v1/facturas \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId":"<uuid>",
    "lineas":[{"tipo":"SERVICIO","servicioId":"<uuid>","empleadoId":"<uuid>","cantidad":1}],
    "pagos":[{"metodoPagoId":"<efectivo>","monto":300}],
    "permitirFiao":true
  }'

# Más tarde, abonar a la deuda
curl -X POST http://localhost:3000/api/v1/facturas/<ventaId>/abono \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"metodoPagoId":"<efectivo>","monto":500}'
```

## Seguridad implementada

- Contraseñas con **bcrypt** (cost 12).
- Access token corto (15 min) + refresh token (7 días) con **rotación** y revocación.
- Refresh tokens almacenados como **hash SHA-256** (no en claro).
- Reset de contraseña: token aleatorio de 32 bytes, hasheado, con expiración de 1h; al cambiar la contraseña se **invalidan todas las sesiones**.
- Respuesta uniforme en `forgot-password` (no filtra si el email existe).
- `email` único **por empresa** (dos empresas pueden tener el mismo email).
- Helmet, CORS configurable, ValidationPipe con whitelist estricta.

## Proteger rutas en otros módulos

```ts
@Controller('clientes')
export class ClientesController {
  @Get()                              // requiere auth (guard global)
  findAll() { ... }

  @Post()
  @Roles('OWNER', 'ADMIN', 'RECEPCION')   // solo estos roles
  create(@Body() dto, @CurrentUser() user) { ... }
}
```

En los servicios, usar siempre `this.prisma.db` (filtrado por tenant), no `this.prisma` directo, salvo para entidades sin tenant como `Empresa`.
