import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../common/api-error';
import { config, MIN_ADMIN_TOKEN_LENGTH } from '../config';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Protege los endpoints /admin con el header "x-admin-token" (variable ADMIN_TOKEN). */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = config.adminToken;
    if (expected.length < MIN_ADMIN_TOKEN_LENGTH) {
      throw new ApiError(
        503,
        'AdminDisabled',
        `Administración deshabilitada: define ADMIN_TOKEN (mínimo ${MIN_ADMIN_TOKEN_LENGTH} caracteres) en el .env`,
      );
    }

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['x-admin-token'];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided || !timingSafeEqual(digest(provided), digest(expected))) {
      throw new ApiError(401, 'InvalidAdminToken', 'Header x-admin-token inválido o ausente');
    }
    return true;
  }
}
