import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { OsrmClient } from './osrm.client';
import { RoutingController } from './routing.controller';

@Module({
  controllers: [RoutingController],
  providers: [OsrmClient, ApiKeyGuard],
  exports: [OsrmClient],
})
export class RoutingModule {}
