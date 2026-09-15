-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "hora_recordatorio" TEXT NOT NULL DEFAULT '07:00',
ADD COLUMN     "ultimo_recordatorio_matutino" TIMESTAMP(3);
