-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "anulada_at" TIMESTAMP(3),
ADD COLUMN     "motivo_anulacion" TEXT;
