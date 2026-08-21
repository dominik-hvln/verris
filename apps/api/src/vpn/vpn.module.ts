import { Module } from '@nestjs/common';
import { VpnService } from './vpn.service';
import { VpnAdminController } from './vpn.admin.controller';
import { VpnSyncController } from './vpn.sync.controller';

/** ETAP 8 — WireGuard VPN for internal panels (admin/staff). */
@Module({
  controllers: [VpnAdminController, VpnSyncController],
  providers: [VpnService],
  exports: [VpnService],
})
export class VpnModule {}
