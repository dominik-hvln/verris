import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { nazwaWezla, pozaPula } from '../admin-dashboard/stan-platformy.js';
import { pojemnoscSprzedazowa } from '../subscriptions/node-capacity.js';

/**
 * Widok admina „Flota — wykresy”: CPU i RAM węzłów w czasie z `UsageMetric` (próbki per konto,
 * co ~60 s). Wartość węzła w chwili = SUMA kont z tej samej próbki; punkt wykresu = średnia
 * takich sum w kubełku (5 min / 1 h / 3 h). Czyste funkcje niżej — testowane bez bazy.
 */

export type Zakres = '1h' | '24h' | '7d';
export const ZAKRESY: Record<Zakres, { ms: number; krok: string }> = {
  '1h': { ms: 3_600_000, krok: '5 minutes' },
  '24h': { ms: 86_400_000, krok: '1 hour' },
  '7d': { ms: 7 * 86_400_000, krok: '3 hours' },
};
export type Sort = 'stan' | 'cpu' | 'ram' | 'nazwa';
const SORTY: Sort[] = ['stan', 'cpu', 'ram', 'nazwa'];

export const zakresZ = (z?: string): Zakres => (z && Object.hasOwn(ZAKRESY, z) ? (z as Zakres) : '24h');
export const sortZ = (s?: string): Sort => (SORTY.includes(s as Sort) ? (s as Sort) : 'stan');

export type StanWykresu = 'krytyczny' | 'ostrzezenie' | 'norma';
/** Telemetria idzie co minutę; aktywny węzeł milczący > 15 min jest krytyczny. */
export const BRAK_TELEMETRII_MIN = 15;

export interface Punkt {
  t: string;
  v: number;
}

export function stanWezlaWykresy(
  w: { status: string; lastSignalAt: Date | null; cpuNow: number | null; ramNow: number | null; diskPct: number | null },
  teraz: number,
): StanWykresu {
  const cichy = w.status === 'ACTIVE' && (!w.lastSignalAt || teraz - w.lastSignalAt.getTime() > BRAK_TELEMETRII_MIN * 60_000);
  const cpu = w.cpuNow ?? 0;
  const dysk = w.diskPct ?? 0;
  if (w.status === 'OFFLINE' || cichy || cpu >= 90 || dysk >= 90) return 'krytyczny';
  if (cpu >= 75 || (w.ramNow ?? 0) >= 85 || dysk >= 80) return 'ostrzezenie';
  return 'norma';
}

const WAGA: Record<StanWykresu, number> = { krytyczny: 0, ostrzezenie: 1, norma: 2 };

/** „Stan” = krytyczne, ostrzeżenia, w normie, w grupie CPU malejąco; CPU/Pamięć malejąco; Nazwa rosnąco. */
export function sortujWezly<T extends { stan: StanWykresu; cpuNow: number | null; ramNow: number | null; name: string }>(w: T[], sort: Sort): T[] {
  const cpu = (a: T, b: T) => (b.cpuNow ?? -1) - (a.cpuNow ?? -1);
  const por: Record<Sort, (a: T, b: T) => number> = {
    stan: (a, b) => WAGA[a.stan] - WAGA[b.stan] || cpu(a, b),
    cpu,
    ram: (a, b) => (b.ramNow ?? -1) - (a.ramNow ?? -1),
    nazwa: (a, b) => a.name.localeCompare(b.name, 'pl'),
  };
  return [...w].sort((a, b) => por[sort](a, b) || a.name.localeCompare(b.name, 'pl'));
}

export interface WierszSerii {
  serverId: string;
  t: Date;
  cpu: number;
  ram: number;
}

const proc = (v: number, razem: number) => Math.round(Math.min(100, (v / razem) * 100) * 10) / 10;

