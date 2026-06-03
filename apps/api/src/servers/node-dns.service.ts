import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { OvhClient } from './ovh.client';
import { DirectAdminService } from './directadmin.service';
import {
  allocateNsPairIndices,
  normalizeGlueFqdn,
  legacyZoneSubdomain,
  nsHost,
  nsNumberingStart,
  nsSubdomain,
  parseNsIndex,
  type NsNumberingMode,
} from './node-dns-naming';

export type NsProvisionStepStatus =
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'skipped'
  | 'error';

export interface NsProvisionStep {
  step: string;
  status: NsProvisionStepStatus;
  detail?: string;
}

export interface NsProvisionResult {
  ns1: string;
  ns2: string;
  ipv4: string;
  ipv6: string | null;
  baseDomain: string;
  steps: NsProvisionStep[];
  ok: boolean;
}

interface OvhGlue {
  host: string;
  ips: string[];
}

const GLUE_DENIED_HINT =
  'Wygeneruj nowy OVH consumer key z prawem POST /domain/verris.pl/glueRecord (obecny klucz ma zwykle tylko /domain/zone/* — patrz ops/docs/OVH_NODE_NS_AUTOMATION.md).';

/**
 * Automates branded nameservers for a compute node at OVH:
 *   1. A/AAAA records in the base zone (ns1, ns2 — global short names)
 *   2. Glue records (host label → IPv4 [+ IPv6]) on the base domain
 *   3. Stores the resulting NS hostnames on the Server row
 *
 * Pair numbering: sequential (ns1+ns2, ns3+ns4, …) or block100 (ns100+ns101, …)
 * via HOSTING_NS_NUMBERING. Idempotent across re-runs.
 */
@Injectable()
export class NodeDnsService {
  private readonly logger = new Logger(NodeDnsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ovh: OvhClient,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly directAdmin: DirectAdminService,
  ) {}

  isConfigured(): boolean {
    return this.ovh.isConfigured();
  }

  private baseDomain(): string {
    return (this.config.get<string>('HOSTING_NS_BASE_DOMAIN') ?? 'verris.pl').toLowerCase();
  }

  private numberingMode(): NsNumberingMode {
    const raw = (this.config.get<string>('HOSTING_NS_NUMBERING') ?? 'sequential').toLowerCase();
    return raw === 'block100' ? 'block100' : 'sequential';
  }

  /** Resolve or allocate a global short NS pair for this node. */
  private async resolveNsPair(
    server: { id: string; ns1: string | null; ns2: string | null },
    base: string,
  ): Promise<{ ns1Sub: string; ns2Sub: string; ns1Host: string; ns2Host: string }> {
    const i1 = server.ns1 ? parseNsIndex(server.ns1, base) : null;
    const i2 = server.ns2 ? parseNsIndex(server.ns2, base) : null;
    if (i1 != null && i2 != null && i2 === i1 + 1) {
      return {
        ns1Sub: nsSubdomain(i1),
        ns2Sub: nsSubdomain(i2),
        ns1Host: nsHost(i1, base),
        ns2Host: nsHost(i2, base),
      };
    }

    const used = await this.collectUsedNsIndices(server.id, base);
    const start = nsNumberingStart(this.numberingMode());
    const { n1, n2 } = allocateNsPairIndices(used, start);
    return {
      ns1Sub: nsSubdomain(n1),
      ns2Sub: nsSubdomain(n2),
      ns1Host: nsHost(n1, base),
      ns2Host: nsHost(n2, base),
    };
  }

  private async collectUsedNsIndices(excludeServerId: string, base: string): Promise<Set<number>> {
    const servers = await this.prisma.server.findMany({
      where: { OR: [{ ns1: { not: null } }, { ns2: { not: null } }] },
      select: { id: true, ns1: true, ns2: true },
    });
    const used = new Set<number>();
    for (const s of servers) {
      if (s.id === excludeServerId) continue;
      for (const h of [s.ns1, s.ns2]) {
        if (!h) continue;
        const n = parseNsIndex(h, base);
        if (n != null) used.add(n);
      }
    }
    return used;
  }

