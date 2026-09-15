import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
} from 'class-validator';

export class PreviewQueryDto {
  @IsOptional() @IsDateString() desde?: string;
  @IsOptional() @IsDateString() hasta?: string;
  @IsOptional() @IsUUID()      sucursalId?: string;
  @IsOptional() @IsUUID()      empleadoId?: string;
}

export class CerrarCorteDto {
  @IsDateString()              desde: string;
  @IsDateString()              hasta: string;
  @IsOptional() @IsUUID()      sucursalId?: string;
  @IsOptional() @IsString()    nota?: string;
  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  empleadoIds?: string[];
}

export class ListarQueryDto {
  @IsOptional() @IsDateString() desde?: string;
  @IsOptional() @IsDateString() hasta?: string;
  @IsOptional() @IsUUID()       empleadoId?: string;
  @IsOptional() @IsString()     pagada?: string; // 'true' | 'false'
}