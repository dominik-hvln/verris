import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EcoPointsService } from './eco-points.service.js';
import { EcoReportService } from './eco-report.service.js';
import { EcoDrzewaService } from './eco-drzewa.service.js';
import { EcoDrzewaScheduler } from './eco-drzewa.scheduler.js';
import { EcoDrzewaAdminController, EcoDrzewaController } from './eco-drzewa.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [EcoDrzewaController, EcoDrzewaAdminController],
  providers: [EcoPointsService, EcoReportService, EcoDrzewaService, EcoDrzewaScheduler],
  exports: [EcoPointsService, EcoReportService, EcoDrzewaService],
})
export class EcoModule {}
