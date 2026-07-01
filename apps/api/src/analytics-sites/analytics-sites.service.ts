import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';

// Delegate'y Prisma — klient regenerowany w buildzie prod (Dockerfile.api).
type Row = Record<string, unknown>;
interface Delegate {
  findUnique(a: Row): Promise<any>;
  findFirst(a: Row): Promise<any>;
  findMany(a: Row): Promise<any[]>;
  create(a: Row): Promise<any>;
  update(a: Row): Promise<any>;
  delete(a: Row): Promise<any>;
  count(a: Row): Promise<number>;
  groupBy(a: Row): Promise<any[]>;
  deleteMany(a: Row): Promise<{ count: number }>;
}

export interface AnalyticsSiteView {
  id: string;
  domain: string;
  siteKey: string;
  enabled: boolean;
  createdAt: string;
}

export interface AnalyticsStats {
  range: { from: string; to: string; days: number };
  totals: { pageviews: number; visitors: number };
  timeseries: Array<{ date: string; pageviews: number; visitors: number }>;
  topPages: Array<{ path: string; count: number }>;
  topReferrers: Array<{ refHost: string; count: number }>;
  countries: Array<{ country: string; count: number }>;
  devices: Array<{ deviceType: string; count: number }>;
}

@Injectable()
export class AnalyticsSitesService {
  private readonly logger = new Logger(AnalyticsSitesService.name);
  /** Retencja surowych zdarzeń (dni). Po tym czasie scheduler czyści. */
  static readonly RETENTION_DAYS = 90;
  private static readonly MAX_SITES_PER_SUB = 25;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private get sites(): Delegate {
    return (this.prisma as unknown as { analyticsSite: Delegate }).analyticsSite;
  }
  private get events(): Delegate {
    return (this.prisma as unknown as { analyticsEvent: Delegate }).analyticsEvent;
  }

  // -------------------------------------------------------------------------
  // Property (account-scoped)
  // -------------------------------------------------------------------------

