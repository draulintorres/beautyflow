import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  IsEmail,
  IsDateString,
  IsNumber,
  IsIn,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export const ETIQUETAS = [
  'NUEVO',
  'FRECUENTE',
  'VIP',
  'MOROSO',
  'CUMPLEANOS',
] as const;
export type ClienteEtiqueta = (typeof ETIQUETAS)[number];

export class CreateClienteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  apellido?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsDateString()
  fechaNacimiento?: string;

  @IsOptional()
  @IsIn(['M', 'F', 'OTRO'])
  sexo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cedula?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  alergias?: string;

  // ---- Crédito / Fiao ----
  @IsOptional()
  @IsBoolean()
  permiteFiao?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  limiteCredito?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateClienteDto extends PartialType(CreateClienteDto) {}
