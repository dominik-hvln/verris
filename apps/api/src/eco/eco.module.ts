import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EcoPointsService } from './eco-points.service';
import { EcoReportService } from './eco-report.service';

@Module({
  imports: [PrismaModule],
  providers: [EcoPointsService, EcoReportService],
  exports: [EcoPointsService, EcoReportService],
})
export class EcoModule {}
