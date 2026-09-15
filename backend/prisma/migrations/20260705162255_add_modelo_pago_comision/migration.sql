-- CreateEnum
CREATE TYPE "ModeloPago" AS ENUM ('COMISION', 'SUELDO_FIJO');

-- AlterTable
ALTER TABLE "empleados" ADD COLUMN     "modelo_pago" "ModeloPago" NOT NULL DEFAULT 'COMISION',
ADD COLUMN     "sueldo_monto" DECIMAL(12,2);
