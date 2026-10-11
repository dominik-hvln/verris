import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Prace serwisowe w banerze: trwające i te, które zaczną się w ciągu tylu godzin. */
export const PRACE_WYPRZEDZENIE_H = 24;

/**
 * F3.8 (ON-05) — „czy to awaria u was?”: trwające incydenty (sondy) i prace serwisowe (trwające oraz najbliższe 24 h)
 * dla baneru w panelu operatora, z węzłem i liczbą aktywnych kont na nim (L1 od razu wie, czy klient jest w zasięgu).
 * Dane wewnętrzne (nazwa węzła, cel sondy) — tylko dla zespołu; klient widzi swoje incydenty w panelu klienta.
 */
@Injectable()
export class StatusObslugiService {
  constructor(private readonly prisma: PrismaService) {}

  async biezace(teraz = new Date()) {
    const [incydenty, prace] = await Promise.all([
      this.prisma.probeIncident.findMany({
        where: { status: 'OPEN' },
        orderBy: { startedAt: 'asc' },
        take: 20,
        include: { probe: { select: { label: true, kind: true, grupa: true, server: { select: { id: true, name: true } } } } },
      }),
      this.prisma.maintenanceWindow.findMany({
        where: {
          OR: [{ status: 'IN_PROGRESS' }, { status: 'SCHEDULED', scheduledEnd: { gt: teraz }, scheduledStart: { lte: new Date(teraz.getTime() + PRACE_WYPRZEDZENIE_H * 3600_000) } }],
        },
        orderBy: { scheduledStart: 'asc' },
        take: 20,
        include: { server: { select: { id: true, name: true } } },
      }),
    ]);
    const wezly = [...new Set([...incydenty.map((i) => i.probe.server?.id), ...prace.map((p) => p.server?.id)].filter((x): x is string => !!x))];
    const konta = wezly.length
      ? await this.prisma.account.groupBy({ by: ['serverId'], where: { serverId: { in: wezly }, status: 'ACTIVE' }, _count: { _all: true } })
      : [];
    const ile = new Map(konta.map((k) => [k.serverId, k._count._all]));
    const wezel = (s: { id: string; name: string | null } | null) => (s ? { id: s.id, nazwa: s.name ?? s.id, kont: ile.get(s.id) ?? 0 } : null);
    return {
      incydenty: incydenty.map((i) => ({
        id: i.id,
        tytul: i.title,
        powazny: i.severity === 'MAJOR',
        od: i.startedAt.toISOString(),
        usluga: i.probe.label ?? i.probe.grupa ?? i.probe.kind,
        wezel: wezel(i.probe.server),
      })),
      prace: prace.map((p) => ({
        id: p.id,
        tytul: p.title,
        trwa: p.status === 'IN_PROGRESS' || p.scheduledStart <= teraz,
        od: p.scheduledStart.toISOString(),
        do: p.scheduledEnd.toISOString(),
        wezel: wezel(p.server),
        calaPlatforma: !p.serverId,
      })),
    };
  }
}
