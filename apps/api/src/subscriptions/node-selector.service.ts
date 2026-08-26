import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Plan, Server, ServerStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import {
  BRAK_SYGNALU_MIN,
  czyWezelMilczy,
  czyZmiesciSie,
  efektywnyOvercommit,
  PojemnoscFizyczna,
  PowodOdmowy,
  SWIEZOSC_TELEMETRII_MIN,
  WynikDopasowania,
} from './node-capacity';

export interface NodeSelectionContext {
  /** Hint towards co-locating with this region if multiple nodes qualify. */
  preferredRegion?: string | null;
}

interface ServerScore {
  server: Server;
  dopasowanie: WynikDopasowania;
}

/**
 * Wybiera węzeł ACTIVE, na którym zmieści się nowe konto dla danego planu.
 *
 * Algorytm:
 *   1. Węzły ACTIVE, nie „cordoned".
 *   2. Odrzuć te, które nie przejdą bramek pojemności z `node-capacity.ts`:
 *      handlowej (sprzedane + plan ≤ pojemność × overcommit) oraz fizycznej
 *      (realne zużycie ≤ pojemność × (1 − headroom)).
 *   3. Posortuj po obciążeniu — GORSZYM z handlowego i fizycznego — i wybierz
 *      najluźniejszy. Region rozstrzyga remisy.
 *
 * Z-12 (2026-08-22): do tej pory krok 2 traktował sumę limitów planów jak
 * zajętość maszyny, więc na węźle ze 128 GB mieściło się 16 kont przy bazie
 * 8 GB — a próg rentowności przy cenie 45 zł to 58 kont (PB-01). Cała
 * arytmetyka pojemności wyprowadzona do `node-capacity.ts`, żeby ten serwis
 * i planer drenażu w `servers.service.ts` nie miały dwóch różnych zdań na
 * temat tego, co znaczy „węzeł jest pełny".
 */
@Injectable()
export class NodeSelectorService {
  private readonly logger = new Logger(NodeSelectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async pickServerForPlan(plan: Plan, ctx: NodeSelectionContext = {}): Promise<Server> {
    // Tylko węzły ACTIVE, które NIE są „cordoned" (acceptsNewAccounts=false).
    // Cordon pozwala wstrzymać przyjmowanie nowych kont na pojedynczym węźle bez
    // przełączania go w MAINTENANCE (co wstrzymałoby sprzedaż globalnie).
    const zStatusem = await this.prisma.server.findMany({
      where: { status: ServerStatus.ACTIVE, acceptsNewAccounts: true },
    });

    // OPS-01 — status ACTIVE nie dowodzi, że węzeł żyje.
    //
    // Nic w API nigdy nie zapisywało statusu OFFLINE: watchdog liczył węzły
    // z przeterminowanym sygnałem, metryki raportowały „offline", a wiersz
    // w bazie zostawał ACTIVE. Selektor wybierał po statusie, więc martwa
    // maszyna nadal dostawała nowe konta. Nieświeża telemetria tego nie
    // łapała — ona tylko degraduje nadsubskrypcję do 1,0×, a węzeł z wolną
    // pojemnością nominalną i tak przechodził bramkę.
    //
    // Filtrujemy po sygnale życia, a nie po statusie: to działa niezależnie
    // od tego, czy ktoś kiedyś dopisze automatyczne przejście do OFFLINE.
    const teraz = new Date();
    const milczace = zStatusem.filter((s) => czyWezelMilczy(s.lastHeartbeatAt, teraz));
    const candidates = zStatusem.filter((s) => !czyWezelMilczy(s.lastHeartbeatAt, teraz));

    if (milczace.length > 0) {
      this.logger.warn(
        `Pomijam ${milczace.length} węzeł(ów) ACTIVE bez sygnału życia od ponad ` +
          `${BRAK_SYGNALU_MIN} min: ${milczace.map((s) => s.id).join(', ')}.`,
      );
    }

    if (candidates.length === 0 && milczace.length > 0) {
      throw new ServiceUnavailableException(
        'Brak węzłów hostingowych odpowiadających na sygnał życia. Skontaktuj się z BOK.',
      );
    }

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

    const idKandydatow = candidates.map((c) => c.id);

    // Liczba kont per węzeł — potrzebna do limitu maxAccounts.
    //
    // Z-16: konta DELETED nie liczą się. Wcześniej liczyły, więc węzeł
    // z limitem 200 kont przestawał przyjmować nowe po dwustu założeniach,
    // niezależnie od tego, ile z nich już nie istnieje.
    const accountCounts = await this.prisma.account.groupBy({
      by: ['serverId'],
      where: { serverId: { in: idKandydatow }, status: { not: 'DELETED' } },
      _count: { _all: true },
    });
    const countByServer = new Map<string, number>(
      accountCounts.map((row) => [row.serverId, row._count._all]),
    );

    const zuzycieWezlow = await this.realneZuzycieWezlow(idKandydatow);

    const scored: ServerScore[] = [];
    const odmowy = new Map<PowodOdmowy, number>();

    for (const server of candidates) {
      const fizyczna: PojemnoscFizyczna = {
        cpu: (server.totalCpuCores ?? 0) * 100,
        ramMb: server.totalMemoryMb ?? 0,
        diskMb: server.totalDiskMb ?? 0,
      };

      const liczbaKont = countByServer.get(server.id) ?? 0;
      // Węzeł bez kont nie ma telemetrii, ale jego realne zużycie nie jest
      // „nieznane" — jest zerowe. Bez tego rozróżnienia świeży węzeł
      // z ustawionym overcommitem zachowywałby się jak węzeł z zepsutym
      // agentem i zapełniał się do 16 kont, zanim nadsubskrypcja by ruszyła.
      const zuzycie =
        zuzycieWezlow.get(server.id) ??
        (liczbaKont === 0 ? { cpu: 0, ramMb: 0, diskMb: 0 } : null);

      const dopasowanie = czyZmiesciSie({
        fizyczna,
        sprzedane: {
          cpu: server.allocatedCpu,
          ramMb: server.allocatedMemory,
          diskMb: server.allocatedDisk,
        },
        zuzycie,
        potrzeba: { cpu: plan.cpuLimit, ramMb: plan.ramLimitMb, diskMb: plan.diskLimitMb },
        polityka: {
          overcommitCpu: server.overcommitCpu,
          overcommitRam: server.overcommitRam,
          overcommitDisk: server.overcommitDisk,
          reservedHeadroomPercent: server.reservedHeadroomPercent,
        },
        liczbaKont,
        maxAccounts: server.maxAccounts,
      });

      if (!dopasowanie.mozna) {
        if (dopasowanie.powod) {
          odmowy.set(dopasowanie.powod, (odmowy.get(dopasowanie.powod) ?? 0) + 1);
        }
        // Nadsubskrypcja wyłączona przez brak telemetrii to sytuacja
        // operacyjna, nie zwykłe „węzeł pełny" — musi być widoczna w logu.
        if (!dopasowanie.telemetriaSwieza && fizyczna.ramMb > 0) {
          this.logger.warn(
            `Węzeł ${server.id} bez świeżej telemetrii (>${SWIEZOSC_TELEMETRII_MIN} min) — ` +
              `nadsubskrypcja zdegradowana do 1,0×, odmowa: ${dopasowanie.powod}.`,
          );
        }
        continue;
      }

      scored.push({ server, dopasowanie });
    }

    if (scored.length === 0) {
      const opis = Array.from(odmowy.entries())
        .map(([p, n]) => `${p}=${n}`)
        .join(', ');
      this.logger.error(
        `Brak węzła dla planu ${plan.slug} (cpu=${plan.cpuLimit}, ram=${plan.ramLimitMb}MB, ` +
          `disk=${plan.diskLimitMb}MB). Powody odmowy: ${opis || 'brak kandydatów'}.`,
      );
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
      return a.dopasowanie.obciazenie - b.dopasowanie.obciazenie;
    });

    const winner = scored[0]!;
    const oc = efektywnyOvercommit(
      {
        overcommitCpu: winner.server.overcommitCpu,
        overcommitRam: winner.server.overcommitRam,
        overcommitDisk: winner.server.overcommitDisk,
        reservedHeadroomPercent: winner.server.reservedHeadroomPercent,
      },
      winner.dopasowanie.telemetriaSwieza,
    );
    this.logger.log(
      `Selected server=${winner.server.id} ` +
        `(obciążenie=${(winner.dopasowanie.obciazenie * 100).toFixed(1)}%, ` +
        `overcommit cpu=${oc.cpu}× ram=${oc.ram}× disk=${oc.disk}×, ` +
        `telemetria=${winner.dopasowanie.telemetriaSwieza ? 'świeża' : 'NIEŚWIEŻA'})`,
    );
    return winner.server;
  }

