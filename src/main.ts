// Debe ir primero: carga el .env antes de leer la configuración.
import './load-env';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { config, MIN_ADMIN_TOKEN_LENGTH } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  // Detrás de Caddy/Nginx, para que la IP del cliente sea la real.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // Permite llamar a la API desde páginas web (la autenticación es por API key, no por cookies).
  app.enableCors({ origin: true, allowedHeaders: ['x-api-key', 'authorization', 'content-type'] });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');

  logger.log(`API escuchando en el puerto ${config.port}`);
  logger.log(`OSRM auto: ${config.osrm.carUrl} · OSRM moto: ${config.osrm.motoUrl}`);
  if (config.adminToken.length < MIN_ADMIN_TOKEN_LENGTH) {
    logger.warn(
      `ADMIN_TOKEN no está definido (mínimo ${MIN_ADMIN_TOKEN_LENGTH} caracteres): /admin está deshabilitado`,
    );
  }
}

void bootstrap();
