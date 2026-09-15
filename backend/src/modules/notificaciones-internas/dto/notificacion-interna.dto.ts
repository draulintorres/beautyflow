import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CrearPruebaDto {
  @IsOptional()
  @IsString()
  titulo?: string;

  @IsOptional()
  @IsString()
  cuerpo?: string;
}

export interface CrearNotificacionInternaParams {
  usuarioId: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  referenciaTipo?: string;
  referenciaId?: string;
  /**
   * empresaId explícito, solo para cuando se llama fuera de un request
   * (ej. desde un cron de Fase 2/3, sin contexto de tenant vía
   * AsyncLocalStorage). En Fase 1 todo se dispara dentro de un request,
   * así que se resuelve del tenant context y este campo no hace falta.
   */
  empresaId?: string;
}
