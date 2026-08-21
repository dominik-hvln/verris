import { Controller, Get, ParseFloatPipe, Query } from '@nestjs/common';
import { AutoscalingPricingService } from './autoscaling-pricing.service';

/**
 * Public endpoints for the autoscaling cost calculator and pricing page.
 * No auth required — these are catalog data.
 */
@Controller('autoscaling')
export class AutoscalingController {
  constructor(private readonly pricing: AutoscalingPricingService) {}

  @Get('pricing')
  list() {
    return this.pricing.listPublic();
  }

  @Get('estimate')
  estimate(
    @Query('cpuPercent', new ParseFloatPipe({ optional: true })) cpuPercent?: number,
    @Query('ramGb', new ParseFloatPipe({ optional: true })) ramGb?: number,
    @Query('diskGb', new ParseFloatPipe({ optional: true })) diskGb?: number,
  ) {
    return this.pricing.estimateHourlyCost({
      cpuPercent: cpuPercent && cpuPercent > 0 ? cpuPercent : 0,
      ramGb: ramGb && ramGb > 0 ? ramGb : 0,
      diskGb: diskGb && diskGb > 0 ? diskGb : 0,
    });
  }
}
