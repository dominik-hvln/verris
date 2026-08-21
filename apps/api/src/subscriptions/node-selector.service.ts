import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Plan, Server, ServerStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';

export interface NodeSelectionContext {
  /** Hint towards co-locating with this region if multiple nodes qualify. */
  preferredRegion?: string | null;
}

interface ServerScore {
  server: Server;
  /** Free CPU% available on the node (totalCpuCores * 100 − allocatedCpu). */
  freeCpu: number;
  /** Free RAM in MB. */
  freeRam: number;
  /** Free disk in MB. */
  freeDisk: number;
  /** Composite load score (lower = less loaded). */
  load: number;
}

/**
 * Selects an active compute node that has enough free capacity to host a new
 * account for a given Plan.
 *
 * Algorithm:
 *   1. Filter nodes to status = ACTIVE.
 *   2. Reject nodes that don't have enough free capacity for the plan's CPU /
 *      RAM / DISK base limits.
 *   3. Score remaining nodes by composite load (CPU + RAM + DISK utilisation,
 *      averaged) and pick the *least loaded* one. Region affinity breaks ties.
 *
 * If no node has free capacity we throw `ServiceUnavailableException` so the
 * caller can show a clear message to the user (and we'll surface the alert in
 * the admin panel).
 */
@Injectable()
export class NodeSelectorService {
  private readonly logger = new Logger(NodeSelectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async pickServerForPlan(plan: Plan, ctx: NodeSelectionContext = {}): Promise<Server> {
    // Tylko węzły ACTIVE, które NIE są „cordoned" (acceptsNewAccounts=false).
    // Cordon pozwala wstrzymać przyjmowanie nowych kont na pojedynczym węźle bez
    // przełączania go w MAINTENANCE (co wstrzymałoby sprzedaż globalnie).
    const candidates = await this.prisma.server.findMany({
      where: { status: ServerStatus.ACTIVE, acceptsNewAccounts: true },
    });

    if (candidates.length === 0) {
      // Sprint 4 / A-08: jeżeli żaden węzeł nie jest ACTIVE, sprawdź czy
      // wszystkie są w MAINTENANCE — wtedy klient zobaczy konkretny powód.
      const inMaintenance = await this.prisma.server.findMany({
        where: { status: ServerStatus.MAINTENANCE },
        select: { maintenanceReason: true },
      });
      if (inMaintenance.length > 0) {
        this.logger.warn(
          `Provisioning blocked — ${inMaintenance.length} node(s) in MAINTENANCE.`,
        );
        const firstReason = inMaintenance.find((s) => s.maintenanceReason)?.maintenanceReason;
        throw new ServiceUnavailableException(
          firstReason
            ? `Sprzedaż wstrzymana: trwa serwis infrastruktury (${firstReason}). Spróbuj ponownie za chwilę.`
            : 'Sprzedaż wstrzymana: trwa serwis infrastruktury. Spróbuj ponownie za chwilę.',
        );
      }
      this.logger.warn('No active compute nodes available for provisioning');
      throw new ServiceUnavailableException(
        'Brak aktywnych węzłów hostingowych. Skontaktuj się z BOK.',
      );
    }

    // Liczba kont per węzeł — potrzebna do limitu maxAccounts.
    const accountCounts = await this.prisma.account.groupBy({
      by: ['serverId'],
      where: { serverId: { in: candidates.map((c) => c.id) } },
      _count: { _all: true },
    });
    const countByServer = new Map<string, number>(
      accountCounts.map((row) => [row.serverId, row._count._all]),
    );

    const scored: ServerScore[] = [];
    for (const server of candidates) {
      const totalCpu = (server.totalCpuCores ?? 0) * 100;
      const totalRam = server.totalMemoryMb ?? 0;
      const totalDisk = server.totalDiskMb ?? 0;

      // If a node hasn't reported its capacity yet, we cannot reason about
      // overcommit and we skip it for safety.
      if (totalCpu === 0 || totalRam === 0 || totalDisk === 0) continue;

      // Twardy limit liczby kont na węźle (jeśli ustawiony przez admina).
      if (server.maxAccounts != null) {
        const current = countByServer.get(server.id) ?? 0;
        if (current >= server.maxAccounts) continue;
      }

      // Rezerwa headroom — trzymamy % całkowitej pojemności wolnej pod burst
      // autoskalowania, więc do umieszczenia nowego konta wymagamy
      // free ≥ limit_planu + rezerwa.
      const headroom = Math.min(Math.max(server.reservedHeadroomPercent ?? 0, 0), 90) / 100;
      const reservedCpu = totalCpu * headroom;
      const reservedRam = totalRam * headroom;
      const reservedDisk = totalDisk * headroom;

      const freeCpu = totalCpu - server.allocatedCpu;
      const freeRam = totalRam - server.allocatedMemory;
      const freeDisk = totalDisk - server.allocatedDisk;

      if (freeCpu < plan.cpuLimit + reservedCpu) continue;
      if (freeRam < plan.ramLimitMb + reservedRam) continue;
      if (freeDisk < plan.diskLimitMb + reservedDisk) continue;

      const cpuLoad = server.allocatedCpu / totalCpu;
      const ramLoad = server.allocatedMemory / totalRam;
      const diskLoad = server.allocatedDisk / totalDisk;
      const load = (cpuLoad + ramLoad + diskLoad) / 3;

      scored.push({ server, freeCpu, freeRam, freeDisk, load });
    }

    if (scored.length === 0) {
      throw new ServiceUnavailableException(
        'All compute nodes are at capacity. Please try again later or contact support.',
      );
    }

    scored.sort((a, b) => {
      if (ctx.preferredRegion) {
        const aMatch = a.server.region === ctx.preferredRegion ? 0 : 1;
        const bMatch = b.server.region === ctx.preferredRegion ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
      }
      return a.load - b.load;
    });

    const winner = scored[0]!;
    this.logger.log(
      `Selected server=${winner.server.id} (load=${(winner.load * 100).toFixed(1)}%, ` +
        `freeCpu=${winner.freeCpu}%, freeRam=${winner.freeRam}MB)`,
    );
    return winner.server;
  }
}
