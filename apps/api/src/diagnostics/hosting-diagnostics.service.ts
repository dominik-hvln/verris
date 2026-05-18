import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as dns from 'node:dns/promises';
import * as tls from 'node:tls';
import { Role } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { SupportActions } from '../common/audit/audit.actions';

const OP_TIMEOUT_MS = 12_000;

export interface HostingDnsTlsResult {
  hostname: string;
  serverLabel: string | null;
  expectedServerIpv4: string | null;
  ipv4MatchesDnsA: boolean | null;
  durationMs: number;
  dns: {
    a: string[];
    aaaa: string[];
    mx: Array<{ priority: number; exchange: string }>;
    ns: string[];
    errors: Partial<Record<'a' | 'aaaa' | 'mx' | 'ns', string>>;
  };
  tls: {
    ok: boolean;
    error?: string;
    subjectCN?: string;
    issuer?: string;
    validFrom?: string;
    validTo?: string;
    authorized?: boolean;
    authorizationError?: string;
  };
}

function normalizeHostname(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * Sprint 3 / R-02 — diagnostyka DNS + TLS z poziomu profilu klienta (BOK).
 * Każde uruchomienie kończy się wpisem audytu (`STAFF_DNS_TLS_DIAGNOSTIC`).
 */
@Injectable()
export class HostingDiagnosticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async runDnsTlsForUser(opts: {
    targetUserId: string;
    actorUserId: string;
    actorRole: Role;
    subscriptionId?: string | null;
    domain?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<HostingDnsTlsResult> {
    const subject = await this.prisma.user.findUnique({
      where: { id: opts.targetUserId },
      select: { id: true, role: true, anonymizedAt: true },
    });
    if (!subject || subject.anonymizedAt) {
      throw new NotFoundException('Użytkownik nie istnieje lub konto jest zanonimizowane.');
    }
    if (opts.actorRole === Role.STAFF && subject.role !== Role.USER) {
      throw new ForbiddenException(
        'Personel może uruchamiać diagnostykę tylko dla kont klienta (USER).',
      );
    }

    let hostname: string;
    let expectedV4: string | null = null;
    let serverLabel: string | null = null;

    if (opts.subscriptionId?.trim()) {
      const sub = await this.prisma.subscription.findFirst({
        where: { id: opts.subscriptionId.trim(), userId: opts.targetUserId },
        include: { account: { include: { server: true } } },
      });
      if (!sub) {
        throw new NotFoundException('Subskrypcja nie należy do tego użytkownika.');
      }
      if (!sub.account) {
        throw new BadRequestException('Subskrypcja nie ma jeszcze konta hostingowego (brak domeny DA).');
      }
      hostname = normalizeHostname(sub.account.domain);
      expectedV4 = sub.account.server.ipAddress;
      serverLabel =
        sub.account.server.name ??
        sub.account.server.hostname ??
        sub.account.server.id;
    } else if (opts.domain?.trim()) {
      const want = normalizeHostname(opts.domain);
      const account = await this.prisma.account.findFirst({
        where: { userId: opts.targetUserId, domain: want },
        include: { server: true },
      });
      if (!account) {
        const any = await this.prisma.account.findFirst({
          where: { userId: opts.targetUserId },
          select: { domain: true },
        });
        throw new BadRequestException(
          any
            ? `Domena musi być dokładnie domeną główną konta hostingowego (np. ${any.domain}).`
            : 'Klient nie ma konta hostingowego — brak domeny do sprawdzenia.',
        );
      }
      hostname = want;
      expectedV4 = account.server.ipAddress;
      serverLabel =
        account.server.name ?? account.server.hostname ?? account.server.id;
    } else {
      throw new BadRequestException('Podaj subscriptionId lub domain (FQDN konta hostingowego).');
    }

    const t0 = Date.now();
    const [dnsResult, tlsResult] = await Promise.all([
      this.resolveDns(hostname),
      this.probeTls(hostname),
    ]);
    const durationMs = Date.now() - t0;

    let ipv4MatchesDnsA: boolean | null = null;
    if (expectedV4 && dnsResult.a.length) {
      ipv4MatchesDnsA = dnsResult.a.includes(expectedV4);
    }

    await this.audit.record({
      action: SupportActions.STAFF_DNS_TLS_DIAGNOSTIC,
      userId: opts.targetUserId,
      actorUserId: opts.actorUserId,
      ipAddress: opts.ipAddress ?? undefined,
      userAgent: opts.userAgent ?? undefined,
      details: {
        hostname,
        subscriptionId: opts.subscriptionId ?? null,
        durationMs,
        dnsKeys: {
          a: dnsResult.a.length,
          aaaa: dnsResult.aaaa.length,
          mx: dnsResult.mx.length,
          ns: dnsResult.ns.length,
        },
        tlsOk: tlsResult.ok,
        expectedServerIpv4: expectedV4,
        ipv4MatchesDnsA,
      },
    });

    return {
      hostname,
      serverLabel,
      expectedServerIpv4: expectedV4,
      ipv4MatchesDnsA,
      durationMs,
      dns: dnsResult,
      tls: tlsResult,
    };
  }

  private async resolveDns(hostname: string): Promise<HostingDnsTlsResult['dns']> {
    const errors: Partial<Record<'a' | 'aaaa' | 'mx' | 'ns', string>> = {};
    const record = async <T>(
      key: keyof typeof errors,
      fn: () => Promise<T>,
    ): Promise<T> => {
      try {
        return await Promise.race([
          fn(),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error(`timeout ${OP_TIMEOUT_MS}ms`)), OP_TIMEOUT_MS),
          ),
        ]);
      } catch (e) {
        errors[key] = e instanceof Error ? e.message : String(e);
        return [] as unknown as T;
      }
    };

    const [a, aaaa, mxRaw, ns] = await Promise.all([
      record('a', () => dns.resolve4(hostname)),
      record('aaaa', () => dns.resolve6(hostname)),
      record('mx', () => dns.resolveMx(hostname)),
      record('ns', () => dns.resolveNs(hostname)),
    ]);

    const mxList = Array.isArray(mxRaw) ? mxRaw : [];
    const mx = [...mxList]
      .sort((x, y) => x.priority - y.priority)
      .map((m) => ({ priority: m.priority, exchange: m.exchange }));

    return {
      a: Array.isArray(a) ? a : [],
      aaaa: Array.isArray(aaaa) ? aaaa : [],
      mx,
      ns: Array.isArray(ns) ? ns : [],
      errors,
    };
  }

  private probeTls(
    hostname: string,
  ): Promise<{ ok: false; error: string } | HostingDnsTlsResult['tls']> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v: { ok: false; error: string } | HostingDnsTlsResult['tls']) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };

      const socket = tls.connect(
        {
          host: hostname,
          port: 443,
          servername: hostname,
          rejectUnauthorized: false,
        },
        () => {
          clearTimeout(killTimer);
          try {
            const cert = socket.getPeerCertificate();
            const empty = !cert || Object.keys(cert).length === 0;
            if (empty) {
              socket.end();
              finish({ ok: false, error: 'Brak certyfikatu TLS (pusty peer).' });
              return;
            }
            const subjectCN =
              typeof cert.subject === 'object' && cert.subject && 'CN' in cert.subject
                ? String((cert.subject as { CN?: string }).CN ?? '')
                : undefined;
            const issuer =
              typeof cert.issuer === 'object' && cert.issuer
                ? String(
                    (cert.issuer as { O?: string; CN?: string }).O ??
                      (cert.issuer as { CN?: string }).CN ??
                      '',
                  )
                : undefined;
            const authErr = socket.authorizationError;
            const out: HostingDnsTlsResult['tls'] = {
              ok: true,
              subjectCN: subjectCN || undefined,
              issuer: issuer || undefined,
              validFrom: cert.valid_from,
              validTo: cert.valid_to,
              authorized: socket.authorized,
              authorizationError:
                authErr == null
                  ? undefined
                  : authErr instanceof Error
                    ? authErr.message
                    : String(authErr),
            };
            socket.end();
            finish(out);
          } catch (e) {
            try {
              socket.end();
            } catch {
              /* ignore */
            }
            finish({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        },
      );

      const killTimer = setTimeout(() => {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
        finish({ ok: false, error: `timeout ${OP_TIMEOUT_MS}ms` });
      }, OP_TIMEOUT_MS);

      socket.on('error', (err) => {
        clearTimeout(killTimer);
        finish({ ok: false, error: err.message });
      });
    });
  }
}
