import { Module } from '@nestjs/common';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';
import { ServersAdminController } from './servers.admin.controller';
import { BootstrapTokenService } from './bootstrap-token.service';
import { BootstrapTokenGuard } from './guards/bootstrap-token.guard';
import { ServerIdentityGuard } from './guards/server-identity.guard';
import { DirectAdminService } from './directadmin.service';

@Module({
  controllers: [ServersController, ServersAdminController],
  providers: [
    ServersService,
    BootstrapTokenService,
    BootstrapTokenGuard,
    ServerIdentityGuard,
    DirectAdminService,
  ],
  exports: [ServersService, DirectAdminService, ServerIdentityGuard],
})
export class ServersModule {}
