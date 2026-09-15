-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "aviso_previo_enviado_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "minutos_aviso_cita" INTEGER NOT NULL DEFAULT 30;
