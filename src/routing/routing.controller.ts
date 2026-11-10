import { Controller, Get, HttpException, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiError } from '../common/api-error';
import { config } from '../config';
import { UsageService } from '../core/usage.service';
import { ApiKeyGuard, type RequestWithApiKey } from './api-key.guard';
import { type ParsedRequest, parseRequest } from './osrm-request';
import { OsrmClient } from './osrm.client';
import { RateLimiter } from './rate-limiter';

function isOsrmOk(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as { code?: unknown }).code === 'Ok';
}

/**
 * API pública de rutas. Misma sintaxis que OSRM, con el perfil "car" o "moto":
 *   GET /v1/route/moto/-68.1193,-16.4897;-68.15,-16.5?steps=true
 *   GET /v1/table/car/<coordenadas>?sources=0&destinations=1;2
 */
@Controller('v1')
@UseGuards(ApiKeyGuard)
export class RoutingController {
  private readonly limiter = new RateLimiter(config.rateLimit.perSecond, config.rateLimit.burst);

  constructor(
    private readonly osrm: OsrmClient,
    private readonly usage: UsageService,
  ) {}

  @Get(':service/:profile/:coordinates')
  async handle(
    @Param('service') service: string,
    @Param('profile') profile: string,
    @Param('coordinates') coordinates: string,
    @Query() query: Record<string, unknown>,
    @Req() req: RequestWithApiKey,
    @Res() res: Response,
  ): Promise<void> {
    const key = req.apiKey;
    if (!key) throw new ApiError(401, 'MissingApiKey', 'Envía tu API key en el header x-api-key');

    const started = Date.now();
    const limit = this.limiter.consume(key.apiKeyId, started);
    res.setHeader('X-RateLimit-Limit', String(limit.limit));
    res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
    if (!limit.allowed) {
      throw new ApiError(
        429,
        'RateLimited',
        `Demasiadas peticiones: máximo ${limit.limit} por segundo por API key`,
        { 'Retry-After': String(limit.retryAfterSeconds) },
      );
    }

    let parsed: ParsedRequest | undefined;
    try {
      parsed = parseRequest(service, profile, coordinates, query);
      const result = await this.osrm.send(parsed);
      const units = result.status === 200 && isOsrmOk(result.body) ? parsed.units : 0;

      this.usage.record({
        projectId: key.projectId,
        apiKeyId: key.apiKeyId,
        service: parsed.service,
        profile: parsed.profile,
        status: result.status,
        latencyMs: Date.now() - started,
        units,
      });

      res.setHeader('X-Profile', parsed.profile);
      res.setHeader('X-Units', String(units));
      res.status(result.status).json(result.body);
    } catch (error) {
      this.usage.record({
        projectId: key.projectId,
        apiKeyId: key.apiKeyId,
        service: parsed?.service ?? service.slice(0, 20),
        profile: parsed?.profile ?? profile.slice(0, 20),
        status: error instanceof HttpException ? error.getStatus() : 500,
        latencyMs: Date.now() - started,
        units: 0,
      });
      throw error;
    }
  }
}
