-- CreateEnum
CREATE TYPE "TipoCuotaAlquiler" AS ENUM ('POR_SERVICIO', 'RENTA_PERIODO');

-- CreateEnum
CREATE TYPE "FlujoDineroAlquiler" AS ENUM ('DIRECTO', 'POR_CAJA');

-- CreateEnum
CREATE TYPE "PeriodoRenta" AS ENUM ('SEMANAL', 'MENSUAL');

-- CreateEnum
CREATE TYPE "EstadoDeudaAlquiler" AS ENUM ('PENDIENTE', 'ABONO_PARCIAL', 'SALDADA', 'ANULADA');

-- CreateTable
CREATE TABLE "alquiler_config" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "tipo_cuota" "TipoCuotaAlquiler" NOT NULL,
    "flujo_dinero" "FlujoDineroAlquiler" NOT NULL,
    "monto_por_servicio" DECIMAL(12,2),
    "monto_renta" DECIMAL(12,2),
    "periodo_renta" "PeriodoRenta",
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alquiler_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deudas_alquiler" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto_total" DECIMAL(12,2) NOT NULL,
    "monto_pagado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(12,2) NOT NULL,
    "estado" "EstadoDeudaAlquiler" NOT NULL DEFAULT 'PENDIENTE',
    "referencia_tipo" TEXT,
    "referencia_id" UUID,
    "periodo_ini" TIMESTAMP(3),
    "periodo_fin" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deudas_alquiler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abonos_alquiler" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "deuda_alquiler_id" UUID NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo_pago_id" UUID,
    "nota" TEXT,
    "creado_por" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abonos_alquiler_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alquiler_config_empleado_id_key" ON "alquiler_config"("empleado_id");

-- CreateIndex
CREATE INDEX "alquiler_config_empresa_id_idx" ON "alquiler_config"("empresa_id");

-- CreateIndex
CREATE INDEX "deudas_alquiler_empresa_id_empleado_id_idx" ON "deudas_alquiler"("empresa_id", "empleado_id");

-- CreateIndex
CREATE INDEX "deudas_alquiler_empresa_id_estado_idx" ON "deudas_alquiler"("empresa_id", "estado");

-- CreateIndex
CREATE INDEX "abonos_alquiler_empresa_id_deuda_alquiler_id_idx" ON "abonos_alquiler"("empresa_id", "deuda_alquiler_id");

-- AddForeignKey
ALTER TABLE "alquiler_config" ADD CONSTRAINT "alquiler_config_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alquiler_config" ADD CONSTRAINT "alquiler_config_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deudas_alquiler" ADD CONSTRAINT "deudas_alquiler_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deudas_alquiler" ADD CONSTRAINT "deudas_alquiler_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_alquiler" ADD CONSTRAINT "abonos_alquiler_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_alquiler" ADD CONSTRAINT "abonos_alquiler_deuda_alquiler_id_fkey" FOREIGN KEY ("deuda_alquiler_id") REFERENCES "deudas_alquiler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_alquiler" ADD CONSTRAINT "abonos_alquiler_metodo_pago_id_fkey" FOREIGN KEY ("metodo_pago_id") REFERENCES "metodos_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_alquiler" ADD CONSTRAINT "abonos_alquiler_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
