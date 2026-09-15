import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { tenantContext, TenantStore } from './tenant-context';

/**
 * Resuelve el contexto de tenant desde el access token y lo propaga
 * vía AsyncLocalStorage para toda la cadena del request.
 *
 * Las rutas públicas (sin Authorization) pasan sin contexto; los guards
 * de cada ruta deciden si exigen autenticación.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const auth = req.headers.authorization;

    if (!auth?.startsWith('Bearer ')) {
      return next(); // ruta pública o sin token
    }

    const token = auth.slice(7);
    let payload: any;
    try {
      payload = this.jwt.verify(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      // Token no verificable con el secret de acceso (puede ser token de super admin).
      // Los guards de cada ruta son responsables de validarlo.
      return next();
    }

    if (!payload?.empresaId || !payload?.sub) {
      // Token sin contexto de empresa (super admin u otro token especial).
      return next();
    }

    const store: TenantStore = {
      empresaId: payload.empresaId,
      usuarioId: payload.sub,
      rol: payload.rol,
    };

    // Adjuntar al request para guards/decoradores y propagar por contexto
    (req as any).user = store;
    tenantContext.run(store, () => next());
  }
}
