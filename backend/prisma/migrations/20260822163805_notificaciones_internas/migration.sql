-- CreateTable
CREATE TABLE "notificaciones_internas" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "referencia_tipo" TEXT,
    "referencia_id" UUID,
    "leida_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_internas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_internas_empresa_id_usuario_id_leida_at_idx" ON "notificaciones_internas"("empresa_id", "usuario_id", "leida_at");

-- CreateIndex
CREATE INDEX "notificaciones_internas_empresa_id_usuario_id_created_at_idx" ON "notificaciones_internas"("empresa_id", "usuario_id", "created_at");

-- AddForeignKey
ALTER TABLE "notificaciones_internas" ADD CONSTRAINT "notificaciones_internas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones_internas" ADD CONSTRAINT "notificaciones_internas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