  /**
   * Provision (or reconcile) branded nameservers for a node. Best-effort per
   * step — a single failure is recorded in `steps` and does not abort the rest,
   * so the admin gets a complete report.
   */
  async provisionNodeNameservers(
    serverId: string,
    opts: { actorUserId?: string; ipv6?: string | null } = {},
  ): Promise<NsProvisionResult> {
    if (!this.ovh.isConfigured()) {
      throw new BadRequestException(
        'Integracja OVH nie jest skonfigurowana (OVH_APP_KEY / OVH_APP_SECRET / OVH_CONSUMER_KEY).',
      );
    }
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Węzeł nie istnieje.');
    const ipv4 = server.ipAddress;
    if (!ipv4 || /^(0\.0\.0\.0|pending|n\/a)$/i.test(ipv4)) {
      throw new BadRequestException('Węzeł nie ma jeszcze publicznego adresu IPv4.');
    }
    const ipv6 = (opts.ipv6 ?? server.ipv6Address) || null;

    const base = this.baseDomain();
    const previousHosts = [server.ns1, server.ns2].filter((h): h is string => Boolean(h));
    const { ns1Sub, ns2Sub, ns1Host, ns2Host } = await this.resolveNsPair(server, base);
    const steps: NsProvisionStep[] = [];

    steps.push({
      step: 'Wybrane NS',
      status: 'unchanged',
      detail: `${ns1Host}, ${ns2Host} (tryb: ${this.numberingMode()})`,
    });

    // 1) Zone A/AAAA records for both NS hostnames.
    await this.ensureZoneRecord(base, ns1Sub, 'A', ipv4, steps);
    await this.ensureZoneRecord(base, ns2Sub, 'A', ipv4, steps);
    if (ipv6) {
      await this.ensureZoneRecord(base, ns1Sub, 'AAAA', ipv6, steps);
      await this.ensureZoneRecord(base, ns2Sub, 'AAAA', ipv6, steps);
    } else {
      steps.push({ step: 'AAAA records', status: 'skipped', detail: 'Brak IPv6 dla węzła.' });
    }
    await this.refreshZone(base, steps);

    // 2) Glue records on the base domain (OVH host label, not FQDN).
    const ips = ipv6 ? [ipv4, ipv6] : [ipv4];
    await this.ensureGlue(base, ns1Host, ips, steps);
    await this.ensureGlue(base, ns2Host, ips, steps);

    // 3) Remove legacy long zone records from a previous run (ns1.<slug>.*).
    for (const prev of previousHosts) {
      if (prev === ns1Host || prev === ns2Host) continue;
      const legacySub = legacyZoneSubdomain(prev, base);
      if (!legacySub) continue;
      await this.removeZoneRecord(base, legacySub, 'A', steps);
      await this.removeZoneRecord(base, legacySub, 'AAAA', steps);
    }
    if (previousHosts.some((h) => legacyZoneSubdomain(h, base))) {
      await this.refreshZone(base, steps);
    }

    // 4) Persist NS hostnames + IPv6 on the node.
    await this.prisma.server.update({
      where: { id: server.id },
      data: {
        ns1: ns1Host,
        ns2: ns2Host,
        ns3: null,
        ipv6Address: ipv6,
        nsProvisionedAt: new Date(),
      },
    });
    steps.push({ step: 'Przypisanie NS do węzła', status: 'updated', detail: `${ns1Host}, ${ns2Host}` });

    // 5) DirectAdmin — domyślne NS serwera (Admin Settings) + konta hostingowe.
    await this.applyDirectAdminNameservers(serverId, ns1Host, ns2Host, steps);

    const ok = !steps.some((s) => s.status === 'error');
    await this.audit.record({
      action: 'NODE_NS_PROVISION',
      userId: opts.actorUserId,
      actorUserId: opts.actorUserId,
      details: { serverId, ns1: ns1Host, ns2: ns2Host, ipv4, ipv6, ok, numbering: this.numberingMode() },
    });

    return { ns1: ns1Host, ns2: ns2Host, ipv4, ipv6, baseDomain: base, steps, ok };
  }

