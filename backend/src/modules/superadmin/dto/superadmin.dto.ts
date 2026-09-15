import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsEnum,
  IsNumber,
  IsInt,
  IsBoolean,
  IsArray,
  IsUUID,
  Min,
  MinLength,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { PlanType, Vertical } from '@prisma/client';

// ---------- AUTH ----------
export class SuperAdminLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

// ---------- EMPRESAS ----------
export class CrearEmpresaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  slug: string;

  @IsOptional()
  @IsArray()
  @IsEnum(Vertical, { each: true })
  verticales?: Vertical[];

  @IsUUID()
  planId: string;

  // Datos del OWNER inicial
  @IsString()
  @IsNotEmpty()
  ownerNombre: string;

  @IsEmail()
  ownerEmail: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  ownerPassword?: string;
}

export class EditarEmpresaDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsUUID()
  planId?: string;
}

// ---------- PLANES ----------
export class CrearPlanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre: string;

  @IsEnum(PlanType)
  tipo: PlanType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio: number;

  /** null = ilimitado */
  @IsOptional()
  @IsInt()
  @Min(0)
  maxUsuarios?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxSucursales?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxEmpleados?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modulos?: string[];

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsInt()
  orden?: number;
}

export class UpdatePlanDto extends PartialType(CrearPlanDto) {}

// ---------- SUSCRIPCIÓN / PLAN ----------
export class CambiarPlanDto {
  @IsUUID()
  planId: string;
}

export class ToggleModuloDto {
  @IsString()
  @IsNotEmpty()
  modulo: string;

  @IsBoolean()
  activo: boolean;
}

export class RegistrarPagoSaaSDto {
  @IsUUID()
  facturaId: string;

  @IsOptional()
  @IsDateString()
  fechaPago?: string;
}
