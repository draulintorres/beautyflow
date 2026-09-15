-- AlterTable
ALTER TABLE "detalle_ventas" ADD COLUMN     "liquidacion_id" UUID;

-- AlterTable
ALTER TABLE "liquidaciones_comision" ADD COLUMN     "anulada_at" TIMESTAMP(3),
ADD COLUMN     "creado_por" UUID,
ADD COLUMN     "nota" TEXT;

-- CreateIndex
CREATE INDEX "detalle_ventas_liquidacion_id_idx" ON "detalle_ventas"("liquidacion_id");

-- AddForeignKey
ALTER TABLE "liquidaciones_comision" ADD CONSTRAINT "liquidaciones_comision_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_ventas" ADD CONSTRAINT "detalle_ventas_liquidacion_id_fkey" FOREIGN KEY ("liquidacion_id") REFERENCES "liquidaciones_comision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
