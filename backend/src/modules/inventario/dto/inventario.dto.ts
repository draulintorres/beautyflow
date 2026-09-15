import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsInt,
  IsNumber,
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
  Min,
  IsEnum,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { InventarioTipo } from '@prisma/client';

// ---------- CATEGORÍA DE PRODUCTO ----------
export class CreateCategoriaProductoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateCategoriaProductoDto extends PartialType(
  CreateCategoriaProductoDto,
) {}

// ---------- PRODUCTO ----------
export class CreateProductoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  codigo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  codigoBarra?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  marca?: string;

  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @IsOptional()
  @IsEnum(InventarioTipo)
  tipo?: InventarioTipo;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unidadMedida?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costo: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  itbisPct?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockActual?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockMinimo?: number;

  @IsOptional()
  @IsBoolean()
  permiteVentaSinStock?: boolean;

  @IsOptional()
  @IsBoolean()
  generaComision?: boolean;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateProductoDto extends PartialType(CreateProductoDto) {}

// ---------- PROVEEDOR ----------
export class CreateProveedorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  rnc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contacto?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateProveedorDto extends PartialType(CreateProveedorDto) {}

// ---------- COMPRA ----------
export class CompraItemDto {
  @IsUUID()
  productoId: string;

  @IsInt()
  @Min(1)
  cantidad: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costo: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  itbis?: number;
}

export class CreateCompraDto {
  @IsUUID()
  proveedorId: string;

  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  numeroFactura?: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CompraItemDto)
  items: CompraItemDto[];
}

// ---------- AJUSTE ----------
export class AjusteInventarioDto {
  @IsUUID()
  productoId: string;

  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  /** Cantidad con signo: positivo suma, negativo resta. */
  @IsInt()
  cantidad: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  motivo: string;
}

// ---------- TRANSFERENCIA ----------
export class TransferenciaItemDto {
  @IsUUID()
  productoId: string;

  @IsInt()
  @Min(1)
  cantidad: number;
}

export class TransferenciaDto {
  @IsUUID()
  origenId: string;

  @IsUUID()
  destinoId: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => TransferenciaItemDto)
  items: TransferenciaItemDto[];
}
