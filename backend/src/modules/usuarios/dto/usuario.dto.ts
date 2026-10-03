import {
  IsString,
  IsOptional,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUsuarioDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsUUID()
  rolId?: string;
}

export class ResetUsuarioPasswordDto {
  /** Nueva contraseña. Si no se envía, se genera una temporal y se exige cambio. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword?: string;
}
