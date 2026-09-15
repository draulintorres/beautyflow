import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  ArrayNotEmpty,
  Matches,
  IsDateString,
  IsEnum,
  IsIn,
  MaxLength,
} from 'class-validator';
import { CitaStatus, CitaOrigen } from '@prisma/client';

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateCitaDto {
  @IsUUID()
  clienteId: string;

  @IsUUID()
  empleadoId: string;

  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  /** "YYYY-MM-DD" */
  @IsDateString()
  fecha: string;

  /** "HH:mm" — la hora fin se calcula sumando la duración de los servicios */
  @Matches(HORA, { message: 'horaInicio debe ser HH:mm' })
  horaInicio: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  servicios: string[];

  @IsOptional()
  @IsEnum(CitaOrigen)
  origen?: CitaOrigen;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;
}

export class RescheduleCitaDto {
  @IsDateString()
  fecha: string;

  @Matches(HORA, { message: 'horaInicio debe ser HH:mm' })
  horaInicio: string;

  @IsOptional()
  @IsUUID()
  empleadoId?: string;
}

/**
 * Estados expuestos en la API (español) mapeados al enum del schema (inglés).
 */
export const ESTADO_ES_TO_ENUM: Record<string, CitaStatus> = {
  PENDIENTE: CitaStatus.SCHEDULED,
  CONFIRMADA: CitaStatus.CONFIRMED,
  EN_PROCESO: CitaStatus.IN_PROGRESS,
  FINALIZADA: CitaStatus.COMPLETED,
  CANCELADA: CitaStatus.CANCELED,
  NO_ASISTIO: CitaStatus.NO_SHOW,
};

export const ENUM_TO_ESTADO_ES: Record<CitaStatus, string> = {
  [CitaStatus.SCHEDULED]: 'PENDIENTE',
  [CitaStatus.CONFIRMED]: 'CONFIRMADA',
  [CitaStatus.IN_PROGRESS]: 'EN_PROCESO',
  [CitaStatus.COMPLETED]: 'FINALIZADA',
  [CitaStatus.CANCELED]: 'CANCELADA',
  [CitaStatus.NO_SHOW]: 'NO_ASISTIO',
};

export const ESTADOS_ES = [
  'PENDIENTE',
  'CONFIRMADA',
  'EN_PROCESO',
  'FINALIZADA',
  'CANCELADA',
  'NO_ASISTIO',
] as const;

export class ChangeEstadoDto {
  @IsString()
  @IsIn(ESTADOS_ES, {
    message:
      'estado debe ser: PENDIENTE, CONFIRMADA, EN_PROCESO, FINALIZADA, CANCELADA o NO_ASISTIO',
  })
  estado: keyof typeof ESTADO_ES_TO_ENUM;
}
