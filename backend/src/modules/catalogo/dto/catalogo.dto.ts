import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  IsUUID,
  IsInt,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
  Min,
  Max,
  MaxLength,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { Vertical } from '@prisma/client';

// ---------- CATEGORÍAS ----------
export class CreateCategoriaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  icono?: string;

  @IsOptional()
  @IsEnum(Vertical)
  vertical?: Vertical;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateCategoriaDto extends PartialType(CreateCategoriaDto) {}

// ---------- SERVICIOS ----------
export class CreateServicioDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @IsUUID()
  categoriaId: string;

  @IsOptional()
  @IsEnum(Vertical)
  vertical?: Vertical;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  duracionMin: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  comisionPct?: number;

  @IsOptional()
  @IsBoolean()
  requiereCabina?: boolean;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateServicioDto extends PartialType(CreateServicioDto) {}

// ---------- PAQUETES ----------
export class PaqueteServicioItemDto {
  @IsUUID()
  servicioId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  cantidad?: number;
}

export class CreatePaqueteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio: number;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PaqueteServicioItemDto)
  servicios: PaqueteServicioItemDto[];

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdatePaqueteDto extends PartialType(CreatePaqueteDto) {}
