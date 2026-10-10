import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ZadaniaWTleService } from './zadania-w-tle.service.js';
import { ZadaniaWTleController } from './zadania-w-tle.controller.js';

/** F2.8 (OJ-01) — rejestr przebiegów zadań w tle (@Cron) i widok w panelu operatora. */
@Module({
  imports: [DiscoveryModule],
  providers: [ZadaniaWTleService],
  controllers: [ZadaniaWTleController],
})
export class ZadaniaWTleModule {}
