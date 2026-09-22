import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as dns } from 'dns';
import { PrismaService } from '../prisma/prisma.service';
import { DirectAdminService } from '../servers/directadmin.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { buildMailAuthChecks, type CheckStatus, type MailAuthSuggestion, type ZoneRecord } from './mail-auth';

export type { CheckStatus };

export interface DeliverabilityCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** Suggested DNS record value to fix/improve (when applicable). */
  suggestion?: MailAuthSuggestion;
}

export interface DeliverabilityReport {
  domain: string | null;
  sendingIp: string | null;
  generatedAt: string;
  score: number; // 0-100
  checks: DeliverabilityCheck[];
  blacklists: Array<{ zone: string; listed: boolean }>;
  /** Domena delegowana na NS hostingu (strefa Verris jest autorytatywna); null = nie wiadomo. */
  usesPlatformDns: boolean | null;
}

// Common DKIM selectors to probe (DirectAdmin defaults to "x").
const DKIM_SELECTORS = ['x', 'default', 'mail', 'dkim', 's1', 'selector1', 'google', 'k1'];
// Widely-used DNS blocklists.
const RBL_ZONES = ['zen.spamhaus.org', 'bl.spamcop.net', 'b.barracudacentral.org', 'dnsbl.sorbs.net'];

async function withTimeout<T>(p: Promise<T>, ms = 4000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function txt(name: string): Promise<string[]> {
  try {
    const records: string[][] = await withTimeout(dns.resolveTxt(name));
    return records.map((chunks: string[]) => chunks.join(''));
  } catch {
    return [];
  }
}

@Injectable()
export class DeliverabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directAdmin: DirectAdminService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async forSubscription(subscriptionId: string, userId: string): Promise<DeliverabilityReport> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: { include: { server: { select: { ipAddress: true, ns1: true, ns2: true, ns3: true } } } } },
    });
    if (!sub) throw new NotFoundException('Service not found');
    const domain = sub.account?.domain ?? null;
    const server = sub.account?.server;
    if (!domain || !server) return this.check(domain, server?.ipAddress ?? null);

    const platformNs = await this.platformSettings.getHostingNameservers();
    const serverNs = [server.ns1, server.ns2, server.ns3].map((v) => (v ?? '').trim().toLowerCase()).filter(Boolean);
    const fallbackNs = [platformNs.ns1, platformNs.ns2, platformNs.ns3].map((v) => v.trim().toLowerCase()).filter(Boolean);
    const expectedNs = serverNs.length >= 2 ? serverNs : fallbackNs;

    const [zone, liveNs] = await Promise.all([
      this.directAdmin
        .listHostingDnsRecords(subscriptionId, userId, domain)
        .then((z): ZoneRecord[] | null => (z.fetchError ? null : z.records))
        .catch(() => null),
      withTimeout(dns.resolveNs(domain)).catch(() => [] as string[]),
    ]);
    const live = liveNs.map((n) => n.toLowerCase().replace(/\.$/, ''));
    const usesPlatformDns = expectedNs.length < 2 || live.length === 0 ? null : expectedNs.every((n) => live.includes(n));
    return this.check(domain, server.ipAddress, zone, usesPlatformDns);
  }

  async check(
    domain: string | null,
    sendingIp: string | null,
    zone: ZoneRecord[] | null = null,
    usesPlatformDns: boolean | null = null,
  ): Promise<DeliverabilityReport> {
    const checks: DeliverabilityCheck[] = [];
    const blacklists: Array<{ zone: string; listed: boolean }> = [];

    if (!domain) {
      return { domain, sendingIp, generatedAt: new Date().toISOString(), score: 0, checks, blacklists, usesPlatformDns };
    }

    // --- SPF / DKIM / DMARC (E-15/16/17) ---
    const [rootTxt, dmarcTxt] = await Promise.all([txt(domain), txt(`_dmarc.${domain}`)]);
    const dkimTxt = await Promise.all(DKIM_SELECTORS.map((sel) => txt(`${sel}._domainkey.${domain}`)));
    const dkimIdx = dkimTxt.findIndex((rec) => rec.some((r) => r.toLowerCase().includes('v=dkim1') || r.includes('p=')));
    const dkimSelector = dkimIdx === -1 ? null : DKIM_SELECTORS[dkimIdx];
    checks.push(...buildMailAuthChecks({ domain, sendingIp, rootTxt, dmarcTxt, dkimSelector, zone }));

    // --- RBL / blacklists on the sending IP ---
    if (sendingIp && /^\d+\.\d+\.\d+\.\d+$/.test(sendingIp)) {
      const reversed = sendingIp.split('.').reverse().join('.');
      await Promise.all(
        RBL_ZONES.map(async (zone) => {
          let listed = false;
          try {
            const res: string[] = await withTimeout(dns.resolve4(`${reversed}.${zone}`), 3500);
            listed = res.length > 0;
          } catch {
            listed = false; // NXDOMAIN = not listed
          }
          blacklists.push({ zone, listed });
        }),
      );
      const anyListed = blacklists.some((b) => b.listed);
      checks.push({
        key: 'rbl',
        label: 'Blacklisty (RBL)',
        status: anyListed ? 'fail' : 'ok',
        detail: anyListed
          ? `IP serwera (${sendingIp}) jest na: ${blacklists.filter((b) => b.listed).map((b) => b.zone).join(', ')}.`
          : `IP serwera (${sendingIp}) nie figuruje na sprawdzanych blacklistach.`,
      });
    }

    // --- score ---
    const weight: Record<CheckStatus, number> = { ok: 1, warn: 0.5, fail: 0 };
    const score = checks.length
      ? Math.round((checks.reduce((s, c) => s + weight[c.status], 0) / checks.length) * 100)
      : 0;

    return { domain, sendingIp, generatedAt: new Date().toISOString(), score, checks, blacklists, usesPlatformDns };
  }
}
