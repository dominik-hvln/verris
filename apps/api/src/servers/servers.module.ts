import { Module } from '@nestjs/common';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';
import { ServersAdminController } from './servers.admin.controller';
import { NodeTasksAgentController } from './node-tasks.agent.controller';
import { BootstrapTokenService } from './bootstrap-token.service';
import { BootstrapTokenGuard } from './guards/bootstrap-token.guard';
import { ServerIdentityGuard } from './guards/server-identity.guard';
import { DirectAdminService } from './directadmin.service';
import { NodeTasksService } from './node-tasks.service';
import { NodeAuditService } from './node-audit.service';
import { NodeStackReadinessService } from './node-stack-readiness.service';
import { OvhClient } from './ovh.client';
import { NodeDnsService } from './node-dns.service';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';

@Module({
  imports: [PlatformSettingsModule],
  controllers: [ServersController, ServersAdminController, NodeTasksAgentController],
  providers: [
    ServersService,
    NodeTasksService,
    NodeAuditService,
    NodeStackReadinessService,
    BootstrapTokenService,
    BootstrapTokenGuard,
    ServerIdentityGuard,
    DirectAdminService,
    OvhClient,
    NodeDnsService,
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
