import { Controller, Get, HttpCode, UseGuards } from '@nestjs/common';
import { SubscriptionStatus } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ocenFlage } from './feature-flags.js';
import { ConfigService } from '@nestjs/config';
import { funkcjaDlaUzytkownika } from '../common/funkcje-testowe.js';

/**
 * N-12 — flagi funkcji ocenione dla zalogowanego klienta: `{ [klucz]: włączona }`.
 * Plus `vps` i `resellerMarkup` z env API (FEATURE_* / FEATURE_*_TYLKO_KONTA) — panel klienta czyta je
 * stąd w runtime, bo obraz panelu budowany jest bez argumentów NEXT_PUBLIC_FEATURE_*.
 */
@Controller('me/feature-flags')
@UseGuards(JwtAuthGuard)
export class MeFeatureFlagsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @HttpCode(200)
  async moje(@CurrentUser() user: { userId: string }): Promise<Record<string, boolean>> {
    const [flagi, subs, vps, resellerMarkup] = await Promise.all([
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
      funkcjaDlaUzytkownika(this.config, this.prisma, 'FEATURE_VPS', user.userId),
      funkcjaDlaUzytkownika(this.config, this.prisma, 'FEATURE_RESELLER_MARKUP', user.userId),
    ]);
    const planIds = subs.map((s) => s.planId);
    const teraz = new Date();
    return { ...Object.fromEntries(flagi.map((f) => [f.key, ocenFlage(f, user.userId, planIds, teraz)])), vps, resellerMarkup };
  }
}
