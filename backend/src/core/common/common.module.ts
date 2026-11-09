import { Global, Module } from '@nestjs/common';
import { RateLimiterService } from './rate-limiter.service';

/**
 * Global (mismo patrón que PrismaModule): RateLimiterService debe ser una
 * única instancia en memoria compartida entre login de personal,
 * /admin/login, forgot-password y el portal.
 */
@Global()
@Module({
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class CommonModule {}
