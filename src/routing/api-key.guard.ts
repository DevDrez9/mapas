import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../common/api-error';
import { ApiKeyContext, ApiKeysService } from '../core/api-keys.service';

export type RequestWithApiKey = Request & { apiKey?: ApiKeyContext };

/** Exige una API key válida en el header "x-api-key" (o "Authorization: Bearer <key>"). */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithApiKey>();
    const rawKey = extractKey(req);
    if (!rawKey) {
      throw new ApiError(401, 'MissingApiKey', 'Envía tu API key en el header x-api-key');
    }

    const ctx = await this.apiKeys.validate(rawKey);
    if (!ctx) {
      throw new ApiError(
        401,
        'InvalidApiKey',
        'API key inválida o revocada, o el proyecto está desactivado',
      );
    }

    req.apiKey = ctx;
    this.apiKeys.touch(ctx.apiKeyId);
    return true;
  }
}

function extractKey(req: Request): string | null {
  const header = req.headers['x-api-key'];
  const direct = Array.isArray(header) ? header[0] : header;
  if (direct?.trim()) return direct.trim();

  const auth = req.headers.authorization;
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    return token || null;
  }
  return null;
}
