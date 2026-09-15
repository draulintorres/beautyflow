import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantContext } from '../tenant/tenant-context';

/**
 * Modelos que llevan empresaId y deben filtrarse automáticamente por tenant.
 * Mantener sincronizado con el schema.prisma.
 */
const TENANT_MODELS = new Set<string>([
  'Sucursal', 'ModuloActivo', 'Rol', 'Usuario',
  'Cliente', 'ClienteFoto', 'NotaCliente',
  'FichaPlantilla', 'FichaValor',
  'Empleado', 'BloqueoHorario', 'ComisionConfig', 'LiquidacionComision',
  'CategoriaServicio', 'Servicio',
  'Cita',
  'Caja', 'AperturaCaja', 'MetodoPago', 'Venta', 'Propina', 'MovimientoCredito',
  'Producto', 'MovimientoInventario', 'Proveedor', 'Compra',
  'Paquete',
  'Membresia', 'MembresiaSuscripcion', 'MembresiaConsumo',
  'PuntosCliente', 'PuntosMovimiento', 'Cupon',
  'NotificacionInterna',
  'AlquilerConfig', 'DeudaAlquiler', 'AbonoAlquiler',
  // Auditoría de aislamiento por tenant (2026-09-11): estos SÍ tienen
  // empresaId propio en el schema pero se habían quedado fuera de este set
  // — sus servicios (cabinas.service.ts, productos.service.ts,
  // plantillas.service.ts, notification.service.ts) usaban `prisma.db.*`
  // asumiendo que ya estaban cubiertos, así que leían/escribían SIN aislar
  // por empresa (`GET /cabinas`, `GET /categorias-producto`, el listado de
  // plantillas de notificación y el historial de notificaciones devolvían
  // filas de TODAS las empresas; `POST /cabinas` y `POST
  // /categorias-producto` ni siquiera funcionaban porque nunca se inyectaba
  // el empresaId requerido — 500 en ambos). Agregarlos aquí corrige todo
  // eso a la vez sin tocar los servicios.
  'Cabina', 'CategoriaProducto', 'PlantillaNotificacion', 'Notificacion',
  // Módulo de Auditoría (2026-09-11): AuditLog ya se leía/escribía con
  // empresaId explícito a mano en audit.service.ts (correcto), pero se
  // suma aquí también para que quede protegido por el mecanismo
  // automático igual que el resto — consistente y sin que dependa de que
  // nadie recuerde el filtro en una consulta nueva.
  'AuditLog',
  // Login biométrico (2026-09-13): SOLO para las operaciones que corren
  // CON sesión ya iniciada (activar/listar/revocar un dispositivo) — ahí
  // `.db.webAuthnCredential.*` se aísla automático igual que cualquier
  // otro modelo de este set. La búsqueda durante el LOGIN biométrico en sí
  // (sin sesión todavía, por definición) NO pasa por `.db.*` — usa el
  // cliente plano de Prisma filtrando por `credentialId` (único global, no
  // adivinable), exactamente como ya se hace con RefreshToken.tokenHash —
  // ver auth.service.ts.
  'WebAuthnCredential',
]);

/**
 * Modelos con soft delete (campo deletedAt). Las lecturas excluyen
 * registros borrados automáticamente.
 *
 * OJO: `LiquidacionComision` y `FichaValor` estaban antes en este set sin
 * tener columna `deletedAt` en el schema — un error de tipeo silencioso
 * porque, hasta ahora, ningún servicio los consultaba vía `prisma.db.*`
 * (usaban el cliente plano, así que nunca disparaba). Al migrar
 * `liquidaciones.service.ts` a `prisma.db.*` (parte A de la auditoría de
 * aislamiento, 2026-09-11) esto empezó a tirar
 * `PrismaClientValidationError: Unknown argument 'deletedAt'` en
 * `anular()`. Se quitaron los dos de aquí — igual de importante para que no
 * se repita: antes de sumar un modelo a este set, confirmar que SÍ tiene
 * `deletedAt` en `schema.prisma` (no asumir por la familia del modelo).
 */
const SOFT_DELETE_MODELS = new Set<string>([
  'Empresa', 'Sucursal', 'Rol', 'Usuario',
  'Cliente', 'ClienteFoto', 'NotaCliente', 'FichaPlantilla', 'FichaCampo',
  'Empleado', 'ComisionConfig',
  'CategoriaServicio', 'Servicio',
  'Cita', 'Caja', 'MetodoPago', 'Venta',
  'Producto', 'Proveedor', 'Compra',
  'Paquete',
  'Membresia', 'MembresiaBeneficio', 'MembresiaSuscripcion', 'Cupon',
  // Tienen deletedAt y sus servicios ya lo usan (remove()/activa:false los
  // marca borrados) pero, al no estar aquí, un registro "eliminado" seguía
  // apareciendo en los listados — ver nota de TENANT_MODELS arriba.
  // (Notificacion no tiene deletedAt, por eso no entra en este segundo set.)
  'Cabina', 'CategoriaProducto', 'PlantillaNotificacion',
]);

