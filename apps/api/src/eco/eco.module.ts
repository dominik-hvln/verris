import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EcoPointsService } from './eco-points.service.js';
import { EcoReportService } from './eco-report.service.js';

@Module({
  imports: [PrismaModule],
  providers: [EcoPointsService, EcoReportService],
  exports: [EcoPointsService, EcoReportService],
})
export class EcoModule {}