  /**
   * Realne zużycie każdego węzła — suma najnowszych próbek jego kont.
   *
   * Bierzemy szczyt (`cpuUsageMax`, `memUsageMaxMb`), nie średnią: headroom ma
   * chronić przed pikiem, a nie przed stanem spoczynku. Dla dysku szczytu nie
   * ma i nie jest potrzebny — zajętość dysku nie skacze i nie opada.
   *
   * Węzeł bez próbki w oknie świeżości nie trafia do mapy, co w `czyZmiesciSie`
   * degraduje jego nadsubskrypcję do 1,0×.
   */
  private async realneZuzycieWezlow(
    serverIds: string[],
  ): Promise<Map<string, PojemnoscFizyczna>> {
    const wynik = new Map<string, PojemnoscFizyczna>();
    if (serverIds.length === 0) return wynik;

    const od = new Date(Date.now() - SWIEZOSC_TELEMETRII_MIN * 60_000);
    const rows = await this.prisma.usageMetric.findMany({
      where: { serverId: { in: serverIds }, bucketStart: { gte: od } },
      select: {
        serverId: true,
        subscriptionId: true,
        bucketStart: true,
        cpuUsageMax: true,
        memUsageMaxMb: true,
        diskUsageMb: true,
      },
      orderBy: { bucketStart: 'desc' },
    });

    // Po jednej — najnowszej — próbce na subskrypcję. Bez tego konto z sześcioma
    // próbkami w oknie liczyłoby się sześć razy i węzeł wyglądałby na zajęty.
    const najnowsza = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      if (!r.serverId) continue;
      const klucz = `${r.serverId}:${r.subscriptionId ?? 'brak'}`;
      const dotad = najnowsza.get(klucz);
      if (!dotad || r.bucketStart > dotad.bucketStart) najnowsza.set(klucz, r);
    }

    for (const r of najnowsza.values()) {
      const biezace = wynik.get(r.serverId!) ?? { cpu: 0, ramMb: 0, diskMb: 0 };
      biezace.cpu += r.cpuUsageMax;
      biezace.ramMb += r.memUsageMaxMb;
      biezace.diskMb += r.diskUsageMb;
      wynik.set(r.serverId!, biezace);
    }

    return wynik;
  }
}
