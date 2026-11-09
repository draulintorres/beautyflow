import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 429 con tiempo de espera explícito. HttpException de Nest no tiene un
 * campo estándar para cabeceras extra, así que AllExceptionsFilter
 * reconoce este tipo concreto para agregar Retry-After a la respuesta.
 */
export class TooManyRequestsException extends HttpException {
  constructor(
    public readonly retryAfterSeconds: number,
    message: string,
  ) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
