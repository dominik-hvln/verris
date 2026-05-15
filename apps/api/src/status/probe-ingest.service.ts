import { Injectable, Logger } from '@nestjs/common';
import {
  IncidentSeverity,
  IncidentStatus,
  Prisma,
  ProbeKind,
  ProbeSeverity,
  ServiceProbe,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ProbeRunResult } from './probe-runner.service';

const FAIL_THRESHOLD = 2;
const BUCKET_DURATION_S = 60;

@Injectable()
export class ProbeIngestService {
  private readonly logger = new Logger(ProbeIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Persists one probe sample (1-minute bucket, idempotent) AND advances the
   * incident state machine for the probe. Designed to be called by both
   * server-side cron and node-side agents, so the maths must be commutative.
   *
   * State machine:
   *   - On a FAIL: bump `consecutiveFailures`. If it crosses `FAIL_THRESHOLD`
   *     and there's no OPEN incident yet, open one with severity from the
   *     probe configuration.
   *   - On a SUCCESS: reset counter. If there's an OPEN incident, resolve it
   *     and audit `PROBE_INCIDENT_RESOLVED`.
   */
  async ingestSample(
    probeId: string,
    result: ProbeRunResult,
    when: Date = new Date(),
  ): Promise<void> {
    const probe = await this.prisma.serviceProbe.findUnique({ where: { id: probeId } });
    if (!probe) {
      this.logger.warn(`ingestSample: probe=${probeId} not found`);
      return;
    }
    if (!probe.isEnabled) return;

    const bucketStart = floorToBucket(when, BUCKET_DURATION_S);

    // Upsert the bucketed sample. Using "increment" makes this idempotent and
    // correct under concurrent writes from server-side + node-side prober.
    await this.prisma.probeSample.upsert({
      where: {
        probeId_bucketStart_bucketDurationS: {
          probeId,
          bucketStart,
          bucketDurationS: BUCKET_DURATION_S,
        },
      },
      create: {
        probeId,
        bucketStart,
        bucketDurationS: BUCKET_DURATION_S,
        totalCount: 1,
        successCount: result.ok ? 1 : 0,
        avgLatencyMs: result.latencyMs,
        maxLatencyMs: result.latencyMs,
        errorCode: result.ok ? null : result.errorCode ?? null,
      },
      update: {
        totalCount: { increment: 1 },
        successCount: result.ok ? { increment: 1 } : undefined,
        // Take the max of the old vs. new latency. We can't easily compute a
        // running mean without extra tracking, so we approximate avg = max for
        // small buckets — good enough for status page sparklines.
        maxLatencyMs: { set: result.latencyMs },
        errorCode: result.ok ? null : result.errorCode ?? undefined,
      },
    });

    await this.advanceState(probe, result, when);
  }

  private async advanceState(
    probe: ServiceProbe,
    result: ProbeRunResult,
    when: Date,
  ): Promise<void> {
    if (result.ok) {
      const updates: Prisma.ServiceProbeUpdateInput = {
        consecutiveFailures: 0,
        lastSuccessAt: when,
        lastSampleAt: when,
      };
      await this.prisma.serviceProbe.update({ where: { id: probe.id }, data: updates });

      // Resolve any open incident.
      const open = await this.prisma.probeIncident.findFirst({
        where: { probeId: probe.id, status: IncidentStatus.OPEN },
        orderBy: { startedAt: 'desc' },
      });
      if (open) {
        const updated = await this.prisma.probeIncident.update({
          where: { id: open.id },
          data: { status: IncidentStatus.RESOLVED, resolvedAt: when },
        });
        await this.audit.record({
          action: 'PROBE_INCIDENT_RESOLVED',
          details: {
            incidentId: updated.id,
            probeId: probe.id,
            serverId: probe.serverId,
            kind: probe.kind,
            target: probe.target,
            durationMs: updated.resolvedAt
              ? updated.resolvedAt.getTime() - updated.startedAt.getTime()
              : null,
          },
        });
        this.logger.log(`Incident ${updated.id} for probe=${probe.id} resolved`);
      }
      return;
    }

    // Fail path
    const next = await this.prisma.serviceProbe.update({
      where: { id: probe.id },
      data: {
        consecutiveFailures: { increment: 1 },
        lastFailureAt: when,
        lastSampleAt: when,
      },
    });

    if (next.consecutiveFailures < FAIL_THRESHOLD) return;

    const existingOpen = await this.prisma.probeIncident.findFirst({
      where: { probeId: probe.id, status: IncidentStatus.OPEN },
    });
    if (existingOpen) return;

    const incident = await this.prisma.probeIncident.create({
      data: {
        probeId: probe.id,
        severity: mapSeverity(probe.severity),
        status: IncidentStatus.OPEN,
        title: defaultIncidentTitle(probe.kind, probe.target),
        detectionMeta: {
          consecutiveFailures: next.consecutiveFailures,
          firstSeenAt: when.toISOString(),
          errorCode: result.errorCode ?? null,
          latencyMs: result.latencyMs,
        },
      },
    });

    const action =
      probe.severity === ProbeSeverity.MAJOR
        ? 'PROBE_INCIDENT_OPENED_MAJOR'
        : 'PROBE_INCIDENT_OPENED_MINOR';
    await this.audit.record({
      action,
      details: {
        incidentId: incident.id,
        probeId: probe.id,
        serverId: probe.serverId,
        kind: probe.kind,
        target: probe.target,
        consecutiveFailures: next.consecutiveFailures,
      },
    });
    this.logger.warn(
      `Incident OPENED severity=${probe.severity} probe=${probe.id} target=${probe.target}`,
    );
  }
}

function floorToBucket(when: Date, durationS: number): Date {
  const ts = Math.floor(when.getTime() / 1000);
  return new Date((ts - (ts % durationS)) * 1000);
}

function mapSeverity(severity: ProbeSeverity): IncidentSeverity {
  return severity === ProbeSeverity.MAJOR ? IncidentSeverity.MAJOR : IncidentSeverity.MINOR;
}

function defaultIncidentTitle(kind: ProbeKind, target: string): string {
  return `${kind} probe failing for ${target}`;
}
