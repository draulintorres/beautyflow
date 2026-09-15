-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "pin_anulacion_activo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pin_anulacion_hash" TEXT;
