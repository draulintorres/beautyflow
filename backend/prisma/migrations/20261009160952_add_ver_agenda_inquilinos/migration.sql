-- AlterTable
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "ver_agenda_inquilinos" BOOLEAN NOT NULL DEFAULT false;
