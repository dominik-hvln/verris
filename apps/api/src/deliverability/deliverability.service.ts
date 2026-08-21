import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as dns } from 'dns';
import { PrismaService } from '../prisma/prisma.service';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface DeliverabilityCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** Suggested DNS record value to fix/improve (when applicable). */
  suggestion?: { host: string; type: string; value: string };
}

export interface DeliverabilityReport {
  domain: string | null;
  sendingIp: string | null;
  generatedAt: string;
  score: number; // 0-100
  checks: DeliverabilityCheck[];
  blacklists: Array<{ zone: string; listed: boolean }>;
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
  constructor(private readonly prisma: PrismaService) {}

  async forSubscription(subscriptionId: string, userId: string): Promise<DeliverabilityReport> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: { include: { server: { select: { ipAddress: true } } } } },
    });
    if (!sub) throw new NotFoundException('Service not found');
    const domain = sub.account?.domain ?? null;
    const ip = sub.account?.server?.ipAddress ?? null;
    return this.check(domain, ip);
  }

  async check(domain: string | null, sendingIp: string | null): Promise<DeliverabilityReport> {
    const checks: DeliverabilityCheck[] = [];
    const blacklists: Array<{ zone: string; listed: boolean }> = [];

    if (!domain) {
      return { domain, sendingIp, generatedAt: new Date().toISOString(), score: 0, checks, blacklists };
    }

    // --- SPF ---
    const allTxt = await txt(domain);
    const spf = allTxt.find((r) => r.toLowerCase().startsWith('v=spf1'));
    if (!spf) {
      checks.push({
        key: 'spf',
        label: 'SPF',
        status: 'fail',
        detail: 'Brak rekordu SPF — poczta z Twojej domeny będzie częściej trafiać do spamu.',
        suggestion: { host: '@', type: 'TXT', value: 'v=spf1 a mx include:_spf.verris.pl ~all' },
      });
    } else if (allTxt.filter((r) => r.toLowerCase().startsWith('v=spf1')).length > 1) {
      checks.push({ key: 'spf', label: 'SPF', status: 'fail', detail: 'Więcej niż jeden rekord SPF — dozwolony jest tylko jeden. Scal je w jeden TXT.' });
    } else {
      const soft = spf.includes('~all') || spf.includes('-all');
      checks.push({
        key: 'spf',
        label: 'SPF',
        status: soft ? 'ok' : 'warn',
        detail: soft ? `Poprawny: ${spf}` : `Obecny, ale bez ~all/-all (zalecane): ${spf}`,
      });
    }

    // --- DMARC ---
    const dmarcTxt = await txt(`_dmarc.${domain}`);
    const dmarc = dmarcTxt.find((r) => r.toLowerCase().startsWith('v=dmarc1'));
    if (!dmarc) {
      checks.push({
        key: 'dmarc',
        label: 'DMARC',
        status: 'fail',
        detail: 'Brak rekordu DMARC — dodaj, by chronić domenę przed podszywaniem.',
        suggestion: { host: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@verris.pl; fo=1' },
      });
    } else {
      const policy = /p=(none|quarantine|reject)/i.exec(dmarc)?.[1]?.toLowerCase() ?? 'none';
      checks.push({
        key: 'dmarc',
        label: 'DMARC',
        status: policy === 'none' ? 'warn' : 'ok',
        detail:
          policy === 'none'
            ? `Obecny, ale polityka p=none (tylko monitoring). Rozważ p=quarantine.`
            : `Poprawny: polityka p=${policy}.`,
      });
    }

    // --- DKIM (probe common selectors) ---
    let dkimFound: string | null = null;
    for (const sel of DKIM_SELECTORS) {
      const rec = await txt(`${sel}._domainkey.${domain}`);
      if (rec.some((r) => r.toLowerCase().includes('v=dkim1') || r.includes('p='))) {
        dkimFound = sel;
        break;
      }
    }
    checks.push({
      key: 'dkim',
      label: 'DKIM',
      status: dkimFound ? 'ok' : 'warn',
      detail: dkimFound
        ? `Znaleziono podpis DKIM (selektor "${dkimFound}").`
        : 'Nie wykryto rekordu DKIM dla typowych selektorów — włącz podpisywanie DKIM dla domeny.',
    });

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

    return { domain, sendingIp, generatedAt: new Date().toISOString(), score, checks, blacklists };
  }
}
