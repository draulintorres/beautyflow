/*
  Warnings:

  - Changed the type of `modulo` on the `modulos_activos` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "modulos_activos" DROP COLUMN "modulo",
ADD COLUMN     "modulo" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "modulos_activos_empresa_id_modulo_key" ON "modulos_activos"("empresa_id", "modulo");
