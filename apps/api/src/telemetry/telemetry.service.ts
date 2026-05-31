import { Injectable, Logger } from '@nestjs/common';
import { Account, Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { CloudLinuxTelemetryDto } from './telemetry.dto';

const DEFAULT_BUCKET_S = 60;
const MIN_BUCKET_S = 15;
const MAX_BUCKET_S = 86_400;

interface ProcessResult {
  received: true;
  processedAccounts: number;
  persistedSamples: number;
  unknownAccounts: number;
  bucketStart: string;
  bucketDurationS: number;
}

/**
 * Receives bucketed CloudLinux LVE samples from compute nodes and persists
 * them as `UsageMetric` rows.
 *
 * Idempotency is enforced by the unique key
 * `(subscriptionId, bucketStart, bucketDurationS)`: if the agent retries the
 * same batch we just no-op the duplicates.
 *
 * Unknown DA usernames (no matching `Account`) are tolerated — they're logged
 * and counted but do not break the batch (e.g. orphan accounts from manual
 * cleanups, or system users like `webapps`).
 */
@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processLveMetrics(
    data: CloudLinuxTelemetryDto & { serverId: string },
  ): Promise<ProcessResult> {
    const bucketDurationS = clampBucket(data.bucketDurationS ?? DEFAULT_BUCKET_S);
    const bucketStart = resolveBucketStart(data.bucketStart, bucketDurationS);

    this.logger.log(
      `Telemetry batch from server=${data.serverId} accounts=${data.accounts.length} ` +
        `bucket=${bucketStart.toISOString()} duration=${bucketDurationS}s`,
    );

    await this.prisma.server.update({
      where: { id: data.serverId },
      data: {
        lastHeartbeatAt: new Date(),
        agentVersion: data.agentVersion ?? undefined,
        ...(data.node
          ? {
              cagefsEnabled: data.node.cagefsEnabled ?? null,
              cagefsEnabledCount: data.node.cagefsEnabledCount ?? null,
              cagefsCheckedAt: new Date(),
            }
          : {}),
      },
    });

    if (data.accounts.length === 0) {
      return {
        received: true,
        processedAccounts: 0,
        persistedSamples: 0,
        unknownAccounts: 0,
        bucketStart: bucketStart.toISOString(),
        bucketDurationS,
      };
    }

    const usernames = Array.from(new Set(data.accounts.map((a) => a.username)));
    const accounts = await this.prisma.account.findMany({
      where: { daUsername: { in: usernames }, serverId: data.serverId },
    });
    const accountByUsername = new Map<string, Account>(
      accounts.map((a) => [a.daUsername, a]),
    );

    let persisted = 0;
    let unknown = 0;

    // Push samples one-by-one (small N — typically tens-to-low-hundreds per
    // node per batch) so a single bad row doesn't kill the whole batch.
    for (const sample of data.accounts) {
      const account = accountByUsername.get(sample.username);
      if (!account) {
        unknown += 1;
        continue;
      }

      try {
        await this.prisma.usageMetric.upsert({
          where: {
            subscriptionId_bucketStart_bucketDurationS: {
              subscriptionId: account.subscriptionId,
              bucketStart,
              bucketDurationS,
            },
          },
          update: {
            cpuUsageAvg: sample.cpuUsagePercent,
            cpuUsageMax: sample.cpuUsageMaxPercent ?? sample.cpuUsagePercent,
            memUsageAvgMb: sample.memUsageMb,
            memUsageMaxMb: sample.memUsageMaxMb ?? sample.memUsageMb,
            diskUsageMb: sample.diskUsageMb,
            ioUsageKbps: sample.ioUsageKbps ?? 0,
          },
          create: {
            subscriptionId: account.subscriptionId,
            accountId: account.id,
            serverId: data.serverId,
            bucketStart,
            bucketDurationS,
            cpuUsageAvg: sample.cpuUsagePercent,
            cpuUsageMax: sample.cpuUsageMaxPercent ?? sample.cpuUsagePercent,
            memUsageAvgMb: sample.memUsageMb,
            memUsageMaxMb: sample.memUsageMaxMb ?? sample.memUsageMb,
            diskUsageMb: sample.diskUsageMb,
            ioUsageKbps: sample.ioUsageKbps ?? 0,
          },
        });
        persisted += 1;
      } catch (err) {
        // Most likely a transient DB error — record but don't fail the batch.
        const e = err as Error & { code?: string };
        this.logger.warn(
          `Failed to persist usage sample for ${sample.username} (server=${data.serverId}): ` +
            `${e.code ?? ''} ${e.message}`,
        );
      }
    }

    if (unknown > 0) {
      this.logger.debug(
        `Skipped ${unknown} unknown DA username(s) on server=${data.serverId}: ` +
          usernames
            .filter((u) => !accountByUsername.has(u))
            .slice(0, 10)
            .join(', '),
      );
    }

    return {
      received: true,
      processedAccounts: data.accounts.length,
      persistedSamples: persisted,
      unknownAccounts: unknown,
      bucketStart: bucketStart.toISOString(),
      bucketDurationS,
    };
  }

  /**
   * Returns the latest N buckets for a single subscription. Used by the
   * client panel "service detail" page and by the autoscaling engine.
   */
  async getRecentForSubscription(subscriptionId: string, limit = 60) {
    return this.prisma.usageMetric.findMany({
      where: { subscriptionId },
      orderBy: { bucketStart: 'desc' },
      take: limit,
    });
  }
}

function clampBucket(value: number): number {
  if (value < MIN_BUCKET_S) return MIN_BUCKET_S;
  if (value > MAX_BUCKET_S) return MAX_BUCKET_S;
  return Math.round(value);
}

/**
 * Bucket start is normalised to a multiple of `bucketDurationS` UTC seconds —
 * keeps buckets aligned across all nodes regardless of when the agent fires.
 */
function resolveBucketStart(input: string | undefined, durationS: number): Date {
  const candidate = input ? new Date(input) : new Date(Date.now() - durationS * 1000);
  if (Number.isNaN(candidate.getTime())) {
    return alignToBucket(new Date(Date.now() - durationS * 1000), durationS);
  }
  return alignToBucket(candidate, durationS);
}

function alignToBucket(date: Date, durationS: number): Date {
  const ms = durationS * 1000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

// Suppress unused warning — Prisma typings are imported for the relations.
void Prisma;
