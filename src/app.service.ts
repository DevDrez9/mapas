import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo() {
    return {
      name: 'saas-rutas',
      status: 'ok',
      profiles: ['car', 'moto'],
      services: ['route', 'table', 'trip', 'nearest', 'match'],
      usage: 'GET /v1/{service}/{car|moto}/{lon,lat;lon,lat...} con el header x-api-key',
      health: '/health',
      attribution: '© OpenStreetMap contributors',
    };
  }
}
