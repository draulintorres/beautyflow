import {
  IsEmail,
  IsString,
  MinLength,
  IsNotEmpty,
  MaxLength,
  IsObject,
  IsOptional,
} from 'class-validator';

export class LoginDto {
  /** Identificador de la empresa (slug). Permite emails repetidos entre empresas. */
  @IsString()
  @IsNotEmpty()
  empresaSlug: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty()
  empresaSlug: string;

  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // límite de bcrypt
  newPassword: string;
}

/** Cambio de contraseña obligatorio en el primer login (usuario ya
 * autenticado con una contraseña que otra persona le asignó) — a
 * diferencia de ResetPasswordDto, no lleva token: la sesión ya prueba
 * quién es, y no se pide la contraseña actual porque justamente esa es
 * la temporal que se está reemplazando. */
export class CambiarPasswordInicialDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72) // límite de bcrypt
  newPassword: string;
}

export class LogoutDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

// ---------- WebAuthn (login biométrico) ----------

export class WebauthnVerifyRegistrationDto {
  /** RegistrationResponseJSON crudo devuelto por @simplewebauthn/browser. */
  @IsObject()
  response: object;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceLabel?: string;
}

export class WebauthnLoginOptionsDto {
  /** credentialId (base64url) guardado en localStorage del dispositivo. */
  @IsString()
  @IsNotEmpty()
  credentialId: string;
}

export class WebauthnLoginVerifyDto {
  @IsString()
  @IsNotEmpty()
  credentialId: string;

  /** AuthenticationResponseJSON crudo devuelto por @simplewebauthn/browser. */
  @IsObject()
  response: object;
}
