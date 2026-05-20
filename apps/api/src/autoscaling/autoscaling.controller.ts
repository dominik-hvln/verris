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
    @Query('ramMb', new ParseFloatPipe({ optional: true })) ramMb?: number,
    @Query('diskMb', new ParseFloatPipe({ optional: true })) diskMb?: number,
  ) {
    return this.pricing.estimateHourlyCost({
      cpuPercent: cpuPercent && cpuPercent > 0 ? cpuPercent : 0,
      ramMb: ramMb && ramMb > 0 ? ramMb : 0,
      diskMb: diskMb && diskMb > 0 ? diskMb : 0,
    });
  }
}
