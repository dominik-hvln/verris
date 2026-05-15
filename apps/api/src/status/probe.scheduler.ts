import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ServerStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { ProbeRunnerService } from './probe-runner.service';
import { ProbeIngestService } from './probe-ingest.service';

const PROBE_BATCH_LIMIT = 200;

/**
 * Server-side prober (H-2). Every 30 s walks every enabled probe whose server
 * is ACTIVE/MAINTENANCE and runs the matching protocol check. Each result is
 * pushed through `ProbeIngestService`, which handles bucketed persistence and
 * the incident state machine.
 *
 * We deliberately fan out concurrently with `Promise.all` because every check
 * already enforces a 5 s timeout — this keeps the tick well under 30 s even
 * with hundreds of probes.
 */
@Injectable()
export class ProbeScheduler {
  private readonly logger = new Logger(ProbeScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: ProbeRunnerService,
    private readonly ingest: ProbeIngestService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'status:server-side-prober' })
  async tick(): Promise<void> {
    let processed = 0;
    try {
      const probes = await this.prisma.serviceProbe.findMany({
        where: {
          isEnabled: true,
          server: {
            status: { in: [ServerStatus.ACTIVE, ServerStatus.MAINTENANCE] },
          },
        },
        take: PROBE_BATCH_LIMIT,
        orderBy: { lastSampleAt: { sort: 'asc', nulls: 'first' } },
      });

      const now = new Date();
      await Promise.all(
        probes.map(async (probe) => {
          try {
            const result = await this.runner.run(probe.kind, probe.target);
            await this.ingest.ingestSample(probe.id, result, now);
            processed += 1;
          } catch (err) {
            this.logger.error(
              `Probe ${probe.id} threw: ${(err as Error).message}`,
              (err as Error).stack,
            );
          }
        }),
      );
    } catch (err) {
      this.logger.error(`Prober tick failed: ${(err as Error).message}`);
    }
    if (processed > 0) {
      this.logger.debug(`Probed ${processed} services`);
    }
  }
}
