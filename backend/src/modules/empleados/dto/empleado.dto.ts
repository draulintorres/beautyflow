import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  IsUUID,
  IsArray,
  IsInt,
  IsEmail,
  Min,
  Max,
  Matches,
  IsEnum,
  IsNumber,
  ValidateNested,
  ArrayUnique,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { BloqueoTipo, ComisionBase, ModeloPago } from '@prisma/client';

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/; // "HH:mm" 24h

export class CreateEmpleadoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  puesto?: string;

  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  /** Usuario para iniciar sesión (opcional: un empleado puede no tener login). */
  @IsOptional()
  @IsUUID()
  usuarioId?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsBoolean()
  participaAgenda?: boolean;
}

export class UpdateEmpleadoDto extends PartialType(CreateEmpleadoDto) {
  @IsOptional()
  @IsBoolean()
  enVacaciones?: boolean;

  @IsOptional()
  @IsEnum(ModeloPago)
  modeloPago?: ModeloPago;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sueldoMonto?: number;
}

export class CrearAccesoDto {
  @IsEmail()
  email: string;

  @IsUUID()
  rolId: string;
}

export class SetEspecialidadesDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  servicioIds: string[];
}

export class HorarioItemDto {
  @IsInt()
  @Min(0)
  @Max(6)
  diaSemana: number; // 0=dom ... 6=sab

  @Matches(HORA, { message: 'horaInicio debe ser HH:mm' })
  horaInicio: string;

  @Matches(HORA, { message: 'horaFin debe ser HH:mm' })
  horaFin: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class SetHorariosDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HorarioItemDto)
  horarios: HorarioItemDto[];
}

export class CreateBloqueoDto {
  @IsEnum(BloqueoTipo)
  tipo: BloqueoTipo;

  @IsDateString()
  inicio: string;

  @IsDateString()
  fin: string;

  @IsOptional()
  @IsBoolean()
  recurrente?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  diaSemana?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  motivo?: string;
}

export class ComisionOverrideDto {
  @IsUUID()
  servicioId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  pct: number;
}

export class SetComisionUiDto {
  @IsEnum(ModeloPago)
  modeloPago: ModeloPago;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sueldoMonto?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  pctBase?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComisionOverrideDto)
  overrides?: ComisionOverrideDto[];
}

export class ComisionConfigItemDto {
  @IsEnum(ComisionBase)
  base: ComisionBase;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentaje?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  montoFijo?: number;

  /** Excepción para un servicio específico (manda sobre la general). */
  @IsOptional()
  @IsUUID()
  servicioId?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class SetComisionesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComisionConfigItemDto)
  comisiones: ComisionConfigItemDto[];
}
