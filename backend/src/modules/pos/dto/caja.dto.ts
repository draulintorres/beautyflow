import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsInt,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

// ---------- MÉTODOS DE PAGO ----------
export class CreateMetodoPagoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre: string;

  @IsOptional()
  @IsBoolean()
  esEfectivo?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateMetodoPagoDto extends PartialType(CreateMetodoPagoDto) {}

// ---------- CAJA ----------
export class CreateCajaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre: string;

  @IsUUID()
  sucursalId: string;
}

export class AbrirCajaDto {
  @IsUUID()
  cajaId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  montoInicial: number;
}

export class CerrarCajaDto {
  /** Efectivo contado físicamente al cierre (para el arqueo). */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  efectivoContado: number;
}
