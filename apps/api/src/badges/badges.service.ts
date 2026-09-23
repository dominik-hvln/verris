import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SiteMonitorEventType, SubscriptionStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { PartnersService } from '../partners/partners.service';
import {
  SEAL_REASON_LABEL,
  dailyUptime,
  ecoTier,
  downIntervals,
  sealReason,
  windowPct,
  type DayUptime,
  type SealReason,
} from './badge-logic';
import type { SealData } from './badge-render';

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 5_000;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SiteBadgeData {
  domain: string;
  userId: string;
  ecoToken: string | null;
  reason: SealReason;
  seal: SealData | null;
  monitorOn: boolean;
  up: boolean;
  responseMs: number | null;
  uptime30: number | null;
  uptime90: number | null;
  days90: DayUptime[];
}

@Injectable()
export class BadgesService {
  // ponytail: cache w pamięci procesu (60 s) — przy kilku instancjach API
  // każda liczy osobno; Redis dopiero, gdy ruch z badge'y to udźwignie.
  private readonly cache = new Map<string, { at: number; v: SiteBadgeData | null }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly partners: PartnersService,
    private readonly config: ConfigService,
  ) {}

  apiBase(): string {
    return (this.config.get<string>('publicApiUrl') ?? 'https://api.verris.pl').replace(/\/$/, '');
  }

  clientUrl(): string {
    return (this.config.get<string>('clientPanelUrl') ?? 'https://panel.verris.pl').replace(/\/$/, '');
  }

  /** Dane strony do ramek (pieczęć, dostępność). null = nie ma takiej usługi. */
  async site(subscriptionId: string): Promise<SiteBadgeData | null> {
    if (!UUID_RE.test(subscriptionId)) return null;
    const hit = this.cache.get(subscriptionId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.v;
    const v = await this.load(subscriptionId);
    if (this.cache.size >= CACHE_MAX) this.cache.clear();
    this.cache.set(subscriptionId, { at: Date.now(), v });
    return v;
  }

  private async load(subscriptionId: string): Promise<SiteBadgeData | null> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        status: true,
        userId: true,
        account: { select: { domain: true } },
        user: { select: { ecoBadgeToken: true } },
      },
    });
    const domain = sub?.account?.domain;
    if (!sub || !domain) return null;

    const now = Date.now();
    const monitor = await this.prisma.siteMonitor.findUnique({ where: { subscriptionId } });
    const recovered = monitor
      ? await this.prisma.siteMonitorEvent.findMany({
          where: { monitorId: monitor.id, type: SiteMonitorEventType.RECOVERED, createdAt: { gte: new Date(now - 91 * DAY_MS) } },
          select: { createdAt: true, durationS: true },
        })
      : [];
    const since = monitor?.createdAt.getTime() ?? now;
    const iv = downIntervals(recovered, monitor?.downSince ?? null, now);
    const uptime30 = monitor ? windowPct(iv, since, now, 30) : null;
    const days90 = dailyUptime(iv, since, now, 90);
    const reason = sealReason({
      active: sub.status === SubscriptionStatus.ACTIVE,
      monitor,
      uptime30,
      now,
    });
    return {
      domain,
      userId: sub.userId,
      ecoToken: sub.user.ecoBadgeToken,
      reason,
      seal:
        reason === 'OK' && monitor?.tlsExpiresAt && monitor.lastCheckedAt && uptime30 !== null
          ? {
              domain,
              sslUntil: monitor.tlsExpiresAt,
              uptime30,
              days30: days90.slice(-30),
              lastCheckedAt: monitor.lastCheckedAt,
              verifyUrl: `${this.apiBase()}/public/badges/weryfikacja/${subscriptionId}`,
            }
          : null,
      monitorOn: !!monitor?.enabled,
      up: monitor?.lastStatus !== 'DOWN',
      responseMs: monitor?.lastResponseMs ?? null,
      uptime30,
      uptime90: monitor ? windowPct(iv, since, now, 90) : null,
      days90,
    };
  }

  /** Właściciel kodu polecającego, jeśli jest zatwierdzonym partnerem. */
  async referralOwner(code: string): Promise<{ id: string; ecoToken: string | null; company: string | null } | null> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) return null;
    const user = await this.prisma.user.findFirst({
      where: { referralCode: code, referralProgramEnrollment: { status: 'APPROVED' } },
      select: { id: true, ecoBadgeToken: true, companyName: true },
    });
    return user ? { id: user.id, ecoToken: user.ecoBadgeToken, company: user.companyName } : null;
  }

  async countReferralClick(userId: string): Promise<void> {
    // ponytail: bez deduplikacji — to statystyka dla klienta, nie podstawa
    // prowizji (ta liczy się od płatności poleconych kont).
    await this.prisma.user.update({ where: { id: userId }, data: { badgeReferralClicks: { increment: 1 } } });
  }

  async ecoProfile(token: string): Promise<{ tier: string } | null> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(token)) return null;
    const user = await this.prisma.user.findFirst({ where: { ecoBadgeToken: token }, select: { ecoPoints: true } });
    return user ? { tier: ecoTier(user.ecoPoints) } : null;
  }

  /** Dane zakładki „Badge na stronę” w panelu klienta. */
  async panel(subscriptionId: string, userId: string) {
    const owned = UUID_RE.test(subscriptionId)
      ? await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, select: { id: true } })
      : null;
    if (!owned) throw new NotFoundException('Service not found');
    this.cache.delete(subscriptionId);
    const [site, user, partner] = await Promise.all([
      this.site(subscriptionId),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { ecoBadgeToken: true, ecoPoints: true, ecoBadgeImpressions: true, badgeReferralClicks: true },
      }),
      this.partners.getOverview(userId),
    ]);
    if (!site || !user) throw new NotFoundException('Badge będą dostępne po aktywacji konta hostingowego.');
    return {
      apiBase: this.apiBase(),
      domain: site.domain,
      seal: { visible: site.reason === 'OK', reason: site.reason, label: SEAL_REASON_LABEL[site.reason] },
      uptime: { monitorOn: site.monitorOn, pct30: site.uptime30 },
      eco: { token: user.ecoBadgeToken, tier: ecoTier(user.ecoPoints), points: user.ecoPoints, impressions: user.ecoBadgeImpressions },
      referral: {
        programEnabled: partner.programEnabled,
        status: partner.enrollmentStatus,
        code: partner.referralCode,
        commissionPct: partner.config.commissionPct,
        clicks: user.badgeReferralClicks,
        referrals: partner.referrals.total,
        earned: partner.earnings.pending + partner.earnings.available + partner.earnings.reserved + partner.earnings.paid,
      },
    };
  }
}
