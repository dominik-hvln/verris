import { Module } from '@nestjs/common';
import { StatusService } from './status.service';
import { StatusController } from './status.controller';
import { ProbeRunnerService } from './probe-runner.service';
import { ProbeIngestService } from './probe-ingest.service';
import { ProbeScheduler } from './probe.scheduler';
import { ProbesAdminService } from './probes-admin.service';
import { ProbesAdminController } from './probes-admin.controller';
import { ProbeIngestController } from './probe-ingest.controller';
import { MeStatusController } from './me-status.controller';
import { ServerIdentityGuard } from '../servers/guards/server-identity.guard';

@Module({
  providers: [
    StatusService,
    ProbeRunnerService,
    ProbeIngestService,
    ProbeScheduler,
    ProbesAdminService,
    ServerIdentityGuard,
  ],
  controllers: [
    StatusController,
    ProbesAdminController,
    ProbeIngestController,
    MeStatusController,
  ],
  exports: [StatusService],
})
export class StatusModule {}