/** Wiersze SQL (suma kont uśredniona w kubełku) → serie % per węzeł. CPU w % rdzenia, więc / (rdzenie × 100). */
export function serieWezlow(
  wiersze: WierszSerii[],
  pojemnosc: Map<string, { rdzenie: number | null; ramMb: number | null }>,
): Map<string, { cpu: Punkt[]; ram: Punkt[] }> {
  const out = new Map<string, { cpu: Punkt[]; ram: Punkt[] }>();
  for (const r of [...wiersze].sort((a, b) => a.t.getTime() - b.t.getTime())) {
    const p = pojemnosc.get(r.serverId);
    if (!p) continue;
    const s = out.get(r.serverId) ?? { cpu: [], ram: [] };
    const t = r.t.toISOString();
    if (p.rdzenie) s.cpu.push({ t, v: proc(r.cpu, p.rdzenie * 100) });
    if (p.ramMb) s.ram.push({ t, v: proc(r.ram, p.ramMb) });
    out.set(r.serverId, s);
  }
  return out;
}

/** Seria floty: średnia węzłów, które mają punkt w danym kubełku. */
export function seriaFloty(serie: Punkt[][]): Punkt[] {
  const wg = new Map<string, number[]>();
  for (const s of serie) for (const p of s) wg.set(p.t, [...(wg.get(p.t) ?? []), p.v]);
  return [...wg.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, v]) => ({ t, v: Math.round((v.reduce((x, y) => x + y, 0) / v.length) * 10) / 10 }));
}

const srednia = (s: Punkt[]) => (s.length ? Math.round(s.reduce((a, p) => a + p.v, 0) / s.length) : null);

@Injectable()
export class WykresyFlotyService {
  constructor(private readonly prisma: PrismaService) {}

