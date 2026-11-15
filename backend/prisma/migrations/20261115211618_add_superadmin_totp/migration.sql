-- AlterTable
ALTER TABLE "super_admins" ADD COLUMN     "totp_activo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totp_secret_cifrado" TEXT,
ADD COLUMN     "totp_ultimo_paso" INTEGER;

-- CreateTable
CREATE TABLE "super_admin_codigos_respaldo" (
    "id" UUID NOT NULL,
    "super_admin_id" UUID NOT NULL,
    "codigo_hash" TEXT NOT NULL,
    "usado_en" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admin_codigos_respaldo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "super_admin_codigos_respaldo_super_admin_id_idx" ON "super_admin_codigos_respaldo"("super_admin_id");

-- AddForeignKey
ALTER TABLE "super_admin_codigos_respaldo" ADD CONSTRAINT "super_admin_codigos_respaldo_super_admin_id_fkey" FOREIGN KEY ("super_admin_id") REFERENCES "super_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

