import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';
import type { RequestContextDto } from '../common/decorators/request-context.js';

export const ECO_BADGE_IMPRESSION_REASON = 'BADGE_IMPRESSION';
/**
 * Audyt bezpieczeństwa 13.10: punkty EKO z anonimowego piksela (wymienialne na kredyt w portfelu) zależały tylko
 * od liczby różnych adresów IP. Teraz: deduplikacja po sieci (IPv4 /24, IPv6 /64) i twardy dzienny limit punktów.
 */
export const ECO_BADGE_MAX_PUNKTOW_DZIENNIE = 10;

/** Klucz sieci do deduplikacji: IPv4 → /24, IPv6 → /64 (pełne 8 grup, nie postać z „::”). */
export function kluczSieci(ip: string): string {
  const a = ip.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const v4 = a.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  const [glowa, ogon = ''] = a.split('%')[0].split('::');
  const g = glowa ? glowa.split(':') : [];
  const o = a.includes('::') ? (ogon ? ogon.split(':') : []) : [];
  const pelne = a.includes('::') ? [...g, ...Array(Math.max(0, 8 - g.length - o.length)).fill('0'), ...o] : g;
  return `${pelne.slice(0, 4).map((x) => (x || '0').replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

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
    const ipHash = createHash('sha256').update(kluczSieci(ctx.ipAddress)).digest('hex').slice(0, 16);
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
    let delta = pointsAfter - pointsBefore;
    if (delta > 0) {
      const poczatekDnia = new Date();
      poczatekDnia.setUTCHours(0, 0, 0, 0);
      const dzis = await this.prisma.ecoPointsLedgerEntry.aggregate({
        where: { userId: user.id, reason: ECO_BADGE_IMPRESSION_REASON, createdAt: { gte: poczatekDnia } },
        _sum: { delta: true },
      });
      delta = Math.max(0, Math.min(delta, ECO_BADGE_MAX_PUNKTOW_DZIENNIE - (dzis._sum.delta ?? 0)));
    }

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
