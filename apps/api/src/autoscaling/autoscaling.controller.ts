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
    @Query('ioKbps', new ParseFloatPipe({ optional: true })) ioKbps?: number,
    @Query('transferGb', new ParseFloatPipe({ optional: true })) transferGb?: number,
  ) {
    return this.pricing.estimateHourlyCost({
      cpuPercent: cpuPercent && cpuPercent > 0 ? cpuPercent : 0,
      ramMb: ramMb && ramMb > 0 ? ramMb : 0,
      ioKbps: ioKbps && ioKbps > 0 ? ioKbps : 0,
      transferGb: transferGb && transferGb > 0 ? transferGb : 0,
    });
  }
}
