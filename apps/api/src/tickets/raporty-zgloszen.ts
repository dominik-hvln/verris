import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * F3.7 (OE-32) — raporty obsługi dla kierownika zmiany (L4) i administratora: terminy SLA (dotrzymane /
 * przekroczone), oceny klientów (CSAT, istniejące pola zgłoszenia) i wyniki osób z zespołu (liczba odpowiedzi,
 * mediana czasu odpowiedzi, zamknięte). Wzór: raport agentów Freshdesk
 * (https://support.freshdesk.com/support/solutions/articles/50000000024-agent-performance-report-in-analytics) —
 * czas odpowiedzi liczony od PIERWSZEJ nieodpowiedzianej wiadomości klienta do odpowiedzi obsługi.
 * Zgłoszenia scalone (źródła) nie liczą się do terminów — ich wątek jest w zgłoszeniu docelowym.
 */
export const RAPORT_DNI = [7, 30, 90] as const;

export type WynikTerminu = 'dotrzymane' | 'przekroczone' | 'wToku' | 'bez';

/**
 * Termin (pierwszej odpowiedzi albo rozwiązania): `wykonano` — kiedy to się stało; `zamknieto` — zgłoszenie
 * zamknięte bez tego (np. klient sam zamknął przed odpowiedzią). Bez terminu (stare zgłoszenia sprzed SLA) — „bez”.
 */
export function ocenTermin(termin: Date | null, wykonano: Date | null, zamknieto: Date | null, teraz: Date): WynikTerminu {
  if (!termin) return 'bez';
  if (wykonano) return wykonano.getTime() <= termin.getTime() ? 'dotrzymane' : 'przekroczone';
  const koniec = zamknieto ?? teraz;
  if (koniec.getTime() > termin.getTime()) return 'przekroczone';
  return zamknieto ? 'bez' : 'wToku';
}

export function mediana(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Odsetek dotrzymanych z rozstrzygniętych (dotrzymane + przekroczone); bez rozstrzygniętych — null. */
export function procentDotrzymanych(l: Record<WynikTerminu, number>): number | null {
  const n = l.dotrzymane + l.przekroczone;
  return n ? Math.round((l.dotrzymane / n) * 1000) / 10 : null;
}

const zero = (): Record<WynikTerminu, number> => ({ dotrzymane: 0, przekroczone: 0, wToku: 0, bez: 0 });
const sr = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

interface WierszAgenta {
  autor: string;
  odpowiedzi: number;
  naKlienta: number;
  medianaS: number | null;
}

@Injectable()
export class RaportyZgloszenService {
  constructor(private readonly prisma: PrismaService) {}

  async raport(dni: number, teraz = new Date()) {
    const okres = (RAPORT_DNI as readonly number[]).includes(dni) ? dni : 30;
    const od = new Date(teraz.getTime() - okres * 86_400_000);

    // ── terminy SLA: zgłoszenia założone w okresie
    const zgl = await this.prisma.ticket.findMany({
      where: { createdAt: { gte: od, lte: teraz }, scalonoDoId: null },
      select: {
        priority: true, status: true, createdAt: true, firstResponseAt: true, resolvedAt: true,
        slaResponseDueAt: true, slaResolveDueAt: true,
      },
    });
    const odpowiedz = zero();
    const rozwiazanie = zero();
    const wgPriorytetu: Record<string, { odpowiedz: Record<WynikTerminu, number>; rozwiazanie: Record<WynikTerminu, number> }> = {};
    const pierwsze: number[] = [];
    for (const t of zgl) {
      const zamknieto = t.status === 'CLOSED' ? t.resolvedAt ?? teraz : null;
      const o = ocenTermin(t.slaResponseDueAt, t.firstResponseAt, zamknieto, teraz);
      const r = ocenTermin(t.slaResolveDueAt, t.status === 'CLOSED' ? zamknieto : null, null, teraz);
      odpowiedz[o]++;
      rozwiazanie[r]++;
      const p = (wgPriorytetu[t.priority] ??= { odpowiedz: zero(), rozwiazanie: zero() });
      p.odpowiedz[o]++;
      p.rozwiazanie[r]++;
      if (t.firstResponseAt) pierwsze.push((t.firstResponseAt.getTime() - t.createdAt.getTime()) / 60_000);
    }

    // ── CSAT: oceny wystawione w okresie (istniejące pola zgłoszenia, jak „Opieka nad zgłoszeniami”)
    const oceny = await this.prisma.ticket.findMany({
      where: { csatAt: { gte: od, lte: teraz } },
      select: { csatRating: true, agentRating: true, csatResolved: true, csatAgentId: true },
    });
    const rozstrz = oceny.filter((x) => x.csatResolved != null);

    // ── osoby: odpowiedzi (bez notatek i auto-wiadomości) i czas od pierwszej nieodpowiedzianej wiadomości klienta
    const agenci = await this.prisma.$queryRaw<WierszAgenta[]>`
      WITH watki AS (
        SELECT DISTINCT r."ticketId" AS tid FROM "TicketReply" r
        WHERE r."isStaff" AND NOT r."internal" AND r."automatic" IS NULL AND r."createdAt" >= ${od} AND r."createdAt" <= ${teraz}
      ),
      wiad AS (
        SELECT t."id" AS tid, t."createdAt" AS kiedy, (t."openedByStaffId" IS NOT NULL) AS obsluga, t."openedByStaffId" AS autor
        FROM "Ticket" t JOIN watki w ON w.tid = t."id"
        UNION ALL
        SELECT r."ticketId", r."createdAt", r."isStaff", r."authorId"
        FROM "TicketReply" r JOIN watki w ON w.tid = r."ticketId"
        WHERE NOT r."internal" AND r."automatic" IS NULL
      ),
      z AS (
        SELECT tid, kiedy, obsluga, autor,
          COALESCE(SUM(CASE WHEN obsluga THEN 1 ELSE 0 END) OVER (PARTITION BY tid ORDER BY kiedy, obsluga ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS grp,
          LAG(obsluga) OVER (PARTITION BY tid ORDER BY kiedy, obsluga) AS poprz
        FROM wiad
      ),
      k AS (SELECT tid, grp, MIN(kiedy) AS od_klienta FROM z WHERE NOT obsluga GROUP BY tid, grp)
      SELECT z.autor,
        COUNT(*)::int AS odpowiedzi,
        (COUNT(*) FILTER (WHERE z.poprz = false))::int AS "naKlienta",
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (z.kiedy - k.od_klienta))) FILTER (WHERE z.poprz = false))::float8 AS "medianaS"
      FROM z LEFT JOIN k ON k.tid = z.tid AND k.grp = z.grp
      WHERE z.obsluga AND z.autor IS NOT NULL AND z.kiedy >= ${od} AND z.kiedy <= ${teraz}
      GROUP BY z.autor`;
    const zamkniete = await this.prisma.ticket.groupBy({
      by: ['assignedToId'],
      where: { status: 'CLOSED', resolvedAt: { gte: od, lte: teraz }, scalonoDoId: null, assignedToId: { not: null } },
      _count: { _all: true },
    });
    const ids = [...new Set([...agenci.map((a) => a.autor), ...zamkniete.map((z) => z.assignedToId!), ...oceny.map((o) => o.csatAgentId).filter((x): x is string => !!x)])];
    const ludzie = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids }, role: { in: ['STAFF', 'ADMIN'] } }, select: { id: true, firstName: true, lastName: true, email: true } })
      : [];
    const osoby = ludzie
      .map((u) => {
        const a = agenci.find((x) => x.autor === u.id);
        const o = oceny.filter((x) => x.csatAgentId === u.id);
        return {
          agentId: u.id,
          nazwa: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
          odpowiedzi: a?.odpowiedzi ?? 0,
          odpowiedziNaKlienta: a?.naKlienta ?? 0,
          medianaMin: a?.medianaS == null ? null : Math.round(a.medianaS / 60),
          zamkniete: zamkniete.find((z) => z.assignedToId === u.id)?._count._all ?? 0,
          ocen: o.length,
          ocenaOpiekuna: sr(o.map((x) => x.agentRating)),
        };
      })
      .sort((a, b) => b.odpowiedzi - a.odpowiedzi || a.nazwa.localeCompare(b.nazwa, 'pl'));

    const med = mediana(pierwsze);
    return {
      okres: { dni: okres, od: od.toISOString(), do: teraz.toISOString() },
      sla: {
        zgloszen: zgl.length,
        odpowiedz: { ...odpowiedz, procent: procentDotrzymanych(odpowiedz) },
        rozwiazanie: { ...rozwiazanie, procent: procentDotrzymanych(rozwiazanie) },
        wgPriorytetu,
        medianaPierwszejMin: med == null ? null : Math.round(med),
      },
      csat: {
        ocen: oceny.length,
        obsluga: sr(oceny.map((x) => x.csatRating)),
        opiekun: sr(oceny.map((x) => x.agentRating)),
        rozwiazanePct: rozstrz.length ? Math.round((rozstrz.filter((x) => x.csatResolved).length / rozstrz.length) * 100) : null,
      },
      osoby,
    };
  }
}
