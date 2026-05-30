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

@Module({
  controllers: [ServersController, ServersAdminController, NodeTasksAgentController],
  providers: [
    ServersService,
    NodeTasksService,
    BootstrapTokenService,
    BootstrapTokenGuard,
    ServerIdentityGuard,
    DirectAdminService,
  ],
  exports: [ServersService, DirectAdminService, ServerIdentityGuard, NodeTasksService],
})
export class ServersModule {}
