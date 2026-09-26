import { Module } from '@nestjs/common';
import { VpnService } from './vpn.service.js';
import { VpnAdminController } from './vpn.admin.controller.js';
import { VpnSyncController } from './vpn.sync.controller.js';

/** ETAP 8 — WireGuard VPN for internal panels (admin/staff). */
@Module({
  controllers: [VpnAdminController, VpnSyncController],
  providers: [VpnService],
  exports: [VpnService],
})
export class VpnModule {}
