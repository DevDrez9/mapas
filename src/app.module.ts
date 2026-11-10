import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CoreModule } from './core/core.module';
import { HealthModule } from './health/health.module';
import { RoutingModule } from './routing/routing.module';

@Module({
  imports: [CoreModule, RoutingModule, AdminModule, HealthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
