import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateCabinaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @IsUUID()
  sucursalId: string;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

export class UpdateCabinaDto extends PartialType(CreateCabinaDto) {}
