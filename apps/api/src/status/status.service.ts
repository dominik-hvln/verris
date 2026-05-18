import { Injectable, Logger } from '@nestjs/common';
import {
  IncidentStatus,
  ProbeIncident,
  ProbeKind,
  ProbeSeverity,
  ServerStatus,
  ServiceProbe,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL_MS = 30 * 1000;
const UPTIME_DEFAULT_DAYS = 30;

export interface ProbeStatusDto {
  id: string;
  kind: ProbeKind;
  target: string;
  label: string | null;
  severity: ProbeSeverity;
  state: 'OK' | 'DEGRADED' | 'DOWN';
  lastSampleAt: string | null;
  declaredSlaPct: string;
  computedUptimePct: string;
  computedWindowDays: number;
  avgLatencyMs: number | null;
}

export interface ServerStatusDto {
  id: string;
  name: string;
  region: string | null;
  status: ServerStatus;
  state: 'OK' | 'DEGRADED' | 'DOWN';
  probes: ProbeStatusDto[];
}

export interface PublicIncidentDto {
  id: string;
  serverId: string;
  serverName: string;
  probeKind: ProbeKind;
  probeTarget: string;
  severity: 'MINOR' | 'MAJOR';
  status: IncidentStatus;
  title: string;
  publicMessage: string | null;
  startedAt: string;
  resolvedAt: string | null;
  durationMinutes: number | null;
}

export interface PublicStatusDto {
  generatedAt: string;
  overall: 'OK' | 'DEGRADED' | 'DOWN';
  servers: ServerStatusDto[];
  activeIncidents: PublicIncidentDto[];
  recentIncidents: PublicIncidentDto[];
}

interface IncidentForUser {
  serverId: string;
  serverName: string;
  probeTarget: string;
  probeKind: ProbeKind;
  severity: 'MINOR' | 'MAJOR';
  startedAt: string;
  title: string;
}

/**
 * Aggregates probe state into the public `GET /status` payload (H-5) and the
 * per-customer banner feed (H-8). All read paths share a 30 s in-memory cache
 * so the public page survives spikes (status.verris.pl) without overloading
 * the DB. We intentionally don't use Redis here — the cache is per-process
 * and rebuilt on miss; if we ever scale horizontally we can swap the impl
 * without touching callers.
 */
@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name);
  private cached: { at: number; payload: PublicStatusDto } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getPublicStatus(): Promise<PublicStatusDto> {
    if (this.cached && Date.now() - this.cached.at < CACHE_TTL_MS) {
      return this.cached.payload;
    }
    const fresh = await this.buildPublicStatus();
    this.cached = { at: Date.now(), payload: fresh };
    return fresh;
  }

  /**
   * Fetches the open incident (if any) covering the given server. Used by the
   * client-panel banner (H-8) — we want a tight per-user query, NOT the cached
   * page-level payload.
   */
  async findActiveIncidentForServer(serverId: string): Promise<IncidentForUser | null> {
    const incident = await this.prisma.probeIncident.findFirst({
      where: {
        status: IncidentStatus.OPEN,
        probe: { serverId },
      },
      orderBy: { startedAt: 'asc' },
      include: {
        probe: { include: { server: { select: { id: true, name: true } } } },
      },
    });
    if (!incident) return null;
    return {
      serverId: incident.probe.serverId,
      serverName: incident.probe.server.name ?? incident.probe.serverId,
      probeKind: incident.probe.kind,
      probeTarget: incident.probe.target,
      severity: incident.severity,
      startedAt: incident.startedAt.toISOString(),
      title: incident.title,
    };
  }

  async findOpenIncidentsForServers(
    serverIds: string[],
  ): Promise<
    Array<{
      id: string;
      serverId: string;
      serverName: string;
      probeKind: ProbeKind;
      probeTarget: string;
      severity: 'MINOR' | 'MAJOR';
      title: string;
      publicMessage: string | null;
      startedAt: string;
    }>
  > {
    const uniq = Array.from(new Set(serverIds.filter(Boolean)));
    if (!uniq.length) return [];

    const rows = await this.prisma.probeIncident.findMany({
      where: {
        status: IncidentStatus.OPEN,
        probe: { serverId: { in: uniq } },
      },
      orderBy: { startedAt: 'asc' },
      include: {
        probe: { include: { server: { select: { id: true, name: true } } } },
      },
    });

    return rows.map((i) => ({
      id: i.id,
      serverId: i.probe.serverId,
      serverName: i.probe.server.name ?? i.probe.server.id,
      probeKind: i.probe.kind,
      probeTarget: i.probe.target,
      severity: i.severity as 'MINOR' | 'MAJOR',
      title: i.title,
      publicMessage: i.publicMessage,
      startedAt: i.startedAt.toISOString(),
    }));
  }

  invalidate(): void {
    this.cached = null;
  }

  // ---------------------------------------------------------------------------

  private async buildPublicStatus(): Promise<PublicStatusDto> {
    const since = new Date(Date.now() - UPTIME_DEFAULT_DAYS * 24 * 60 * 60 * 1000);

    const servers = await this.prisma.server.findMany({
      where: {
        status: { in: [ServerStatus.ACTIVE, ServerStatus.MAINTENANCE] },
      },
      include: {
        probes: {
          where: { isEnabled: true, isPublic: true },
          orderBy: [{ severity: 'desc' }, { kind: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });

    // Aggregate samples in one query for all visible probes — Prisma's
    // groupBy keeps us O(probes) regardless of bucket count.
    const probeIds = servers.flatMap((s) => s.probes.map((p) => p.id));
    const aggregates = probeIds.length
      ? await this.prisma.probeSample.groupBy({
          by: ['probeId'],
          where: { probeId: { in: probeIds }, bucketStart: { gte: since } },
          _sum: { totalCount: true, successCount: true },
          _avg: { avgLatencyMs: true },
        })
      : [];
    const aggByProbe = new Map(
      aggregates.map((row) => [
        row.probeId,
        {
          total: row._sum.totalCount ?? 0,
          success: row._sum.successCount ?? 0,
          avgLatency: Math.round(row._avg.avgLatencyMs ?? 0),
        },
      ]),
    );

    const openIncidents = probeIds.length
      ? await this.prisma.probeIncident.findMany({
          where: { probeId: { in: probeIds }, status: IncidentStatus.OPEN },
          include: { probe: { include: { server: { select: { id: true, name: true } } } } },
        })
      : [];
    const openByProbe = new Map(openIncidents.map((i) => [i.probeId, i]));

    const recentIncidents = probeIds.length
      ? await this.prisma.probeIncident.findMany({
          where: { probeId: { in: probeIds } },
          orderBy: { startedAt: 'desc' },
          take: 10,
          include: { probe: { include: { server: { select: { id: true, name: true } } } } },
        })
      : [];

    const serverDtos: ServerStatusDto[] = servers.map((server) => {
      const probeDtos: ProbeStatusDto[] = server.probes.map((probe) =>
        toProbeStatusDto(probe, aggByProbe.get(probe.id), openByProbe.get(probe.id)),
      );
      return {
        id: server.id,
        name: server.name ?? server.id,
        region: server.region,
        status: server.status,
        state: aggregateState(probeDtos),
        probes: probeDtos,
      };
    });

    const overall = aggregateState(serverDtos.flatMap((s) => s.probes));

    return {
      generatedAt: new Date().toISOString(),
      overall,
      servers: serverDtos,
      activeIncidents: openIncidents.map(toPublicIncidentDto),
      recentIncidents: recentIncidents.map(toPublicIncidentDto),
    };
  }
}

function toProbeStatusDto(
  probe: ServiceProbe,
  agg: { total: number; success: number; avgLatency: number } | undefined,
  open: ProbeIncident | undefined,
): ProbeStatusDto {
  const total = agg?.total ?? 0;
  const success = agg?.success ?? 0;
  const computedUptimePct = total > 0 ? (success / total) * 100 : 100;
  const state: 'OK' | 'DEGRADED' | 'DOWN' = open
    ? open.severity === 'MAJOR'
      ? 'DOWN'
      : 'DEGRADED'
    : probe.consecutiveFailures > 0
      ? 'DEGRADED'
      : 'OK';
  return {
    id: probe.id,
    kind: probe.kind,
    target: probe.target,
    label: probe.label,
    severity: probe.severity,
    state,
    lastSampleAt: probe.lastSampleAt?.toISOString() ?? null,
    declaredSlaPct: probe.declaredSlaPct.toFixed(4),
    computedUptimePct: computedUptimePct.toFixed(4),
    computedWindowDays: UPTIME_DEFAULT_DAYS,
    avgLatencyMs: agg ? agg.avgLatency : null,
  };
}

function aggregateState(probes: { state: string }[]): 'OK' | 'DEGRADED' | 'DOWN' {
  if (probes.some((p) => p.state === 'DOWN')) return 'DOWN';
  if (probes.some((p) => p.state === 'DEGRADED')) return 'DEGRADED';
  return 'OK';
}

function toPublicIncidentDto(
  incident: ProbeIncident & {
    probe: ServiceProbe & { server: { id: string; name: string | null } };
  },
): PublicIncidentDto {
  const ended = incident.resolvedAt ?? null;
  return {
    id: incident.id,
    serverId: incident.probe.serverId,
    serverName: incident.probe.server.name ?? incident.probe.serverId,
    probeKind: incident.probe.kind,
    probeTarget: incident.probe.target,
    severity: incident.severity,
    status: incident.status,
    title: incident.title,
    publicMessage: incident.publicMessage,
    startedAt: incident.startedAt.toISOString(),
    resolvedAt: ended?.toISOString() ?? null,
    durationMinutes: ended
      ? Math.round((ended.getTime() - incident.startedAt.getTime()) / 60000)
      : null,
  };
}
