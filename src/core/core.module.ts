import { Global, Module } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { PrismaService } from './prisma.service';
import { UsageService } from './usage.service';

/** Servicios compartidos por toda la API: base de datos, API keys y registro de uso. */
@Global()
@Module({
  providers: [PrismaService, ApiKeysService, UsageService],
  exports: [PrismaService, ApiKeysService, UsageService],
})
export class CoreModule {}
