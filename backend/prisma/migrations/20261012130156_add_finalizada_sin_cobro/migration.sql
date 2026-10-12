-- AlterTable
ALTER TABLE "citas" ADD COLUMN IF NOT EXISTS "finalizada_sin_cobro" BOOLEAN NOT NULL DEFAULT false;
