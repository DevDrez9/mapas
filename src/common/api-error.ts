import { HttpException } from '@nestjs/common';

/**
 * Error de la API con un código legible por máquinas.
 * Se responde como { "code": "...", "message": "..." }, el mismo formato que usa OSRM.
 */
export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super({ code, message }, status);
  }

  static badRequest(message: string, code = 'InvalidQuery'): ApiError {
    return new ApiError(400, code, message);
  }

  static notFound(message: string): ApiError {
    return new ApiError(404, 'NotFound', message);
  }
}
