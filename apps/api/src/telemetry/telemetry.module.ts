import { Module } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller.js';
import { TelemetryService } from './telemetry.service.js';
import { ServerIdentityGuard } from '../servers/guards/server-identity.guard.js';

@Module({
  controllers: [TelemetryController],
  providers: [TelemetryService, ServerIdentityGuard],
  exports: [TelemetryService],
})
export class TelemetryModule {}
