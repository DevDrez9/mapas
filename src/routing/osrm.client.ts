import { Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { config } from '../config';
import type { ParsedRequest, VehicleProfile } from './osrm-request';

export interface OsrmResponse {
  status: number;
  body: unknown;
}

/** Cliente HTTP hacia los contenedores OSRM (uno por perfil de vehículo). */
@Injectable()
export class OsrmClient {
  private readonly logger = new Logger(OsrmClient.name);

  baseUrl(profile: VehicleProfile): string {
    return profile === 'moto' ? config.osrm.motoUrl : config.osrm.carUrl;
  }

  async send(request: ParsedRequest): Promise<OsrmResponse> {
    // OSRM ignora el nombre del perfil en la URL: el vehículo lo define el contenedor elegido.
    const url =
      `${this.baseUrl(request.profile)}/${request.service}/v1/driving/${request.coordinatesPath}` +
      (request.query ? `?${request.query}` : '');

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(config.osrm.timeoutMs),
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      const err = error as Error;
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new ApiError(504, 'UpstreamTimeout', 'El motor de rutas tardó demasiado en responder');
      }
      this.logger.error(`OSRM (${request.profile}) no responde: ${err.message}`);
      throw new ApiError(
        503,
        'EngineUnavailable',
        `El motor de rutas para "${request.profile}" no está disponible`,
      );
    }

    const text = await response.text();
    try {
      return { status: response.status, body: JSON.parse(text) as unknown };
    } catch {
      this.logger.error(`Respuesta no JSON de OSRM (${response.status}): ${text.slice(0, 200)}`);
      throw new ApiError(502, 'UpstreamError', 'Respuesta inválida del motor de rutas');
    }
  }

  /** true si el contenedor del perfil responde. */
  async ping(profile: VehicleProfile): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl(profile)}/nearest/v1/driving/-68.1193,-16.4897`, {
        signal: AbortSignal.timeout(3_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
