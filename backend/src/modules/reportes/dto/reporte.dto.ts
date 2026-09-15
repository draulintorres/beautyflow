import { IsOptional, IsDateString, IsIn, IsUUID } from 'class-validator';

export const FORMATOS = ['json', 'pdf', 'excel', 'csv'] as const;
export type FormatoReporte = (typeof FORMATOS)[number];

/** Filtros comunes a la mayoría de reportes. */
export class ReporteQueryDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  @IsOptional()
  @IsUUID()
  empleadoId?: string;

  @IsOptional()
  @IsUUID()
  productoId?: string;

  @IsOptional()
  @IsIn(FORMATOS)
  formato?: FormatoReporte;
}

/** Estructura tabular intermedia que el exportador convierte a PDF/Excel/CSV. */
export interface ReporteTabular {
  titulo: string;
  subtitulo?: string;
  columnas: { key: string; label: string; tipo?: 'texto' | 'numero' | 'dinero' | 'fecha' }[];
  filas: Record<string, any>[];
  totales?: Record<string, any>;
  empresa?: {
    nombre: string;
    sucursal?: string;
    telefono?: string;
    direccion?: string;
    rnc?: string;
  };
  generadoPor?: string;
}
