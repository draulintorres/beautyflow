import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsArray,
  ArrayNotEmpty,
  Matches,
  IsDateString,
  MaxLength,
  Length,
} from 'class-validator';

/** Paso 1: solicitar OTP. El cliente se identifica por empresa + destino. */
export class SolicitarOtpDto {
  /** Slug de la empresa (el portal es por empresa). */
  @IsString()
  @IsNotEmpty()
  empresaSlug: string;

  /** Teléfono o email del cliente. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  destino: string;
}

/** Paso 2: verificar OTP y obtener tokens. */
export class VerificarOtpDto {
  @IsString()
  @IsNotEmpty()
  empresaSlug: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  destino: string;

  @IsString()
  @Length(4, 8)
  codigo: string;
}

export class PortalRefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

/** Reservar cita desde el portal (el clienteId sale del token, no del body). */
export class PortalReservarDto {
  @IsUUID()
  empleadoId: string;

  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  @IsDateString()
  fecha: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'horaInicio debe ser HH:mm' })
  horaInicio: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  servicios: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;
}
