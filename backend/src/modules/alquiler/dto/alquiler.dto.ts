import {
  IsEnum,
  IsOptional,
  IsUUID,
  IsString,
  IsBoolean,
  IsNumber,
  Min,
  MaxLength,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  TipoCuotaAlquiler,
  FlujoDineroAlquiler,
  PeriodoRenta,
  EstadoDeudaAlquiler,
} from '@prisma/client';

/**
 * Config de un inquilino. Validación de coherencia por tipoCuota:
 * POR_SERVICIO exige montoPorServicio; RENTA_PERIODO exige montoRenta +
 * periodoRenta. Los campos del "otro" tipo son opcionales/ignorados.
 */
export class UpsertAlquilerConfigDto {
  @IsEnum(TipoCuotaAlquiler)
  tipoCuota: TipoCuotaAlquiler;

  @IsEnum(FlujoDineroAlquiler)
  flujoDinero: FlujoDineroAlquiler;

  @ValidateIf((o) => o.tipoCuota === TipoCuotaAlquiler.POR_SERVICIO)
  @IsNotEmpty({ message: 'montoPorServicio es requerido cuando tipoCuota es POR_SERVICIO' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  montoPorServicio?: number;

  @ValidateIf((o) => o.tipoCuota === TipoCuotaAlquiler.RENTA_PERIODO)
  @IsNotEmpty({ message: 'montoRenta es requerido cuando tipoCuota es RENTA_PERIODO' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  montoRenta?: number;

  @ValidateIf((o) => o.tipoCuota === TipoCuotaAlquiler.RENTA_PERIODO)
  @IsNotEmpty({ message: 'periodoRenta es requerido cuando tipoCuota es RENTA_PERIODO' })
  @IsEnum(PeriodoRenta)
  periodoRenta?: PeriodoRenta;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class RegistrarAbonoAlquilerDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;

  @IsOptional()
  @IsUUID()
  metodoPagoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nota?: string;
}

/** Params ya validados individualmente por @Query() en el controller. */
export interface ListarDeudasFiltro {
  empleadoId?: string;
  estado?: EstadoDeudaAlquiler;
}

/** Solo para el endpoint dev — crea una deuda de prueba sin depender de Pieza 2. */
export class CrearDeudaPruebaDto {
  @IsUUID()
  empleadoId: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  concepto?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  montoTotal?: number;
}