/**
 * Modelos SIN empresaId propio que llegan al tenant vía una relación 1:1
 * con un modelo que sí lo tiene — hoy solo DetalleVenta y Pago, ambos
 * relacionados con Venta por el campo `venta`. A diferencia de
 * TENANT_MODELS no hay una columna plana donde inyectar `empresaId`, así
 * que en su lugar se fusiona un filtro anidado `<relación>: { empresaId }`
 * en el `where` de toda lectura y de toda escritura por `where`
 * (update/updateMany/delete/deleteMany/upsert).
 *
 * Esto es lo que cerró, de raíz y no caso por caso, la fuga encontrada en
 * la auditoría del 2026-09-11 (dashboard.service.ts / reportes-data.service.ts
 * armaban ese mismo `where.venta.empresaId` a mano en cada consulta — si
 * una consulta nueva lo olvidaba, no había nada que la detuviera). Con esto
 * ya no depende de que cada desarrollador se acuerde: se fusiona SIEMPRE,
 * incluso si el `where` que escribió el código ya trae su propio filtro por
 * `venta` (se hace merge, no se pisa) o directamente no trae ningún `where`.
 *
 * `create`/`createMany` quedan fuera a propósito — Prisma no expone un
 * `where` ahí y no hay ninguna alta directa y suelta de un DetalleVenta o
 * Pago en el código: siempre nacen dentro de una venta ya creada (con su
 * propio empresaId) en la misma transacción, sea como escritura anidada
 * (`venta.create({ data: { detalles: { create }, pagos: { create } } })`,
 * que corre como una única operación sobre Venta y nunca pasa por aquí) o
 * como `tx.pago.create({ data: { ventaId, ... } })` referenciando esa venta
 * recién creada. Para que ESTOS `tx.*` también queden bajo el paraguas de
 * esta extensión (y no solo las lecturas sueltas fuera de transacción), las
 * transacciones de POS/Liquidaciones pasaron de `this.prisma.$transaction`
 * a `this.prisma.db.$transaction` — Prisma propaga las extensiones del
 * cliente al `tx` que recibe el callback.
 */
const RELATION_TENANT_MODELS: Record<string, string> = {
  DetalleVenta: 'venta',
  Pago: 'venta',
};

const READ_OPS = new Set([
  'findFirst', 'findMany', 'findUnique', 'findFirstOrThrow',
  'findUniqueOrThrow', 'count', 'aggregate', 'groupBy',
]);
const WRITE_WHERE_OPS = new Set([
  'update', 'updateMany', 'delete', 'deleteMany', 'upsert',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * Cliente extendido que inyecta empresaId y filtra soft-deletes
   * leyendo el contexto de tenant en cada operación. Un único cliente
   * extendido sirve para todos los tenants de forma segura, porque el
   * filtro se evalúa en runtime contra el AsyncLocalStorage.
   */
  private readonly scoped = this.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const isTenant = TENANT_MODELS.has(model);
          const isSoftDelete = SOFT_DELETE_MODELS.has(model);
          const relationField = RELATION_TENANT_MODELS[model];

          if (!isTenant && !isSoftDelete && !relationField) {
            return query(args);
          }

          const store = tenantContext.getStore();

          // Inyectar empresaId en operaciones que filtran por where
          if (isTenant) {
            if (!store?.empresaId) {
              throw new Error(
                `Operación '${operation}' sobre '${model}' sin tenant resuelto`,
              );
            }
            const empresaId = store.empresaId;

            if (READ_OPS.has(operation) || WRITE_WHERE_OPS.has(operation)) {
              (args as any).where = { ...(args as any).where, empresaId };
            }
            if (operation === 'create') {
              (args as any).data = { ...(args as any).data, empresaId };
            }
            if (operation === 'createMany') {
              const data = (args as any).data;
              const arr = Array.isArray(data) ? data : [data];
              (args as any).data = arr.map((d: any) => ({ ...d, empresaId }));
            }
          }

          // DetalleVenta / Pago: fusionar el filtro por la relación con Venta
          // (ver RELATION_TENANT_MODELS arriba). Se hace merge con lo que ya
          // traiga `where[relationField]` (ej. `{ sucursalId }`), nunca se
          // pisa — y se aplica SIEMPRE, exista o no `where` de entrada.
          if (relationField && (READ_OPS.has(operation) || WRITE_WHERE_OPS.has(operation))) {
            if (!store?.empresaId) {
              throw new Error(
                `Operación '${operation}' sobre '${model}' sin tenant resuelto`,
              );
            }
            const where = (args as any).where ?? {};
            (args as any).where = {
              ...where,
              [relationField]: { ...(where[relationField] ?? {}), empresaId: store.empresaId },
            };
          }

          // Excluir soft-deleted en lecturas (a menos que se pida explícitamente)
          if (isSoftDelete && READ_OPS.has(operation)) {
            const where = (args as any).where ?? {};
            if (where.deletedAt === undefined) {
              (args as any).where = { ...where, deletedAt: null };
            }
          }

          return query(args);
        },
      },
    },
  });

  /** Cliente con scope de tenant + soft-delete aplicados. Usar en servicios. */
  get db() {
    return this.scoped;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
