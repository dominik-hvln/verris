import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { OvhClient } from './ovh.client';

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

/**
 * Automates branded nameservers for a compute node at OVH:
 *   1. A/AAAA records in the base zone (ns1.<slug>, ns2.<slug>)
 *   2. Glue records (host → IPv4 [+ IPv6]) on the base domain
 *   3. Stores the resulting NS hostnames on the Server row
 *
 * Idempotent: re-running reconciles existing records. Until we run our own
 * PowerDNS cluster, both branded NS for a node point at that same node's IPs
 * (single-node authoritative); the PowerDNS phase will spread them across hosts.
 */
@Injectable()
export class NodeDnsService {
  private readonly logger = new Logger(NodeDnsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ovh: OvhClient,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  isConfigured(): boolean {
    return this.ovh.isConfigured();
  }

  private baseDomain(): string {
    return (this.config.get<string>('HOSTING_NS_BASE_DOMAIN') ?? 'verris.pl').toLowerCase();
  }

  /** Stable, DNS-safe slug for a node (used in ns1.<slug>.<base>). */
  private nodeSlug(server: { name: string | null; region: string | null; id: string }): string {
    const raw = server.name || server.region || `node-${server.id.slice(0, 8)}`;
    const slug = raw
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return slug || `node-${server.id.slice(0, 8)}`;
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
    const slug = this.nodeSlug(server);
    const ns1Sub = `ns1.${slug}`;
    const ns2Sub = `ns2.${slug}`;
    const ns1Host = `${ns1Sub}.${base}`;
    const ns2Host = `${ns2Sub}.${base}`;
    const steps: NsProvisionStep[] = [];

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

    // 2) Glue records on the base domain.
    const ips = ipv6 ? [ipv4, ipv6] : [ipv4];
    await this.ensureGlue(base, ns1Host, ips, steps);
    await this.ensureGlue(base, ns2Host, ips, steps);

    // 3) Persist NS hostnames + IPv6 on the node.
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

    const ok = !steps.some((s) => s.status === 'error');
    await this.audit.record({
      action: 'NODE_NS_PROVISION',
      userId: opts.actorUserId,
      actorUserId: opts.actorUserId,
      details: { serverId, ns1: ns1Host, ns2: ns2Host, ipv4, ipv6, ok },
    });

    return { ns1: ns1Host, ns2: ns2Host, ipv4, ipv6, baseDomain: base, steps, ok };
  }

  /** Auto-trigger used on node activation — never throws, logs instead. */
  async tryAutoProvision(serverId: string): Promise<void> {
    if (!this.ovh.isConfigured()) return;
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server || server.nsProvisionedAt) return; // already done
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
      steps.push({ step: label, status: 'error', detail: (err as Error).message });
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
        detail: (err as Error).message,
      });
    }
  }

  private async ensureGlue(
    domain: string,
    host: string,
    ips: string[],
    steps: NsProvisionStep[],
  ): Promise<void> {
    const label = `Glue ${host}`;
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
          existing.ips.length === ips.length &&
          ips.every((ip) => existing!.ips.includes(ip));
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
      steps.push({ step: label, status: 'error', detail: (err as Error).message });
    }
  }
}
