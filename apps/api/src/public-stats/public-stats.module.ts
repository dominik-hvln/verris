import { Module } from '@nestjs/common';
import { PublicStatsController } from './public-stats.controller';

/** O-5 — public trust-signal stats. */
@Module({
  controllers: [PublicStatsController],
})
export class PublicStatsModule {}
