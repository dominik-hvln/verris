import { AccountStatus, ServerStatus } from '@verris/database';
import type { PrismaService } from '../prisma/prisma.service.js';
import { przekroczeniaFloty, raportZBazy } from '../telemetry/faulty-lve.js';

/**
 * F2.6 — konta przekraczające limity (faulty CPU/EP/NPROC/PMEM/IO/IOPS w 24 h i 7 dni) na jednym węźle albo
 * w całej flocie (węzły aktywne i w serwisie), z raportów agenta verris-lve. Konta mapowane na usługi po
 * (węzeł, login); konto spoza panelu zostaje na liście bez usługi (np. ręcznie założone na węźle).
 */
export async function przekroczeniaZBazy(prisma: PrismaService, serverId: string | undefined, teraz: number) {
  const serwery = await prisma.server.findMany({
    where: serverId ? { id: serverId } : { status: { in: [ServerStatus.ACTIVE, ServerStatus.MAINTENANCE] } },
    select: { id: true, name: true, hostname: true, lveFaults: true, lveFaultsAt: true },
    orderBy: { name: 'asc' },
  });
  const loginy = new Set(serwery.flatMap((s) => raportZBazy(s.lveFaults)?.okna.flatMap((o) => Object.keys(o.konta)) ?? []));
  const konta = loginy.size
    ? await prisma.account.findMany({
        where: { serverId: { in: serwery.map((s) => s.id) }, daUsername: { in: [...loginy] }, status: { not: AccountStatus.DELETED } },
        select: { serverId: true, daUsername: true, subscriptionId: true, domain: true },
      })
    : [];
  return przekroczeniaFloty(serwery, konta, teraz);
}
