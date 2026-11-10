import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiError } from './api-error';

const DEFAULT_CODES: Record<number, string> = {
  400: 'InvalidQuery',
  401: 'InvalidApiKey',
  403: 'Forbidden',
  404: 'NotFound',
  405: 'MethodNotAllowed',
  413: 'PayloadTooLarge',
  429: 'RateLimited',
};

/** Convierte cualquier error en una respuesta { code, message } consistente. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ApiError) {
      for (const [name, value] of Object.entries(exception.headers)) {
        res.setHeader(name, value);
      }
      res
        .status(exception.getStatus())
        .json({ code: exception.code, message: exception.message });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      let message = exception.message;
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const raw = (body as { message: unknown }).message;
        message = Array.isArray(raw) ? raw.join('; ') : String(raw);
      }
      res
        .status(status)
        .json({ code: DEFAULT_CODES[status] ?? 'Error', message });
      return;
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    res
      .status(500)
      .json({ code: 'InternalError', message: 'Error interno del servidor' });
  }
}