  private async assertOwnedSubscription(userId: string, subscriptionId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub || sub.userId !== userId) throw new NotFoundException('Usługa nie istnieje.');
  }

  async listSites(userId: string, subscriptionId: string): Promise<AnalyticsSiteView[]> {
    await this.assertOwnedSubscription(userId, subscriptionId);
    const rows = await this.sites.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.view(r));
  }

  async createSite(userId: string, subscriptionId: string, domainRaw: string): Promise<AnalyticsSiteView> {
    await this.assertOwnedSubscription(userId, subscriptionId);
    const domain = this.normaliseDomain(domainRaw);
    if (!domain) throw new BadRequestException('Podaj prawidłową domenę (np. example.pl).');

    const count = await this.sites.count({ where: { subscriptionId } });
    if (count >= AnalyticsSitesService.MAX_SITES_PER_SUB) {
      throw new ForbiddenException(`Limit property (${AnalyticsSitesService.MAX_SITES_PER_SUB}) osiągnięty.`);
    }
    const existing = await this.sites.findFirst({ where: { subscriptionId, domain } });
    if (existing) throw new BadRequestException('Property dla tej domeny już istnieje.');

    const row = await this.sites.create({
      data: { subscriptionId, userId, domain, siteKey: `vas_${randomBytes(12).toString('hex')}`, enabled: true },
    });
    await this.audit.record({
      action: 'ANALYTICS_SITE_CREATED',
      userId,
      actorUserId: userId,
      details: { subscriptionId, siteId: row.id, domain },
    });
    return this.view(row);
  }

  async setEnabled(userId: string, subscriptionId: string, siteId: string, enabled: boolean): Promise<AnalyticsSiteView> {
    const site = await this.ownedSite(userId, subscriptionId, siteId);
    const row = await this.sites.update({ where: { id: site.id }, data: { enabled } });
    return this.view(row);
  }

  async deleteSite(userId: string, subscriptionId: string, siteId: string): Promise<{ ok: true }> {
    const site = await this.ownedSite(userId, subscriptionId, siteId);
    await this.sites.delete({ where: { id: site.id } });
    await this.audit.record({
      action: 'ANALYTICS_SITE_DELETED',
      userId,
      actorUserId: userId,
      details: { subscriptionId, siteId },
    });
    return { ok: true };
  }

  private async ownedSite(userId: string, subscriptionId: string, siteId: string): Promise<any> {
    const site = await this.sites.findUnique({ where: { id: siteId } });
    if (!site || site.subscriptionId !== subscriptionId || site.userId !== userId) {
      throw new NotFoundException('Property nie istnieje.');
    }
    return site;
  }

  // -------------------------------------------------------------------------
  // Stats (account-scoped)
  // -------------------------------------------------------------------------

  async stats(userId: string, subscriptionId: string, siteId: string, days = 30): Promise<AnalyticsStats> {
    const site = await this.ownedSite(userId, subscriptionId, siteId);
    const clampedDays = Math.min(Math.max(days, 1), AnalyticsSitesService.RETENTION_DAYS);
    const to = new Date();
    const from = new Date(to.getTime() - clampedDays * 24 * 60 * 60 * 1000);

    const rows: Array<{ path: string; refHost: string | null; country: string | null; deviceType: string | null; visitorHash: string; ts: Date }> =
      await this.events.findMany({
        where: { siteId: site.id, ts: { gte: from } },
        select: { path: true, refHost: true, country: true, deviceType: true, visitorHash: true, ts: true },
        take: 500_000,
      });

    const visitors = new Set<string>();
    const byDay = new Map<string, { pv: number; visitors: Set<string> }>();
    const pages = new Map<string, number>();
    const refs = new Map<string, number>();
    const countries = new Map<string, number>();
    const devices = new Map<string, number>();

    // Inicjalizacja serii dziennej (żeby wykres miał ciągłe dni).
    for (let i = 0; i < clampedDays; i++) {
      const d = new Date(to.getTime() - i * 24 * 60 * 60 * 1000);
      byDay.set(this.dayKey(d), { pv: 0, visitors: new Set() });
    }

    for (const e of rows) {
      visitors.add(e.visitorHash);
      const dk = this.dayKey(e.ts);
      const bucket = byDay.get(dk) ?? { pv: 0, visitors: new Set<string>() };
      bucket.pv++;
      bucket.visitors.add(e.visitorHash);
      byDay.set(dk, bucket);
      pages.set(e.path, (pages.get(e.path) ?? 0) + 1);
      if (e.refHost) refs.set(e.refHost, (refs.get(e.refHost) ?? 0) + 1);
      if (e.country) countries.set(e.country, (countries.get(e.country) ?? 0) + 1);
      if (e.deviceType) devices.set(e.deviceType, (devices.get(e.deviceType) ?? 0) + 1);
    }

    const timeseries = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, pageviews: v.pv, visitors: v.visitors.size }));

    return {
      range: { from: from.toISOString(), to: to.toISOString(), days: clampedDays },
      totals: { pageviews: rows.length, visitors: visitors.size },
      timeseries,
      topPages: this.top(pages, 'path'),
      topReferrers: this.top(refs, 'refHost'),
      countries: this.top(countries, 'country'),
      devices: this.top(devices, 'deviceType'),
    };
  }

  private top(map: Map<string, number>, key: string): any[] {
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, count]) => ({ [key]: k, count }));
  }

  // -------------------------------------------------------------------------
  // Ingest (publiczny) — bez cookies, bez zapisu IP
  // -------------------------------------------------------------------------

  /**
   * Rejestruje odsłonę. Odwiedzającego liczymy jednokierunkowym hashem z
   * DZIENNĄ solą (server-secret + data), IP + UA + siteId — sól rotuje się co
   * dobę i nie jest przechowywana, więc po dobie tożsamość jest nieodtwarzalna.
   * IP ani UA NIE trafiają do bazy.
   */
  async collect(input: {
    siteKey: string;
    path: string;
    referrer?: string | null;
    ip: string;
    userAgent: string;
    country?: string | null;
  }): Promise<{ ok: boolean }> {
    const site = await this.sites.findUnique({ where: { siteKey: input.siteKey } });
    if (!site || !site.enabled) return { ok: false };

    const path = this.safePath(input.path);
    if (!path) return { ok: false };

    // Pomijamy oczywiste boty (bez zapisu UA).
    if (/bot|crawl|spider|slurp|preview|monitor|headless/i.test(input.userAgent)) {
      return { ok: true };
    }

    const visitorHash = createHash('sha256')
      .update(`${this.dailySalt()}|${site.id}|${input.ip}|${input.userAgent}`)
      .digest('hex')
      .slice(0, 32);

    await this.events.create({
      data: {
        siteId: site.id,
        path,
        refHost: this.refHost(input.referrer, site.domain),
        country: input.country ? input.country.toUpperCase().slice(0, 2) : null,
        deviceType: this.deviceType(input.userAgent),
        visitorHash,
      },
    });
    return { ok: true };
  }

  /** Skrypt trackera serwowany publicznie (bez cookies, respektuje DNT). */
  trackerScript(): string {
    const api = this.apiBaseUrl();
    return `(function(){try{
var s=document.currentScript;var k=s&&s.getAttribute('data-site');if(!k)return;
if(navigator.doNotTrack==='1'||window.doNotTrack==='1')return;
function send(){try{
var b=JSON.stringify({k:k,p:location.pathname,r:document.referrer||''});
navigator.sendBeacon?navigator.sendBeacon('${api}/analytics/collect',b):
fetch('${api}/analytics/collect',{method:'POST',headers:{'Content-Type':'application/json'},body:b,keepalive:true});
}catch(e){}}
send();
var last=location.pathname;
setInterval(function(){if(location.pathname!==last){last=location.pathname;send();}},1000);
}catch(e){}})();`;
  }

  // -------------------------------------------------------------------------
  // Retencja (scheduler)
  // -------------------------------------------------------------------------

  async purgeOld(): Promise<number> {
    const cutoff = new Date(Date.now() - AnalyticsSitesService.RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const res = await this.events.deleteMany({ where: { ts: { lt: cutoff } } });
    if (res.count > 0) this.logger.log(`Analytics purge: usunięto ${res.count} zdarzeń starszych niż ${AnalyticsSitesService.RETENTION_DAYS} dni.`);
    return res.count;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private dailySalt(): string {
    const secret =
      this.config.get<string>('ANALYTICS_SALT_SECRET') ??
      this.config.get<string>('APP_KMS_KEY') ??
      'verris-analytics-dev-salt';
    return createHash('sha256').update(`${secret}|${this.dayKey(new Date())}`).digest('hex');
  }

  private dayKey(d: Date): string {
    return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  }

  private safePath(raw: string): string | null {
    if (!raw || typeof raw !== 'string') return null;
    let p = raw.split('?')[0].split('#')[0].trim();
    if (!p.startsWith('/')) p = `/${p}`;
    return p.slice(0, 512);
  }

  private refHost(referrer: string | null | undefined, ownDomain: string): string | null {
    if (!referrer) return null;
    try {
      const host = new URL(referrer).hostname.replace(/^www\./, '');
      if (!host || host === ownDomain.replace(/^www\./, '')) return null; // wewnętrzny = bezpośredni
      return host.slice(0, 120);
    } catch {
      return null;
    }
  }

  private deviceType(ua: string): string {
    if (/tablet|ipad/i.test(ua)) return 'tablet';
    if (/mobi|android|iphone|ipod/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  private normaliseDomain(raw: string): string | null {
    if (!raw) return null;
    let d = raw.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split(':')[0];
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return null;
    return d.slice(0, 253);
  }

  private apiBaseUrl(): string {
    return (
      this.config.get<string>('PUBLIC_API_URL') ??
      this.config.get<string>('API_BASE_URL') ??
      'https://api.verris.pl'
    );
  }

  private view(r: any): AnalyticsSiteView {
    return {
      id: r.id,
      domain: r.domain,
      siteKey: r.siteKey,
      enabled: r.enabled,
      createdAt: (r.createdAt as Date).toISOString(),
    };
  }
}
