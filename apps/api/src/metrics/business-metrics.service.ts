import { Injectable } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';

export interface BusinessMetricsDto {
  generatedAt: string;
  /** Miesięczny przychód powtarzalny (PLN), aktywne usługi, rok → /12. */
  mrr: string;
  arpu: string;
  activeServices: number;
  trials: number;
  newThisMonth: number;
  canceledThisMonth: number;
  /** Churn % = anulowane w tym miesiącu / (aktywne + anulowane). */
  churnPct: number;
  byProduct: { productKind: string; count: number }[];
  walletLiability: string;
  fleet: {
    nodes: number;
    accounts: number;
    cpuUtilPct: number | null;
    ramUtilPct: number | null;
    diskUtilPct: number | null;
  };
}

/**
 * BIZ-1 — warstwa metryk biznesowych dla panelu admina. Liczone deterministycznie
 * z realnych danych (subskrypcje/portfele/flota); bez zewnętrznych analytics.
 */
@Injectable()
export class BusinessMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async business(): Promise<BusinessMetricsDto> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [activeSubs, trials, newThisMonth, canceledThisMonth, users, servers] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { status: SubscriptionStatus.ACTIVE, isTrial: false },
        select: { priceAmount: true, interval: true, plan: { select: { productKind: true } } },
      }),
      this.prisma.subscription.count({
        where: { isTrial: true, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PROVISIONING] } },
      }),
      this.prisma.subscription.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.subscription.count({
        where: { canceledAt: { gte: monthStart }, status: SubscriptionStatus.CANCELED },
      }),
      this.prisma.user.findMany({ select: { walletBalance: true } }),
      this.prisma.server.findMany({
        select: {
          totalCpuCores: true,
          totalMemoryMb: true,
          totalDiskMb: true,
          allocatedCpu: true,
          allocatedMemory: true,
          allocatedDisk: true,
          _count: { select: { accounts: true } },
        },
      }),
    ]);

    // MRR — rok normalizujemy do miesiąca.
    let mrr = new Prisma.Decimal(0);
    const productCounts = new Map<string, number>();
    for (const s of activeSubs) {
      const monthly =
        s.interval === 'YEAR' ? s.priceAmount.div(12) : s.priceAmount;
      mrr = mrr.add(monthly);
      const pk = s.plan?.productKind ?? 'HOSTING';
      productCounts.set(pk, (productCounts.get(pk) ?? 0) + 1);
    }
    const activeServices = activeSubs.length;
    const arpu = activeServices > 0 ? mrr.div(activeServices) : new Prisma.Decimal(0);

    const walletLiability = users.reduce(
      (acc, u) => acc.add(u.walletBalance ?? 0),
      new Prisma.Decimal(0),
    );

    const churnDenom = activeServices + canceledThisMonth;
    const churnPct = churnDenom > 0 ? Math.round((canceledThisMonth / churnDenom) * 1000) / 10 : 0;

    const sum = (sel: (s: (typeof servers)[number]) => number | null) =>
      servers.reduce((a, s) => a + (sel(s) ?? 0), 0);
    const totalCpu = sum((s) => s.totalCpuCores);
    const totalRam = sum((s) => s.totalMemoryMb);
    const totalDisk = sum((s) => s.totalDiskMb);
    const allocCpu = sum((s) => s.allocatedCpu);
    const allocRam = sum((s) => s.allocatedMemory);
    const allocDisk = sum((s) => s.allocatedDisk);
    const pct = (a: number, t: number) => (t > 0 ? Math.round((a / t) * 1000) / 10 : null);

    return {
      generatedAt: now.toISOString(),
      mrr: mrr.toFixed(2),
      arpu: arpu.toFixed(2),
      activeServices,
      trials,
      newThisMonth,
      canceledThisMonth,
      churnPct,
      byProduct: [...productCounts.entries()].map(([productKind, count]) => ({ productKind, count })),
      walletLiability: walletLiability.toFixed(2),
      fleet: {
        nodes: servers.length,
        accounts: servers.reduce((a, s) => a + s._count.accounts, 0),
        cpuUtilPct: pct(allocCpu, totalCpu),
        ramUtilPct: pct(allocRam, totalRam),
        diskUtilPct: pct(allocDisk, totalDisk),
      },
    };
  }
}