  async wykresy(zakres: Zakres, sort: Sort, teraz = Date.now()) {
    const { ms, krok } = ZAKRESY[zakres];
    const od = new Date(teraz - ms);
    const [serwery, wiersze, biezace] = await Promise.all([
      this.prisma.server.findMany({
        where: { status: { not: 'DEPROVISIONING' } },
        select: {
          id: true,
          name: true,
          hostname: true,
          ipAddress: true,
          region: true,
          status: true,
          acceptsNewAccounts: true,
          lastHeartbeatAt: true,
          onboardVerifiedAt: true,
          onboardReport: true,
          maintenanceReason: true,
          totalCpuCores: true,
          totalMemoryMb: true,
          totalDiskMb: true,
          allocatedCpu: true,
          allocatedMemory: true,
          allocatedDisk: true,
          overcommitCpu: true,
          overcommitRam: true,
          overcommitDisk: true,
          reservedHeadroomPercent: true,
          lastOffsiteBackupAt: true,
          _count: { select: { accounts: { where: { status: { not: 'DELETED' } } } } },
        },
      }),
      // Najpierw suma kont w każdej próbce węzła, potem średnia tych sum w kubełku.
      // ponytail: liczone z surowych próbek minutowych (indeks serverId+bucketStart); przy tysiącach kont
      // zakres 7 dni czyta miliony wierszy — wtedy zbiorczy wiersz godzinowy (bucketDurationS 3600) przy zapisie telemetrii.
      this.prisma.$queryRaw<WierszSerii[]>`
        WITH wezel AS (
          SELECT "serverId", "bucketStart", SUM("cpuUsageAvg") AS cpu, SUM("memUsageAvgMb") AS ram
          FROM "UsageMetric"
          WHERE "serverId" IS NOT NULL AND "accountId" IS NOT NULL AND "bucketDurationS" <= 300 AND "bucketStart" >= ${od}
          GROUP BY "serverId", "bucketStart"
        )
        SELECT "serverId", date_bin(${krok}::interval, "bucketStart", TIMESTAMP '2000-01-01') AS t, AVG(cpu)::float8 AS cpu, AVG(ram)::float8 AS ram
        FROM wezel
        GROUP BY 1, 2
        ORDER BY 1, 2`,
      // Stan bieżący: najnowsza próbka każdego konta z 10 min (jak strona węzła).
      this.prisma.$queryRaw<{ serverId: string; cpu: number; ram: number; dysk: number }[]>`
        SELECT "serverId", SUM(cpu)::float8 AS cpu, SUM(ram)::float8 AS ram, SUM(dysk)::float8 AS dysk
        FROM (
          SELECT DISTINCT ON ("accountId") "serverId", "cpuUsageAvg" AS cpu, "memUsageAvgMb" AS ram, "diskUsageMb" AS dysk
          FROM "UsageMetric"
          WHERE "serverId" IS NOT NULL AND "accountId" IS NOT NULL AND "bucketDurationS" <= 300 AND "bucketStart" >= ${new Date(teraz - 10 * 60_000)}
          ORDER BY "accountId", "bucketStart" DESC
        ) AS ostatnie
        GROUP BY "serverId"`,
    ]);

    const serie = serieWezlow(wiersze, new Map(serwery.map((s) => [s.id, { rdzenie: s.totalCpuCores, ramMb: s.totalMemoryMb }])));
    const terazWg = new Map(biezace.map((b) => [b.serverId, b]));
    const wezly = serwery.map((s) => {
      const b = terazWg.get(s.id);
      const w = {
        id: s.id,
        name: nazwaWezla(s),
        region: s.region,
        status: s.status,
        accounts: s._count.accounts,
        pozaPula: pozaPula(s),
        cpuNow: b && s.totalCpuCores ? Math.round(proc(b.cpu, s.totalCpuCores * 100)) : null,
        ramNow: b && s.totalMemoryMb ? Math.round(proc(b.ram, s.totalMemoryMb)) : null,
        diskPct: b && s.totalDiskMb ? Math.round(proc(b.dysk, s.totalDiskMb)) : null,
        lastSignalAt: s.lastHeartbeatAt,
        lastOffsiteBackupAt: s.lastOffsiteBackupAt,
        cpu: serie.get(s.id)?.cpu ?? [],
        ram: serie.get(s.id)?.ram ?? [],
      };
      return { ...w, stan: stanWezlaWykresy(w, teraz) };
    });

    // Pojemność floty: sprzedane kontom / sprzedawalne (fizyczna × overcommit) — wymiar najbliżej limitu.
    const hostujace = serwery.filter((s) => (s.status === 'ACTIVE' || s.status === 'MAINTENANCE') && s.totalCpuCores && s.totalMemoryMb && s.totalDiskMb);
    const suma = { cpu: [0, 0], RAM: [0, 0], dysk: [0, 0] };
    for (const s of hostujace) {
      const sp = pojemnoscSprzedazowa({ cpu: s.totalCpuCores! * 100, ramMb: s.totalMemoryMb!, diskMb: s.totalDiskMb! }, s, terazWg.has(s.id));
      suma.cpu[0] += s.allocatedCpu;
      suma.cpu[1] += sp.cpu;
      suma.RAM[0] += s.allocatedMemory;
      suma.RAM[1] += sp.ramMb;
      suma.dysk[0] += s.allocatedDisk;
      suma.dysk[1] += sp.diskMb;
    }
    const pojemnosc = hostujace.length
      ? Object.entries(suma)
          .map(([wymiar, [a, z]]) => ({ wymiar: wymiar === 'cpu' ? 'CPU' : wymiar, proc: Math.round((a! / z!) * 100) }))
          .sort((a, b) => b.proc - a.proc)[0]!
      : null;

    const cpuFloty = seriaFloty(wezly.map((w) => w.cpu));
    const ramFloty = seriaFloty(wezly.map((w) => w.ram));
    const aktywne = serwery.filter((s) => s.status === 'ACTIVE');
    return {
      zakres,
      od: od.toISOString(),
      do: new Date(teraz).toISOString(),
      kpi: {
        wszystkie: serwery.length,
        aktywne: aktywne.length,
        pozaPula: aktywne.filter((s) => pozaPula(s)).length,
        cpuSrednie: srednia(cpuFloty),
        ramSrednie: srednia(ramFloty),
        cpu: cpuFloty,
        ram: ramFloty,
        pojemnosc,
      },
      wezly: sortujWezly(wezly, sort),
    };
  }
}
