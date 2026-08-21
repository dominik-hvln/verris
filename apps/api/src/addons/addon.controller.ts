import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/guards/rate-limit.guard';
import { AddonService } from './addon.service';

@Controller('addons')
@UseGuards(JwtAuthGuard)
export class AddonController {
  constructor(private readonly addons: AddonService) {}

  @Get()
  overview(@CurrentUser() user: { userId: string }) {
    return this.addons.overview(user.userId);
  }

  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'addons:purchase' })
  @Post('purchase')
  @HttpCode(200)
  purchase(
    @CurrentUser() user: { userId: string },
    @Body() body: { slug: string; subscriptionId?: string },
  ) {
    return this.addons.purchase(user.userId, body.slug, body.subscriptionId);
  }
}
