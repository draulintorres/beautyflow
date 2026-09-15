import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
  IsEnum,
  IsInt,
  IsNumber,
  Min,
  IsIn,
  IsBoolean,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LineaTipo, VentaStatus } from '@prisma/client';

// ---------- LÍNEAS DE VENTA ----------
export class LineaVentaDto {
  @IsEnum(LineaTipo)
  tipo: LineaTipo; // SERVICIO | PRODUCTO | ALIMENTO_BEBIDA

  @IsOptional()
  @IsUUID()
  servicioId?: string;

  @IsOptional()
  @IsUUID()
  productoId?: string;

  /** Empleado que ejecuta (para comisión). Requerido en servicios. */
  @IsOptional()
  @IsUUID()
  empleadoId?: string;

  @IsInt()
  @Min(1)
  cantidad: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  descuento?: number;
}

// ---------- PAGOS ----------
export class PagoVentaDto {
  @IsUUID()
  metodoPagoId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monto: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referencia?: string;
}

// ---------- PROPINA ----------
export class PropinaDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monto: number;

  @IsOptional()
  @IsUUID()
  empleadoId?: string;

  @IsOptional()
  @IsBoolean()
  generaComision?: boolean;
}

// ---------- CREAR VENTA ----------
export class CreateVentaDto {
  @IsOptional()
  @IsUUID()
  clienteId?: string; // null = walk-in anónima (no permite fiao)

  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  @IsOptional()
  @IsUUID()
  aperturaCajaId?: string;

  /**
   * Candado "una venta por cita" (ver Parte B). Si se manda, el service
   * valida que la cita no tenga ya una venta ACTIVA (no anulada) y liga
   * esta venta a ella — así "Cobrar" desde Agenda no puede duplicarse.
   * Opcional: una venta directa (no ligada a cita) simplemente no la manda.
   */
  @IsOptional()
  @IsUUID()
  citaId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => LineaVentaDto)
  lineas: LineaVentaDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  descuentoGlobal?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PropinaDto)
  propina?: PropinaDto;

  /** Pagos. Si la suma < total y hay cliente con fiao → cuenta por cobrar. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PagoVentaDto)
  pagos?: PagoVentaDto[];

  /** Si true y no se cubre el total, intenta dejar el saldo a crédito (fiao). */
  @IsOptional()
  @IsBoolean()
  permitirFiao?: boolean;
}

// ---------- ABONO A DEUDA ----------
export class AbonoDeudaDto {
  @IsUUID()
  metodoPagoId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referencia?: string;
}

// ---------- ANULAR VENTA ----------
export class AnularVentaDto {
  /** Obligatorio — queda en AuditLog (accion VOID) y en Venta.motivoAnulacion. */
  @IsString()
  @IsNotEmpty({ message: 'El motivo de la anulación es obligatorio' })
  @MaxLength(300)
  motivo: string;

  /**
   * PIN de empresa (Parte B). Solo se exige — y solo se valida — si la
   * empresa tiene pinAnulacionActivo=true; el DTO lo deja opcional porque
   * es condicional a esa config, no a la forma de la petición.
   */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  pin?: string;
}

// ---------- mapeo de estados API (español) ----------
export const VENTA_ESTADO_ES: Record<VentaStatus, string> = {
  [VentaStatus.OPEN]: 'BORRADOR',
  [VentaStatus.PAGADA]: 'PAGADA',
  [VentaStatus.ABONO_PARCIAL]: 'PARCIAL',
  [VentaStatus.PENDIENTE]: 'PENDIENTE',
  [VentaStatus.ANULADA]: 'ANULADA',
};