  private async applyDirectAdminNameservers(
    serverId: string,
    ns1: string,
    ns2: string,
    steps: NsProvisionStep[],
  ): Promise<void> {
    try {
      const da = await this.directAdmin.applyBrandedNameserversOnNode(serverId, ns1, ns2);
      const mapStatus = (
        s: 'updated' | 'unchanged' | 'skipped' | 'error',
      ): NsProvisionStepStatus =>
        s === 'updated'
          ? 'updated'
          : s === 'unchanged'
            ? 'unchanged'
            : s === 'skipped'
              ? 'skipped'
              : 'error';

      steps.push({
        step: 'DirectAdmin: Admin Settings (ns1/ns2)',
        status: mapStatus(da.adminSettings),
        detail:
          da.adminSettings === 'skipped'
            ? 'Brak konfiguracji DA na węźle.'
            : da.adminSettingsDetail ?? `${ns1}, ${ns2}`,
      });
      steps.push({
        step: 'DirectAdmin: domyślne NS dla nowych kont',
        status: mapStatus(da.nameServerDefaults),
        detail: `${ns1}, ${ns2}`,
      });
      const { updated, skipped, failed } = da.hostingAccounts;
      steps.push({
        step: 'DirectAdmin: NS istniejących kont hostingowych',
        status: failed > 0 ? 'error' : updated > 0 ? 'updated' : 'unchanged',
        detail: `zaktualizowano: ${updated}, bez zmian: ${skipped}, błędy: ${failed}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`applyDirectAdminNameservers server=${serverId}: ${msg}`);
      steps.push({
        step: 'DirectAdmin: synchronizacja NS',
        status: 'error',
        detail: msg,
      });
    }
  }

  /** Auto-trigger used on node activation — never throws, logs instead. */
  async tryAutoProvision(serverId: string): Promise<void> {
    if (!this.ovh.isConfigured()) return;
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server || server.nsProvisionedAt) return;
    if (!server.ipAddress || /^(0\.0\.0\.0|pending|n\/a)$/i.test(server.ipAddress)) return;
    try {
      const res = await this.provisionNodeNameservers(serverId, {});
      this.logger.log(
        `Auto-provisioned NS for node=${serverId}: ${res.ns1}/${res.ns2} (ok=${res.ok})`,
      );
    } catch (err) {
      this.logger.warn(
        `Auto NS provisioning skipped for node=${serverId}: ${(err as Error).message}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // OVH primitives
  // ---------------------------------------------------------------------------

  private formatOvhError(err: unknown): string {
    const msg = (err as Error).message ?? String(err);
    if (/not been granted/i.test(msg)) {
      return `${msg} — ${GLUE_DENIED_HINT}`;
    }
    return msg;
  }

  private async ensureZoneRecord(
    zone: string,
    subDomain: string,
    fieldType: 'A' | 'AAAA',
    target: string,
    steps: NsProvisionStep[],
  ): Promise<void> {
    const label = `${fieldType} ${subDomain}.${zone}`;
    try {
      const ids = await this.ovh.request<number[]>(
        'GET',
        `/domain/zone/${encodeURIComponent(zone)}/record?fieldType=${fieldType}&subDomain=${encodeURIComponent(subDomain)}`,
      );
      if (Array.isArray(ids) && ids.length > 0) {
        const current = await this.ovh.request<{ target: string }>(
          'GET',
          `/domain/zone/${encodeURIComponent(zone)}/record/${ids[0]}`,
        );
        if (current?.target === target) {
          steps.push({ step: label, status: 'unchanged', detail: target });
          return;
        }
        await this.ovh.request('PUT', `/domain/zone/${encodeURIComponent(zone)}/record/${ids[0]}`, {
          target,
          ttl: 3600,
        });
        steps.push({ step: label, status: 'updated', detail: target });
        return;
      }
      await this.ovh.request('POST', `/domain/zone/${encodeURIComponent(zone)}/record`, {
        fieldType,
        subDomain,
        target,
        ttl: 3600,
      });
      steps.push({ step: label, status: 'created', detail: target });
    } catch (err) {
      steps.push({ step: label, status: 'error', detail: this.formatOvhError(err) });
    }
  }

  private async removeZoneRecord(
    zone: string,
    subDomain: string,
    fieldType: 'A' | 'AAAA',
    steps: NsProvisionStep[],
  ): Promise<void> {
    const label = `Usuń ${fieldType} ${subDomain}.${zone}`;
    try {
      const ids = await this.ovh.request<number[]>(
        'GET',
        `/domain/zone/${encodeURIComponent(zone)}/record?fieldType=${fieldType}&subDomain=${encodeURIComponent(subDomain)}`,
      );
      if (!Array.isArray(ids) || ids.length === 0) {
        steps.push({ step: label, status: 'skipped', detail: 'brak rekordu' });
        return;
      }
      for (const id of ids) {
        await this.ovh.request('DELETE', `/domain/zone/${encodeURIComponent(zone)}/record/${id}`);
      }
      steps.push({ step: label, status: 'updated', detail: `usunięto ${ids.length}` });
    } catch (err) {
      steps.push({ step: label, status: 'error', detail: this.formatOvhError(err) });
    }
  }

  private async refreshZone(zone: string, steps: NsProvisionStep[]): Promise<void> {
    try {
      await this.ovh.request('POST', `/domain/zone/${encodeURIComponent(zone)}/refresh`);
      steps.push({ step: `Odświeżenie strefy ${zone}`, status: 'updated' });
    } catch (err) {
      steps.push({
        step: `Odświeżenie strefy ${zone}`,
        status: 'error',
        detail: this.formatOvhError(err),
      });
    }
  }

  private async ensureGlue(
    domain: string,
    fqdn: string,
    ips: string[],
    steps: NsProvisionStep[],
  ): Promise<void> {
    const label = `Glue ${fqdn}`;
    let host: string;
    try {
      // OVH requires FQDN in path and body (e.g. ns1.verris.pl), not bare label "ns1".
      host = normalizeGlueFqdn(fqdn, domain);
    } catch (err) {
      steps.push({ step: label, status: 'error', detail: (err as Error).message });
      return;
    }
    try {
      let existing: OvhGlue | null = null;
      try {
        existing = await this.ovh.request<OvhGlue>(
          'GET',
          `/domain/${encodeURIComponent(domain)}/glueRecord/${encodeURIComponent(host)}`,
        );
      } catch {
        existing = null;
      }

      if (existing && Array.isArray(existing.ips)) {
        const same =
          existing.ips.length === ips.length && ips.every((ip) => existing!.ips.includes(ip));
        if (same) {
          steps.push({ step: label, status: 'unchanged', detail: ips.join(', ') });
          return;
        }
        await this.ovh.request(
          'POST',
          `/domain/${encodeURIComponent(domain)}/glueRecord/${encodeURIComponent(host)}/update`,
          { ips },
        );
        steps.push({ step: label, status: 'updated', detail: ips.join(', ') });
        return;
      }

      await this.ovh.request('POST', `/domain/${encodeURIComponent(domain)}/glueRecord`, {
        host,
        ips,
      });
      steps.push({ step: label, status: 'created', detail: ips.join(', ') });
    } catch (err) {
      steps.push({ step: label, status: 'error', detail: this.formatOvhError(err) });
    }
  }
}
