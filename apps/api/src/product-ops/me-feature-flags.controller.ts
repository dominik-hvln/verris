import { Controller, Get, HttpCode, UseGuards } from '@nestjs/common';
import { SubscriptionStatus } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ocenFlage } from './feature-flags.js';

/** N-12 — flagi funkcji ocenione dla zalogowanego klienta: `{ [klucz]: włączona }`. */
@Controller('me/feature-flags')
@UseGuards(JwtAuthGuard)
export class MeFeatureFlagsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(200)
  async moje(@CurrentUser() user: { userId: string }): Promise<Record<string, boolean>> {
    const [flagi, subs] = await Promise.all([
      this.prisma.featureFlag.findMany({
        take: 200,
        select: {
          key: true, enabledDefault: true, rolloutPercent: true, startsAt: true, endsAt: true,
          overrides: { where: { userId: user.userId }, select: { userId: true, enabled: true, expiresAt: true } },
          planOverrides: { select: { planId: true, enabled: true } },
        },
      }),
      this.prisma.subscription.findMany({
        where: { userId: user.userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] } },
        select: { planId: true },
      }),
    ]);
    const planIds = subs.map((s) => s.planId);
    const teraz = new Date();
    return Object.fromEntries(flagi.map((f) => [f.key, ocenFlage(f, user.userId, planIds, teraz)]));
  }
}
