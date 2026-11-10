import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../core/prisma.service';
import { OsrmClient } from '../routing/osrm.client';

/** Estado de la API y sus dependencias. Público (sin API key). */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly osrm: OsrmClient,
  ) {}

  @Get()
  async check(@Res() res: Response): Promise<void> {
    const [database, car, moto] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(
        () => true,
        () => false,
      ),
      this.osrm.ping('car'),
      this.osrm.ping('moto'),
    ]);

    const healthy = database && car && moto;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      database,
      engines: { car, moto },
    });
  }
}
