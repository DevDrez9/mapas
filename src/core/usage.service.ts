import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface UsageEntry {
  projectId: string;
  apiKeyId: string | null;
  service: string;
  profile: string;
  status: number;
  latencyMs: number;
  units: number;
}

/** Guarda el registro de uso de cada petición sin hacer esperar al cliente. */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  record(entry: UsageEntry): void {
    this.prisma.requestLog
      .create({ data: entry })
      .catch((error: Error) =>
        this.logger.warn(`No se pudo guardar el registro de uso: ${error.message}`),
      );
  }
}
