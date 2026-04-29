import { Injectable } from '@nestjs/common';
import { Prisma, Role, WalletTxStatus } from '@ekohost/database';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      userGroups,
      subscriptionGroups,
      serverGroups,
      ticketsOpen,
      walletByType,
      servers,
      recentSubscriptions,
      accountsTotal,
    ] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { id: true },
      }),
      this.prisma.subscription.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.server.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.ticket.count({
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      }),
      this.prisma.walletTransaction.groupBy({
        by: ['type'],
        where: {
          createdAt: { gte: since30 },
          status: WalletTxStatus.COMPLETED,
        },
        _sum: { amount: true },
      }),
      this.prisma.server.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 12,
        select: {
          id: true,
          name: true,
          ipAddress: true,
          status: true,
          region: true,
          lastHeartbeatAt: true,
          allocatedCpu: true,
          totalCpuCores: true,
        },
      }),
      this.prisma.subscription.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          createdAt: true,
          priceAmount: true,
          currency: true,
          interval: true,
          plan: { select: { name: true, slug: true } },
          user: { select: { email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.account.count(),
    ]);

    const usersByRole = Object.fromEntries(userGroups.map((r) => [r.role, r._count.id])) as Partial<
      Record<Role, number>
    > & { [k: string]: number };
    const subscriptionsByStatus = Object.fromEntries(
      subscriptionGroups.map((r) => [r.status, r._count.id]),
    );
    const serversByStatus = Object.fromEntries(serverGroups.map((r) => [r.status, r._count.id]));

    const clientUsers = usersByRole[Role.USER] ?? 0;
    const staffAndAdmin = (usersByRole[Role.STAFF] ?? 0) + (usersByRole[Role.ADMIN] ?? 0);

    const activeSubscriptions =
      subscriptionGroups.find((g) => g.status === 'ACTIVE')?._count.id ?? 0;

    const serverTotal = serverGroups.reduce((a, g) => a + g._count.id, 0);
    const serversActive = serverGroups.find((g) => g.status === 'ACTIVE')?._count.id ?? 0;

    let walletNet30d = new Prisma.Decimal(0);
    const walletByTypeOut: Record<string, string> = {};
    for (const row of walletByType) {
      const sum = row._sum.amount ?? new Prisma.Decimal(0);
      walletNet30d = walletNet30d.plus(sum);
      walletByTypeOut[row.type] = sum.toFixed(2);
    }

    const serverRows = servers.map((s) => ({
      id: s.id,
      name: (s.name && s.name.trim()) ? s.name : s.ipAddress,
      ipAddress: s.ipAddress,
      region: s.region,
      status: s.status,
      lastHeartbeatAt: s.lastHeartbeatAt?.toISOString() ?? null,
      allocatedCpu: s.allocatedCpu,
      totalCpuCores: s.totalCpuCores,
    }));

    return {
      generatedAt: new Date().toISOString(),
      users: {
        total: userGroups.reduce((a, g) => a + g._count.id, 0),
        clients: clientUsers,
        staffAndAdmin,
      },
      subscriptions: {
        byStatus: subscriptionsByStatus,
        active: activeSubscriptions,
      },
      servers: {
        total: serverTotal,
        active: serversActive,
        byStatus: serversByStatus,
      },
      accounts: { total: accountsTotal },
      tickets: { openNonClosed: ticketsOpen },
      billing: {
        periodDays: 30,
        walletNetPln: walletNet30d.toFixed(2),
        walletByTypePln: walletByTypeOut,
      },
      serverRows,
      recentSubscriptions,
    };
  }
}
