import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { WnioskiService } from './wnioski.service.js';
import { WnioskiAdminController } from './wnioski.admin.controller.js';

/** PB-48 — wnioski pracowników o operację wymagającą wyższego uprawnienia. */
@Module({
  imports: [NotificationsModule, UsersModule, BillingModule],
  controllers: [WnioskiAdminController],
  providers: [WnioskiService, StaffPermissionsGuard],
})
export class WnioskiModule {}
