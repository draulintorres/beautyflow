import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
  IsNumber,
  IsArray,
  IsEnum,
  Min,
  Max,
  IsInt,
  MaxLength,
  ArrayUnique,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Vertical, ComisionFiaoPolitica } from '@prisma/client';

/**
 * Actualización parcial de la empresa (el tenant del usuario autenticado).
 * Todos los campos son opcionales: solo se modifica lo enviado.
 */
export class UpdateEmpresaDto {
  // ---- Datos generales ----
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre del negocio no puede quedar vacío' })
  @MaxLength(150)
  nombre?: string;

  /**
   * RNC o cédula del salón. Sin formato fiscal estricto a propósito: en RD
   * conviven RNC (9 dígitos) y cédula (11), y no queremos rechazar datos
   * reales del dueño por un regex que no cubra ambos. Solo trim + longitud.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rnc?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;

  /** Objeto libre: { instagram, facebook, tiktok, ... } */
  @IsOptional()
  redes?: Record<string, string>;

  // ---- Configuración ----
  @IsOptional()
  @IsString()
  @MaxLength(3)
  moneda?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  itbisPct?: number;

  @IsOptional()
  @IsBoolean()
  permiteFiao?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  limiteCreditoDefault?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  diasVencimiento?: number;

  @IsOptional()
  @IsEnum(ComisionFiaoPolitica)
  comisionFiaoPolitica?: ComisionFiaoPolitica;

  // ---- Segmentación ----
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  umbralVipMonto?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  umbralFrecuenteVisitas?: number;

  // ---- Verticales activas ----
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Vertical, { each: true })
  verticales?: Vertical[];

  // ---- Notificaciones ----
  /** Hora del recordatorio matutino, formato "HH:mm" 24h, en zona RD. */
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'horaRecordatorio debe tener formato HH:mm (24h), ej. "07:00"',
  })
  horaRecordatorio?: string;

  /** Minutos antes de cada cita en que se envía el aviso a la campana. */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  minutosAvisoCita?: number;

  // ---- Candado de PIN para anular ventas (Parte B) ----
  @IsOptional()
  @IsBoolean()
  pinAnulacionActivo?: boolean;

  /**
   * PIN en texto plano — solo de paso: el servicio lo hashea con bcrypt
   * antes de guardarlo y nunca lo persiste ni lo audita tal cual. Se manda
   * únicamente para DEFINIRLO o CAMBIARLO; se omite si no se quiere tocar.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4,8}$/, {
    message: 'El PIN debe ser numérico, de 4 a 8 dígitos',
  })
  pinAnulacion?: string;
}
