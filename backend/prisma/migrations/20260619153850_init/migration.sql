-- CreateEnum
CREATE TYPE "Vertical" AS ENUM ('SALON', 'BARBERIA', 'NAIL_BAR', 'ESTETICA', 'SPA', 'MIXTO');

-- CreateEnum
CREATE TYPE "ModuloKey" AS ENUM ('INVENTARIO', 'ALIMENTOS_BEBIDAS', 'CREDITO_FIAO', 'COMISIONES', 'MARKETING', 'WHATSAPP', 'MEMBRESIAS');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('TRIAL', 'BASIC', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "EmpresaStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SubStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "FacturaSaaSStatus" AS ENUM ('PENDIENTE', 'PAGADA', 'VENCIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'RECEPCION', 'BARBERO', 'ESTILISTA', 'MANICURISTA', 'ESTETICISTA', 'MASAJISTA');

-- CreateEnum
CREATE TYPE "CitaStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "CitaServicioStatus" AS ENUM ('PENDING', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "CitaOrigen" AS ENUM ('WEB', 'POS', 'APP', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CanalNotificacion" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificacionEvento" AS ENUM ('CITA_CREADA', 'RECORDATORIO_24H', 'CONFIRMACION', 'CANCELACION', 'REPROGRAMACION', 'FACTURA_EMITIDA', 'PAGO_RECIBIDO', 'CUMPLEANOS', 'AVISO_DEUDA');

-- CreateEnum
CREATE TYPE "NotificacionStatus" AS ENUM ('PENDIENTE', 'ENVIADA', 'FALLIDA');

-- CreateEnum
CREATE TYPE "BloqueoTipo" AS ENUM ('ALMUERZO', 'DESCANSO', 'CAPACITACION', 'DIA_LIBRE', 'PERSONAL', 'OTRO');

-- CreateEnum
CREATE TYPE "VentaStatus" AS ENUM ('OPEN', 'PAGADA', 'PENDIENTE', 'ABONO_PARCIAL', 'ANULADA');

-- CreateEnum
CREATE TYPE "VentaOrigen" AS ENUM ('CITA', 'DIRECTA');

-- CreateEnum
CREATE TYPE "LineaTipo" AS ENUM ('SERVICIO', 'PRODUCTO', 'ALIMENTO_BEBIDA');

-- CreateEnum
CREATE TYPE "PagoStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CajaStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "MovimientoCreditoTipo" AS ENUM ('CARGO', 'ABONO');

-- CreateEnum
CREATE TYPE "InventarioTipo" AS ENUM ('VENTA', 'CONSUMO_INTERNO');

-- CreateEnum
CREATE TYPE "MovimientoInventarioTipo" AS ENUM ('ENTRADA', 'SALIDA', 'AJUSTE');

-- CreateEnum
CREATE TYPE "ComisionBase" AS ENUM ('SERVICIO', 'PRODUCTO', 'PROPINA', 'FIJA', 'CAMPANA');

-- CreateEnum
CREATE TYPE "ComisionFiaoPolitica" AS ENUM ('AL_REALIZAR_SERVICIO', 'AL_COBRAR');

-- CreateEnum
CREATE TYPE "MembresiaBeneficioTipo" AS ENUM ('CANTIDAD', 'ILIMITADO', 'DESCUENTO');

-- CreateEnum
CREATE TYPE "MembresiaPeriodo" AS ENUM ('MENSUAL', 'TRIMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "MembresiaSuscripcionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELED', 'PENDING_RENEWAL');

-- CreateEnum
CREATE TYPE "FichaCampoTipo" AS ENUM ('TEXTO', 'SELECCION', 'MULTI_SELECCION', 'NUMERO', 'FECHA', 'BOOLEANO');

-- CreateTable
CREATE TABLE "empresas" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "rnc" TEXT,
    "logo_url" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "redes" JSONB NOT NULL DEFAULT '{}',
    "moneda" TEXT NOT NULL DEFAULT 'DOP',
    "itbis_pct" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "verticales" "Vertical"[] DEFAULT ARRAY[]::"Vertical"[],
    "comision_fiao_politica" "ComisionFiaoPolitica" NOT NULL DEFAULT 'AL_COBRAR',
    "umbral_vip_monto" DECIMAL(12,2) NOT NULL DEFAULT 50000,
    "umbral_frecuente_visitas" INTEGER NOT NULL DEFAULT 10,
    "permite_fiao" BOOLEAN NOT NULL DEFAULT true,
    "limite_credito_default" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dias_vencimiento" INTEGER NOT NULL DEFAULT 30,
    "plan" "PlanType" NOT NULL DEFAULT 'TRIAL',
    "estado" "EmpresaStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "plan_id" UUID,
    "plan" "PlanType" NOT NULL,
    "status" "SubStatus" NOT NULL DEFAULT 'ACTIVE',
    "fecha_inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "renovacion_auto" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planes" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "PlanType" NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "max_usuarios" INTEGER,
    "max_sucursales" INTEGER,
    "max_empleados" INTEGER,
    "modulos" JSONB NOT NULL DEFAULT '[]',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "planes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admins" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturas_saas" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "periodo" TEXT NOT NULL,
    "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_vencimiento" TIMESTAMP(3) NOT NULL,
    "fecha_pago" TIMESTAMP(3),
    "status" "FacturaSaaSStatus" NOT NULL DEFAULT 'PENDIENTE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facturas_saas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modulos_activos" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "modulo" "ModuloKey" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modulos_activos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucursales" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "telefono" TEXT,
    "es_principal" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cabinas" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cabinas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "role_key" "RoleKey" NOT NULL,
    "permisos" JSONB NOT NULL DEFAULT '{}',
    "es_sistema" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "rol_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "debe_change_password" BOOLEAN NOT NULL DEFAULT false,
    "ultimo_login" TIMESTAMP(3),
    "reset_token" TEXT,
    "reset_token_expires" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT,
    "telefono" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "fecha_nac" DATE,
    "sexo" TEXT,
    "cedula" TEXT,
    "direccion" TEXT,
    "notas" TEXT,
    "alergias" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "limite_credito" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "permite_fiao" BOOLEAN NOT NULL DEFAULT true,
    "deuda_actual" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_fotos" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "servicio_id" UUID,
    "url" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "par_id" UUID,
    "descripcion" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cliente_fotos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_cliente" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "es_alerta" BOOLEAN NOT NULL DEFAULT false,
    "fijada" BOOLEAN NOT NULL DEFAULT false,
    "autor_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notas_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ficha_plantillas" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "vertical" "Vertical" NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ficha_plantillas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ficha_campos" (
    "id" UUID NOT NULL,
    "plantilla_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "FichaCampoTipo" NOT NULL,
    "opciones" JSONB NOT NULL DEFAULT '[]',
    "categoria" TEXT,
    "es_alerta" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "requerido" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ficha_campos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ficha_valores" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "campo_id" UUID NOT NULL,
    "valor" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ficha_valores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empleados" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID,
    "usuario_id" UUID,
    "nombre" TEXT NOT NULL,
    "puesto" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "en_vacaciones" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "empleados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empleado_servicios" (
    "id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "servicio_id" UUID NOT NULL,

    CONSTRAINT "empleado_servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empleado_horarios" (
    "id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "hora_inicio" TEXT NOT NULL,
    "hora_fin" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "empleado_horarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bloqueos_horario" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "tipo" "BloqueoTipo" NOT NULL DEFAULT 'ALMUERZO',
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "recurrente" BOOLEAN NOT NULL DEFAULT false,
    "dia_semana" INTEGER,
    "motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bloqueos_horario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comision_configs" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "base" "ComisionBase" NOT NULL,
    "porcentaje" DECIMAL(5,2),
    "monto_fijo" DECIMAL(12,2),
    "servicio_id" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "comision_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones_comision" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "periodo_ini" TIMESTAMP(3) NOT NULL,
    "periodo_fin" TIMESTAMP(3) NOT NULL,
    "total_servicios" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_productos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_propinas" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_fija" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_campanas" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_pagar" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pagada" BOOLEAN NOT NULL DEFAULT false,
    "pagada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liquidaciones_comision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_servicio" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "icono" TEXT,
    "vertical" "Vertical",
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "categorias_servicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,
    "vertical" "Vertical",
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" DECIMAL(12,2) NOT NULL,
    "duracion_min" INTEGER NOT NULL,
    "comision_pct" DECIMAL(5,2),
    "requiere_cabina" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paquetes" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" DECIMAL(12,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "paquetes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paquete_servicios" (
    "id" UUID NOT NULL,
    "paquete_id" UUID NOT NULL,
    "servicio_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "paquete_servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citas" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID,
    "cliente_id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "cabina_id" UUID,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "estado" "CitaStatus" NOT NULL DEFAULT 'SCHEDULED',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "itbis" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "origen" "CitaOrigen" NOT NULL DEFAULT 'WEB',
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "citas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cita_servicios" (
    "id" UUID NOT NULL,
    "cita_id" UUID NOT NULL,
    "servicio_id" UUID NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "duracion_min" INTEGER NOT NULL,
    "estado" "CitaServicioStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cita_servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cajas" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT 'Caja principal',
    "estado" "CajaStatus" NOT NULL DEFAULT 'CLOSED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cajas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aperturas_caja" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "caja_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "fecha_apertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto_inicial" DECIMAL(12,2) NOT NULL,
    "fecha_cierre" TIMESTAMP(3),
    "efectivo_esperado" DECIMAL(12,2),
    "efectivo_contado" DECIMAL(12,2),
    "diferencia" DECIMAL(12,2),
    "total_facturado" DECIMAL(12,2),
    "total_fiao" DECIMAL(12,2),
    "total_cobro_deudas" DECIMAL(12,2),
    "estado" "CajaStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aperturas_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metodos_pago" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "es_efectivo" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "metodos_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID,
    "apertura_caja_id" UUID,
    "cliente_id" UUID,
    "cita_id" UUID,
    "empleado_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "origen" "VentaOrigen" NOT NULL DEFAULT 'DIRECTA',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "itbis" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "propina" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "saldo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estado" "VentaStatus" NOT NULL DEFAULT 'OPEN',
    "fecha_compromiso" TIMESTAMP(3),
    "comentario_fiao" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_ventas" (
    "id" UUID NOT NULL,
    "venta_id" UUID NOT NULL,
    "tipo" "LineaTipo" NOT NULL DEFAULT 'SERVICIO',
    "servicio_id" UUID,
    "producto_id" UUID,
    "empleado_id" UUID,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "precio_unit" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "comision_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "comision_monto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cubierto_por_membresia" BOOLEAN NOT NULL DEFAULT false,
    "membresia_sub_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "detalle_ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" UUID NOT NULL,
    "venta_id" UUID NOT NULL,
    "metodo_pago_id" UUID NOT NULL,
    "empleado_id" UUID,
    "monto" DECIMAL(12,2) NOT NULL,
    "referencia" TEXT,
    "estado" "PagoStatus" NOT NULL DEFAULT 'CONFIRMED',
    "es_abono_deuda" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "propinas" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "venta_id" UUID NOT NULL,
    "empleado_id" UUID,
    "monto" DECIMAL(12,2) NOT NULL,
    "genera_comision" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "propinas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_credito" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "venta_id" UUID,
    "tipo" "MovimientoCreditoTipo" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "descripcion" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_credito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "codigo" TEXT,
    "codigo_barra" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "marca" TEXT,
    "categoria_id" UUID,
    "categoria" TEXT,
    "tipo" "InventarioTipo" NOT NULL DEFAULT 'VENTA',
    "es_alimento_bebida" BOOLEAN NOT NULL DEFAULT false,
    "unidad_medida" TEXT,
    "costo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "precio" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "itbis_pct" DECIMAL(5,2),
    "existencia" INTEGER NOT NULL DEFAULT 0,
    "stock_minimo" INTEGER NOT NULL DEFAULT 0,
    "permite_venta_sin_stock" BOOLEAN NOT NULL DEFAULT false,
    "genera_comision" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_producto" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "categorias_producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_sucursales" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "existencia" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_inventario" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "sucursal_id" UUID,
    "tipo" "MovimientoInventarioTipo" NOT NULL,
    "motivo" TEXT,
    "cantidad" INTEGER NOT NULL,
    "saldo_anterior" INTEGER NOT NULL DEFAULT 0,
    "saldo_nuevo" INTEGER NOT NULL DEFAULT 0,
    "referencia_tipo" TEXT,
    "referencia_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "rnc" TEXT,
    "contacto" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compras" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "sucursal_id" UUID,
    "numero" INTEGER NOT NULL,
    "numero_factura" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "itbis" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmada" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "compras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_compras" (
    "id" UUID NOT NULL,
    "compra_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costo_unit" DECIMAL(12,2) NOT NULL,
    "itbis" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detalle_compras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresias" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" DECIMAL(12,2) NOT NULL,
    "periodo" "MembresiaPeriodo" NOT NULL DEFAULT 'MENSUAL',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "membresias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresia_beneficios" (
    "id" UUID NOT NULL,
    "membresia_id" UUID NOT NULL,
    "tipo" "MembresiaBeneficioTipo" NOT NULL,
    "servicio_id" UUID,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER,
    "descuento_pct" DECIMAL(5,2),
    "aplica_a" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "membresia_beneficios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresia_suscripciones" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "membresia_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "vigencia_ini" TIMESTAMP(3) NOT NULL,
    "vigencia_fin" TIMESTAMP(3) NOT NULL,
    "estado" "MembresiaSuscripcionStatus" NOT NULL DEFAULT 'ACTIVE',
    "renovacion_auto" BOOLEAN NOT NULL DEFAULT false,
    "precio_pagado" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "membresia_suscripciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresia_consumos" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "suscripcion_id" UUID NOT NULL,
    "beneficio_id" UUID NOT NULL,
    "venta_id" UUID,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membresia_consumos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_otps" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "cliente_id" UUID,
    "destino" TEXT NOT NULL,
    "codigo_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "usado_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_refresh_tokens" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puntos_cliente" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "saldo" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "puntos_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puntos_movimientos" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "puntos_cliente_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "puntos" INTEGER NOT NULL,
    "venta_id" UUID,
    "descripcion" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puntos_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cupones" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo_descuento" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "usos_max" INTEGER,
    "vigencia_ini" TIMESTAMP(3),
    "vigencia_fin" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cupones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantillas_notificacion" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "evento" "NotificacionEvento" NOT NULL,
    "canal" "CanalNotificacion" NOT NULL,
    "asunto" TEXT,
    "cuerpo" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "plantillas_notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "cliente_id" UUID,
    "evento" "NotificacionEvento" NOT NULL,
    "canal" "CanalNotificacion" NOT NULL,
    "destinatario" TEXT NOT NULL,
    "asunto" TEXT,
    "cuerpo" TEXT NOT NULL,
    "status" "NotificacionStatus" NOT NULL DEFAULT 'PENDIENTE',
    "error" TEXT,
    "referencia_tipo" TEXT,
    "referencia_id" UUID,
    "enviada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "usuario_id" UUID,
    "modulo" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" UUID,
    "accion" TEXT NOT NULL,
    "datos_antes" JSONB,
    "datos_despues" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_slug_key" ON "empresas"("slug");

-- CreateIndex
CREATE INDEX "empresas_slug_idx" ON "empresas"("slug");

-- CreateIndex
CREATE INDEX "empresas_estado_idx" ON "empresas"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_empresa_id_key" ON "subscriptions"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "planes_nombre_key" ON "planes"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");

-- CreateIndex
CREATE INDEX "facturas_saas_empresa_id_idx" ON "facturas_saas"("empresa_id");

-- CreateIndex
CREATE INDEX "facturas_saas_status_fecha_vencimiento_idx" ON "facturas_saas"("status", "fecha_vencimiento");

-- CreateIndex
CREATE INDEX "modulos_activos_empresa_id_idx" ON "modulos_activos"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "modulos_activos_empresa_id_modulo_key" ON "modulos_activos"("empresa_id", "modulo");

-- CreateIndex
CREATE INDEX "sucursales_empresa_id_idx" ON "sucursales"("empresa_id");

-- CreateIndex
CREATE INDEX "cabinas_empresa_id_sucursal_id_idx" ON "cabinas"("empresa_id", "sucursal_id");

-- CreateIndex
CREATE INDEX "roles_empresa_id_idx" ON "roles"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_empresa_id_nombre_key" ON "roles"("empresa_id", "nombre");

-- CreateIndex
CREATE INDEX "usuarios_empresa_id_idx" ON "usuarios"("empresa_id");

-- CreateIndex
CREATE INDEX "usuarios_empresa_id_activo_idx" ON "usuarios"("empresa_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_empresa_id_email_key" ON "usuarios"("empresa_id", "email");

-- CreateIndex
CREATE INDEX "refresh_tokens_usuario_id_idx" ON "refresh_tokens"("usuario_id");

-- CreateIndex
CREATE INDEX "clientes_empresa_id_idx" ON "clientes"("empresa_id");

-- CreateIndex
CREATE INDEX "clientes_empresa_id_telefono_idx" ON "clientes"("empresa_id", "telefono");

-- CreateIndex
CREATE INDEX "clientes_empresa_id_nombre_idx" ON "clientes"("empresa_id", "nombre");

-- CreateIndex
CREATE INDEX "cliente_fotos_empresa_id_cliente_id_idx" ON "cliente_fotos"("empresa_id", "cliente_id");

-- CreateIndex
CREATE INDEX "notas_cliente_empresa_id_cliente_id_idx" ON "notas_cliente"("empresa_id", "cliente_id");

-- CreateIndex
CREATE INDEX "ficha_plantillas_empresa_id_vertical_idx" ON "ficha_plantillas"("empresa_id", "vertical");

-- CreateIndex
CREATE INDEX "ficha_campos_plantilla_id_idx" ON "ficha_campos"("plantilla_id");

-- CreateIndex
CREATE INDEX "ficha_valores_empresa_id_cliente_id_idx" ON "ficha_valores"("empresa_id", "cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "ficha_valores_cliente_id_campo_id_key" ON "ficha_valores"("cliente_id", "campo_id");

-- CreateIndex
CREATE UNIQUE INDEX "empleados_usuario_id_key" ON "empleados"("usuario_id");

-- CreateIndex
CREATE INDEX "empleados_empresa_id_idx" ON "empleados"("empresa_id");

-- CreateIndex
CREATE INDEX "empleados_empresa_id_activo_idx" ON "empleados"("empresa_id", "activo");

-- CreateIndex
CREATE INDEX "empleados_empresa_id_sucursal_id_idx" ON "empleados"("empresa_id", "sucursal_id");

-- CreateIndex
CREATE INDEX "empleado_servicios_empleado_id_idx" ON "empleado_servicios"("empleado_id");

-- CreateIndex
CREATE UNIQUE INDEX "empleado_servicios_empleado_id_servicio_id_key" ON "empleado_servicios"("empleado_id", "servicio_id");

-- CreateIndex
CREATE INDEX "empleado_horarios_empleado_id_idx" ON "empleado_horarios"("empleado_id");

-- CreateIndex
CREATE INDEX "bloqueos_horario_empresa_id_empleado_id_inicio_idx" ON "bloqueos_horario"("empresa_id", "empleado_id", "inicio");

-- CreateIndex
CREATE INDEX "comision_configs_empresa_id_empleado_id_idx" ON "comision_configs"("empresa_id", "empleado_id");

-- CreateIndex
CREATE INDEX "liquidaciones_comision_empresa_id_empleado_id_idx" ON "liquidaciones_comision"("empresa_id", "empleado_id");

-- CreateIndex
CREATE INDEX "categorias_servicio_empresa_id_idx" ON "categorias_servicio"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_servicio_empresa_id_nombre_key" ON "categorias_servicio"("empresa_id", "nombre");

-- CreateIndex
CREATE INDEX "servicios_empresa_id_idx" ON "servicios"("empresa_id");

-- CreateIndex
CREATE INDEX "servicios_empresa_id_categoria_id_idx" ON "servicios"("empresa_id", "categoria_id");

-- CreateIndex
CREATE INDEX "servicios_empresa_id_vertical_idx" ON "servicios"("empresa_id", "vertical");

-- CreateIndex
CREATE INDEX "servicios_empresa_id_activo_idx" ON "servicios"("empresa_id", "activo");

-- CreateIndex
CREATE INDEX "paquetes_empresa_id_idx" ON "paquetes"("empresa_id");

-- CreateIndex
CREATE INDEX "paquetes_empresa_id_activo_idx" ON "paquetes"("empresa_id", "activo");

-- CreateIndex
CREATE INDEX "paquete_servicios_paquete_id_idx" ON "paquete_servicios"("paquete_id");

-- CreateIndex
CREATE UNIQUE INDEX "paquete_servicios_paquete_id_servicio_id_key" ON "paquete_servicios"("paquete_id", "servicio_id");

-- CreateIndex
CREATE INDEX "citas_empresa_id_inicio_idx" ON "citas"("empresa_id", "inicio");

-- CreateIndex
CREATE INDEX "citas_empresa_id_empleado_id_inicio_idx" ON "citas"("empresa_id", "empleado_id", "inicio");

-- CreateIndex
CREATE INDEX "citas_empresa_id_cabina_id_inicio_idx" ON "citas"("empresa_id", "cabina_id", "inicio");

-- CreateIndex
CREATE INDEX "citas_empresa_id_estado_idx" ON "citas"("empresa_id", "estado");

-- CreateIndex
CREATE INDEX "citas_empresa_id_cliente_id_idx" ON "citas"("empresa_id", "cliente_id");

-- CreateIndex
CREATE INDEX "cita_servicios_cita_id_idx" ON "cita_servicios"("cita_id");

-- CreateIndex
CREATE INDEX "cita_servicios_servicio_id_idx" ON "cita_servicios"("servicio_id");

-- CreateIndex
CREATE INDEX "cajas_empresa_id_sucursal_id_idx" ON "cajas"("empresa_id", "sucursal_id");

-- CreateIndex
CREATE INDEX "aperturas_caja_empresa_id_caja_id_idx" ON "aperturas_caja"("empresa_id", "caja_id");

-- CreateIndex
CREATE INDEX "aperturas_caja_empresa_id_estado_idx" ON "aperturas_caja"("empresa_id", "estado");

-- CreateIndex
CREATE INDEX "metodos_pago_empresa_id_idx" ON "metodos_pago"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "metodos_pago_empresa_id_nombre_key" ON "metodos_pago"("empresa_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_cita_id_key" ON "ventas"("cita_id");

-- CreateIndex
CREATE INDEX "ventas_empresa_id_idx" ON "ventas"("empresa_id");

-- CreateIndex
CREATE INDEX "ventas_empresa_id_estado_idx" ON "ventas"("empresa_id", "estado");

-- CreateIndex
CREATE INDEX "ventas_empresa_id_created_at_idx" ON "ventas"("empresa_id", "created_at");

-- CreateIndex
CREATE INDEX "ventas_empresa_id_cliente_id_idx" ON "ventas"("empresa_id", "cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_empresa_id_numero_key" ON "ventas"("empresa_id", "numero");

-- CreateIndex
CREATE INDEX "detalle_ventas_venta_id_idx" ON "detalle_ventas"("venta_id");

-- CreateIndex
CREATE INDEX "detalle_ventas_servicio_id_idx" ON "detalle_ventas"("servicio_id");

-- CreateIndex
CREATE INDEX "detalle_ventas_empleado_id_idx" ON "detalle_ventas"("empleado_id");

-- CreateIndex
CREATE INDEX "pagos_venta_id_idx" ON "pagos"("venta_id");

-- CreateIndex
CREATE INDEX "pagos_metodo_pago_id_idx" ON "pagos"("metodo_pago_id");

-- CreateIndex
CREATE INDEX "propinas_empresa_id_venta_id_idx" ON "propinas"("empresa_id", "venta_id");

-- CreateIndex
CREATE INDEX "movimientos_credito_empresa_id_cliente_id_fecha_idx" ON "movimientos_credito"("empresa_id", "cliente_id", "fecha");

-- CreateIndex
CREATE INDEX "movimientos_credito_empresa_id_venta_id_idx" ON "movimientos_credito"("empresa_id", "venta_id");

-- CreateIndex
CREATE INDEX "productos_empresa_id_idx" ON "productos"("empresa_id");

-- CreateIndex
CREATE INDEX "productos_empresa_id_tipo_idx" ON "productos"("empresa_id", "tipo");

-- CreateIndex
CREATE INDEX "productos_empresa_id_activo_idx" ON "productos"("empresa_id", "activo");

-- CreateIndex
CREATE INDEX "productos_empresa_id_categoria_id_idx" ON "productos"("empresa_id", "categoria_id");

-- CreateIndex
CREATE INDEX "categorias_producto_empresa_id_idx" ON "categorias_producto"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_producto_empresa_id_nombre_key" ON "categorias_producto"("empresa_id", "nombre");

-- CreateIndex
CREATE INDEX "stock_sucursales_empresa_id_sucursal_id_idx" ON "stock_sucursales"("empresa_id", "sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_sucursales_producto_id_sucursal_id_key" ON "stock_sucursales"("producto_id", "sucursal_id");

-- CreateIndex
CREATE INDEX "movimientos_inventario_empresa_id_producto_id_created_at_idx" ON "movimientos_inventario"("empresa_id", "producto_id", "created_at");

-- CreateIndex
CREATE INDEX "proveedores_empresa_id_idx" ON "proveedores"("empresa_id");

-- CreateIndex
CREATE INDEX "compras_empresa_id_proveedor_id_idx" ON "compras"("empresa_id", "proveedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "compras_empresa_id_numero_key" ON "compras"("empresa_id", "numero");

-- CreateIndex
CREATE INDEX "detalle_compras_compra_id_idx" ON "detalle_compras"("compra_id");

-- CreateIndex
CREATE INDEX "detalle_compras_producto_id_idx" ON "detalle_compras"("producto_id");

-- CreateIndex
CREATE INDEX "membresias_empresa_id_idx" ON "membresias"("empresa_id");

-- CreateIndex
CREATE INDEX "membresia_beneficios_membresia_id_idx" ON "membresia_beneficios"("membresia_id");

-- CreateIndex
CREATE INDEX "membresia_suscripciones_empresa_id_cliente_id_idx" ON "membresia_suscripciones"("empresa_id", "cliente_id");

-- CreateIndex
CREATE INDEX "membresia_suscripciones_empresa_id_estado_idx" ON "membresia_suscripciones"("empresa_id", "estado");

-- CreateIndex
CREATE INDEX "membresia_suscripciones_empresa_id_vigencia_fin_idx" ON "membresia_suscripciones"("empresa_id", "vigencia_fin");

-- CreateIndex
CREATE INDEX "membresia_consumos_empresa_id_suscripcion_id_idx" ON "membresia_consumos"("empresa_id", "suscripcion_id");

-- CreateIndex
CREATE INDEX "membresia_consumos_beneficio_id_idx" ON "membresia_consumos"("beneficio_id");

-- CreateIndex
CREATE INDEX "cliente_otps_empresa_id_destino_idx" ON "cliente_otps"("empresa_id", "destino");

-- CreateIndex
CREATE INDEX "cliente_refresh_tokens_cliente_id_idx" ON "cliente_refresh_tokens"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "puntos_cliente_cliente_id_key" ON "puntos_cliente"("cliente_id");

-- CreateIndex
CREATE INDEX "puntos_cliente_empresa_id_idx" ON "puntos_cliente"("empresa_id");

-- CreateIndex
CREATE INDEX "puntos_movimientos_empresa_id_puntos_cliente_id_idx" ON "puntos_movimientos"("empresa_id", "puntos_cliente_id");

-- CreateIndex
CREATE INDEX "cupones_empresa_id_idx" ON "cupones"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "cupones_empresa_id_codigo_key" ON "cupones"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "plantillas_notificacion_empresa_id_idx" ON "plantillas_notificacion"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "plantillas_notificacion_empresa_id_evento_canal_key" ON "plantillas_notificacion"("empresa_id", "evento", "canal");

-- CreateIndex
CREATE INDEX "notificaciones_empresa_id_status_idx" ON "notificaciones"("empresa_id", "status");

-- CreateIndex
CREATE INDEX "notificaciones_empresa_id_cliente_id_idx" ON "notificaciones"("empresa_id", "cliente_id");

-- CreateIndex
CREATE INDEX "notificaciones_empresa_id_created_at_idx" ON "notificaciones"("empresa_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_empresa_id_entidad_entidad_id_idx" ON "audit_logs"("empresa_id", "entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "audit_logs_empresa_id_modulo_created_at_idx" ON "audit_logs"("empresa_id", "modulo", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_empresa_id_created_at_idx" ON "audit_logs"("empresa_id", "created_at");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas_saas" ADD CONSTRAINT "facturas_saas_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulos_activos" ADD CONSTRAINT "modulos_activos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabinas" ADD CONSTRAINT "cabinas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_fotos" ADD CONSTRAINT "cliente_fotos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_cliente" ADD CONSTRAINT "notas_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ficha_plantillas" ADD CONSTRAINT "ficha_plantillas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ficha_campos" ADD CONSTRAINT "ficha_campos_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "ficha_plantillas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ficha_valores" ADD CONSTRAINT "ficha_valores_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ficha_valores" ADD CONSTRAINT "ficha_valores_campo_id_fkey" FOREIGN KEY ("campo_id") REFERENCES "ficha_campos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleado_servicios" ADD CONSTRAINT "empleado_servicios_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleado_servicios" ADD CONSTRAINT "empleado_servicios_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleado_horarios" ADD CONSTRAINT "empleado_horarios_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueos_horario" ADD CONSTRAINT "bloqueos_horario_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comision_configs" ADD CONSTRAINT "comision_configs_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comision_configs" ADD CONSTRAINT "comision_configs_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_comision" ADD CONSTRAINT "liquidaciones_comision_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_servicio" ADD CONSTRAINT "categorias_servicio_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paquete_servicios" ADD CONSTRAINT "paquete_servicios_paquete_id_fkey" FOREIGN KEY ("paquete_id") REFERENCES "paquetes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paquete_servicios" ADD CONSTRAINT "paquete_servicios_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_cabina_id_fkey" FOREIGN KEY ("cabina_id") REFERENCES "cabinas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita_servicios" ADD CONSTRAINT "cita_servicios_cita_id_fkey" FOREIGN KEY ("cita_id") REFERENCES "citas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita_servicios" ADD CONSTRAINT "cita_servicios_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aperturas_caja" ADD CONSTRAINT "aperturas_caja_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "cajas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metodos_pago" ADD CONSTRAINT "metodos_pago_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_apertura_caja_id_fkey" FOREIGN KEY ("apertura_caja_id") REFERENCES "aperturas_caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cita_id_fkey" FOREIGN KEY ("cita_id") REFERENCES "citas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_ventas" ADD CONSTRAINT "detalle_ventas_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_ventas" ADD CONSTRAINT "detalle_ventas_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_ventas" ADD CONSTRAINT "detalle_ventas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_ventas" ADD CONSTRAINT "detalle_ventas_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_metodo_pago_id_fkey" FOREIGN KEY ("metodo_pago_id") REFERENCES "metodos_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propinas" ADD CONSTRAINT "propinas_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_credito" ADD CONSTRAINT "movimientos_credito_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_credito" ADD CONSTRAINT "movimientos_credito_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_producto" ADD CONSTRAINT "categorias_producto_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_sucursales" ADD CONSTRAINT "stock_sucursales_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_compras" ADD CONSTRAINT "detalle_compras_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_compras" ADD CONSTRAINT "detalle_compras_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia_beneficios" ADD CONSTRAINT "membresia_beneficios_membresia_id_fkey" FOREIGN KEY ("membresia_id") REFERENCES "membresias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia_beneficios" ADD CONSTRAINT "membresia_beneficios_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia_suscripciones" ADD CONSTRAINT "membresia_suscripciones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia_suscripciones" ADD CONSTRAINT "membresia_suscripciones_membresia_id_fkey" FOREIGN KEY ("membresia_id") REFERENCES "membresias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia_suscripciones" ADD CONSTRAINT "membresia_suscripciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia_consumos" ADD CONSTRAINT "membresia_consumos_suscripcion_id_fkey" FOREIGN KEY ("suscripcion_id") REFERENCES "membresia_suscripciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia_consumos" ADD CONSTRAINT "membresia_consumos_beneficio_id_fkey" FOREIGN KEY ("beneficio_id") REFERENCES "membresia_beneficios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_refresh_tokens" ADD CONSTRAINT "cliente_refresh_tokens_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puntos_movimientos" ADD CONSTRAINT "puntos_movimientos_puntos_cliente_id_fkey" FOREIGN KEY ("puntos_cliente_id") REFERENCES "puntos_cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantillas_notificacion" ADD CONSTRAINT "plantillas_notificacion_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
