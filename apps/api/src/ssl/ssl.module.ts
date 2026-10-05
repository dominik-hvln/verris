import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CryptoModule } from '../common/crypto/crypto.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';
import { ServersModule } from '../servers/servers.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { DomainsModule } from '../domains/domains.module.js';
import { SslController } from './ssl.controller.js';
import { SslAdminController } from './ssl-admin.controller.js';
import { SslService } from './ssl.service.js';

/** G-08 — sprzedaż płatnych certyfikatów SSL (DV) przez resellera rejestratora domen. */
@Module({
  imports: [ConfigModule, CryptoModule, BillingModule, PlatformSettingsModule, ServersModule, NotificationsModule, DomainsModule],
  controllers: [SslController, SslAdminController],
  providers: [SslService],
})
export class SslModule {}
