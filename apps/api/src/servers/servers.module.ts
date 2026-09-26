import { StosWezlaService } from './stos-wezla.service.js';
import { StosWezlaAdminController } from './stos-wezla.admin.controller.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { FalaTygodniowaScheduler } from './fala-tygodniowa.scheduler.js';
import { OnboardAdminController } from './onboard.admin.controller.js';
import { BackupOffsiteService } from './backup-offsite.service.js';
import { Module } from '@nestjs/common';
import { ServersService } from './servers.service.js';
import { ServersController } from './servers.controller.js';
import { ServersAdminController } from './servers.admin.controller.js';
import { NodeTasksAgentController } from './node-tasks.agent.controller.js';
import { NodeSecurityAgentController } from './node-security.agent.controller.js';
import { NodeBackupAgentController } from './node-backup.agent.controller.js';
import { BootstrapTokenService } from './bootstrap-token.service.js';
import { BootstrapTokenGuard } from './guards/bootstrap-token.guard.js';
import { ServerIdentityGuard } from './guards/server-identity.guard.js';
import { DirectAdminService } from './directadmin.service.js';
import { NodeTasksService } from './node-tasks.service.js';
import { NodeAuditService } from './node-audit.service.js';
import { NodeStackReadinessService } from './node-stack-readiness.service.js';
import { OvhClient } from './ovh.client.js';
import { NodeDnsService } from './node-dns.service.js';
import { NodeBootstrapService } from './node-bootstrap.service.js';
import { NodeBootstrapAgentController } from './node-bootstrap.agent.controller.js';
import { NodeBootstrapAdminController } from './node-bootstrap.admin.controller.js';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';

@Module({
  imports: [PlatformSettingsModule, NotificationsModule],
  controllers: [
    ServersController,
    StosWezlaAdminController,
    OnboardAdminController,
    ServersAdminController,
    NodeTasksAgentController,
    NodeSecurityAgentController,
    NodeBackupAgentController,
    NodeBootstrapAgentController,
    NodeBootstrapAdminController,
  ],
  providers: [
    ServersService,
    StosWezlaService,
    FalaTygodniowaScheduler,
    BackupOffsiteService,
    NodeTasksService,
    NodeAuditService,
    NodeStackReadinessService,
    BootstrapTokenService,
    BootstrapTokenGuard,
    ServerIdentityGuard,
    DirectAdminService,
    OvhClient,
    NodeDnsService,
    NodeBootstrapService,
  ],
  exports: [
    ServersService,
    DirectAdminService,
    ServerIdentityGuard,
    NodeTasksService,
    NodeAuditService,
    NodeStackReadinessService,
    NodeDnsService,
  ],
})
export class ServersModule {}
