import { Module } from '@nestjs/common';
import { StatusService } from './status.service.js';
import { StatusController } from './status.controller.js';
import { ProbeRunnerService } from './probe-runner.service.js';
import { ProbeIngestService } from './probe-ingest.service.js';
import { ProbeScheduler } from './probe.scheduler.js';
import { ProbesAdminService } from './probes-admin.service.js';
import { ProbesAdminController } from './probes-admin.controller.js';
import { ProbeIngestController } from './probe-ingest.controller.js';
import { MeStatusController } from './me-status.controller.js';
import { ServerIdentityGuard } from '../servers/guards/server-identity.guard.js';
import { StatusWebhookService } from './status-webhook.service.js';

@Module({
  providers: [
    StatusService,
    ProbeRunnerService,
    ProbeIngestService,
    ProbeScheduler,
    ProbesAdminService,
    ServerIdentityGuard,
    StatusWebhookService,
  ],
  controllers: [
    StatusController,
    ProbesAdminController,
    ProbeIngestController,
    MeStatusController,
  ],
  exports: [StatusService, StatusWebhookService],
})
export class StatusModule {}
