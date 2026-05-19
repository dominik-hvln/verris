import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import type { RequestContextDto } from '../common/decorators/request-context';

export const ECO_BADGE_IMPRESSION_REASON = 'BADGE_IMPRESSION';

/** 1×1 transparent GIF */
export const ECO_BADGE_TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

@Injectable()
export class EcoBadgeService {
  private readonly logger = new Logger(EcoBadgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly config: ConfigService,
  ) {}

  async getStats(userId: string) {
    const [user, impressionsPerPoint, pointsEarned] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { ecoBadgeImpressions: true },
      }),
      this.platformSettings.getClientConfig().then((c) => c.ecoBadgeImpressionsPerPoint),
      this.prisma.ecoPointsLedgerEntry.aggregate({
        where: { userId, reason: ECO_BADGE_IMPRESSION_REASON },
        _sum: { delta: true },
      }),
    ]);
    if (!user) {
      return {
        impressions: 0,
        impressionsPerPoint,
        impressionsUntilNextPoint: impressionsPerPoint,
        pointsEarnedFromBadge: 0,
      };
    }
    const impressions = user.ecoBadgeImpressions;
    const remainder = impressions % impressionsPerPoint;
    const impressionsUntilNextPoint =
      remainder === 0 && impressions > 0 ? impressionsPerPoint : impressionsPerPoint - remainder;

    return {
      impressions,
      impressionsPerPoint,
      impressionsUntilNextPoint,
      pointsEarnedFromBadge: pointsEarned._sum.delta ?? 0,
    };
  }

  /**
   * Zlicza wyświetlenie badge (po deduplikacji). Przyznaje punkty EKO wg ustawień platformy.
   */
  recordImpression(
    token: string,
    ctx: RequestContextDto,
    meta: { referer?: string | null; source: 'svg' | 'embed' | 'pixel' },
  ): void {
    void this.recordImpressionAsync(token, ctx, meta).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`eco badge impression failed: ${msg}`);
    });
  }

  private async recordImpressionAsync(
    token: string,
    ctx: RequestContextDto,
    meta: { referer?: string | null; source: 'svg' | 'embed' | 'pixel' },
  ): Promise<void> {
    if (!ctx.ipAddress) return;
    if (this.isPanelPreview(meta.referer)) return;

    const user = await this.prisma.user.findFirst({
      where: { ecoBadgeToken: token },
      select: { id: true, ecoBadgeImpressions: true },
    });
    if (!user) return;

    const impressionsPerPoint = (await this.platformSettings.getClientConfig())
      .ecoBadgeImpressionsPerPoint;
    if (impressionsPerPoint < 1) return;

    const hourBucket = new Date().toISOString().slice(0, 13);
    const ipHash = createHash('sha256').update(ctx.ipAddress).digest('hex').slice(0, 16);
    const bucketKey = `${user.id}:${ipHash}:${hourBucket}`;

    try {
      await this.prisma.ecoBadgeImpressionDedup.create({
        data: { userId: user.id, bucketKey },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return;
      }
      throw e;
    }

    const previousImpressions = user.ecoBadgeImpressions;
    const newImpressions = previousImpressions + 1;
    const pointsBefore = Math.floor(previousImpressions / impressionsPerPoint);
    const pointsAfter = Math.floor(newImpressions / impressionsPerPoint);
    const delta = pointsAfter - pointsBefore;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          ecoBadgeImpressions: newImpressions,
          ...(delta > 0 ? { ecoPoints: { increment: delta } } : {}),
        },
      });
      if (delta > 0) {
        await tx.ecoPointsLedgerEntry.create({
          data: {
            userId: user.id,
            delta,
            reason: ECO_BADGE_IMPRESSION_REASON,
          },
        });
      }
    });
  }

  private isPanelPreview(referer?: string | null): boolean {
    if (!referer) return false;
    let ref: URL;
    try {
      ref = new URL(referer);
    } catch {
      return false;
    }
    const hosts = [
      this.config.get<string>('clientPanelUrl'),
      this.config.get<string>('staffPanelUrl'),
      this.config.get<string>('adminPanelUrl'),
    ]
      .filter(Boolean)
      .map((url) => {
        try {
          return new URL(url!).host;
        } catch {
          return null;
        }
      })
      .filter((h): h is string => Boolean(h));

    return hosts.some((host) => ref.host === host || ref.host.endsWith(`.${host}`));
  }
}
