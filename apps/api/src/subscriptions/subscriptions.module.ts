import { forwardRef, Module } from '@nestjs/common';
import { ServersModule } from '../servers/servers.module';
import { BillingModule } from '../billing/billing.module';
import { NodeSelectorService } from './node-selector.service';
import { ProvisioningService } from './provisioning.service';
import { ProvisioningQueueService } from './provisioning-queue.service';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsAdminController } from './subscriptions.admin.controller';
import { UserServicesController } from './services.controller';
import { RenewalScheduler } from './renewal.scheduler';
import { MigrationOrchestratorService } from './migration-orchestrator.service';
import { MigrationWorkerScheduler } from './migration-worker.scheduler';

@Module({
  imports: [ServersModule, forwardRef(() => BillingModule)],
  providers: [
    SubscriptionsService,
    ProvisioningService,
    ProvisioningQueueService,
    NodeSelectorService,
    RenewalScheduler,
    MigrationOrchestratorService,
    MigrationWorkerScheduler,
  ],
  controllers: [
    SubscriptionsController,
    SubscriptionsAdminController,
    UserServicesController,
  ],
  exports: [
    SubscriptionsService,
    ProvisioningService,
    ProvisioningQueueService,
    MigrationOrchestratorService,
  ],
})
export class SubscriptionsModule {}
