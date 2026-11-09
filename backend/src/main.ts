import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './core/common/filters/all-exceptions.filter';
import { resolveTrustProxyHops } from './core/common/trust-proxy.util';

async function bootstrap() {
  // Se valida ANTES de crear la app (que ya conecta a la base de datos en
  // su propio onModuleInit): un TRUST_PROXY_HOPS inválido debe tumbar el
  // arranque sin depender de que la base esté disponible.
  const trustProxyHops = resolveTrustProxyHops();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.set('trust proxy', trustProxyHops);

  app.use(helmet());
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? true,
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // elimina props no declaradas en el DTO
      forbidNonWhitelisted: true, // rechaza props desconocidas
      transform: true, // convierte tipos según el DTO
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`Estixa API en http://localhost:${port}/api/v1`, 'Bootstrap');
}
bootstrap().catch((err) => {
  Logger.error(err.message, undefined, 'Bootstrap');
  process.exit(1);
});