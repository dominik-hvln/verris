import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EcoPointsService } from './eco-points.service';

@Module({
  imports: [PrismaModule],
  providers: [EcoPointsService],
  exports: [EcoPointsService],
})
export class EcoModule {}
