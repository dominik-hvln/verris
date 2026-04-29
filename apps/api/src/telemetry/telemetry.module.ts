import { Module } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { ServerIdentityGuard } from '../servers/guards/server-identity.guard';

@Module({
  controllers: [TelemetryController],
  providers: [TelemetryService, ServerIdentityGuard],
  exports: [TelemetryService],
})
export class TelemetryModule {}
