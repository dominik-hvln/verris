import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { AdminDashboardController } from './admin-dashboard.controller.js';
import { AdminDashboardService } from './admin-dashboard.service.js';
import { PulpityRolAdminController } from './pulpity-rol.admin.controller.js';
import { PulpityRolService } from './pulpity-rol.service.js';

@Module({
  // F3.9 — pulpit finansów korzysta z „Nieudanych płatności” (RozliczeniaOperatoraService, BillingModule).
  imports: [PrismaModule, BillingModule],
  controllers: [AdminDashboardController, PulpityRolAdminController],
  providers: [AdminDashboardService, PulpityRolService],
})
export class AdminDashboardModule {}
