import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ServerIdentityGuard } from '../servers/guards/server-identity.guard';
import { NodeProbeBatchDto } from './dto/probe-ingest.dto';
import { ProbeIngestService } from './probe-ingest.service';

/**
 * Node-side probe push endpoint (H-3). The bootstrap agent on each compute
 * node runs local `nc -z`/`curl` checks every minute and POSTs the results
 * here so we can detect issues that look healthy from outside but are broken
 * locally (e.g. service crashed but nginx still answers a cached page).
 *
 * Auth via `ServerIdentityGuard` (X-Server-Id + X-Server-Token), same as
 * `/telemetry/lve`. We additionally verify the probe belongs to the calling
 * server so a compromised node can't push samples for another node's probes.
 */
@Controller('agent/probes')
@UseGuards(ServerIdentityGuard)
export class ProbeIngestController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: ProbeIngestService,
  ) {}

  /**
   * Returns the probe list for the calling server so the on-node agent knows
   * what to check. Read-only; tells the agent which protocol + target combos
   * to test locally. Disabled probes are filtered server-side.
   */
  @Get('list')
  @HttpCode(200)
  async list(@Req() req: Request & { serverId?: string }) {
    const serverId = req.serverId;
    if (!serverId) return { probes: [] };
    const probes = await this.prisma.serviceProbe.findMany({
      where: { serverId, isEnabled: true },
      select: { id: true, kind: true, target: true },
      orderBy: { kind: 'asc' },
    });
    return { probes };
  }

  @Post('local')
  @HttpCode(202)
  async push(
    @Body() dto: NodeProbeBatchDto,
    @Req() req: Request & { serverId?: string },
  ) {
    const serverId = req.serverId;
    if (!serverId) return { received: 0 };

    const probeIds = Array.from(new Set(dto.samples.map((s) => s.probeId)));
    const validProbes = await this.prisma.serviceProbe.findMany({
      where: { id: { in: probeIds }, serverId },
      select: { id: true },
    });
    const allowed = new Set(validProbes.map((p) => p.id));

    const when = dto.takenAt ? new Date(dto.takenAt) : new Date();

    let accepted = 0;
    for (const sample of dto.samples) {
      if (!allowed.has(sample.probeId)) continue;
      await this.ingest.ingestSample(
        sample.probeId,
        {
          ok: sample.ok,
          latencyMs: sample.latencyMs,
          errorCode: sample.errorCode,
        },
        when,
      );
      accepted += 1;
    }
    return { received: accepted };
  }
}
