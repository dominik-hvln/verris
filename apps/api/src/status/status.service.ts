import { Injectable, Logger } from '@nestjs/common';
import {
  MaintenanceWindowStatus,
  IncidentStatus,
  ProbeIncident,
  ProbeKind,
  ServerStatus,
  ServiceProbe,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { isManualIncident } from './probe-ingest.service.js';
import {
  USLUGI_PUBLICZNE,
  dniWstecz,
  dzienWarszawski,
  godzinyWstecz,
  lacz,
  paskiDni,
  procentDostepnosci,
  scalPoKluczu,
  seriaGodzin,
  sredniCzas,
  uslugaDlaRodzaju,
  zbijDuplikaty,
  type DzienDto,
  type GodzinaDto,
  type WierszKubelka,
  type ZdarzenieDto,
} from './status-historia.js';

const CACHE_TTL_MS = 30 * 1000;
/** Długość paska dni na stronie (telefon pokazuje ostatnie 30 z tych 90). */
const HISTORIA_DNI = 90;

/** Tytuł incydentu dla klienta: wpisany przez obsługę (incydent ręczny) albo opis ogólny — bez adresu sondy. */
export function tytulIncydentuDlaKlienta(i: { title: string; severity: string; detectionMeta: unknown }): string {
  if (isManualIncident(i.detectionMeta)) return i.title;
  return i.severity === 'MAJOR'
    ? 'Usługa jest niedostępna lub działa z przerwami — pracujemy nad tym.'
    : 'Usługa może działać wolniej niż zwykle — pracujemy nad tym.';
}

/** Usługa widoczna klientom (np. „Strony klientów”) — bez nazw węzłów, hostów i rodzajów sond. */
export interface PublicServiceDto {
  key: string;
  name: string;
  state: 'OK' | 'DEGRADED' | 'DOWN';
  /** Dostępność z 90 dni w %, obcięta do 2 miejsc; null = brak jakichkolwiek próbek. */
  uptime90Pct: number | null;
  avgLatencyMs: number | null;
  /** 90 dni, rosnąco (ostatni = dziś, czas polski). Dzień bez próbek ma state NO_DATA. */
  days: DzienDto[];
  /** 24 godziny, rosnąco; avgLatencyMs null = brak próbek w tej godzinie. */
  latency24h: GodzinaDto[];
}

export type PublicIncidentDto = ZdarzenieDto;

export interface PublicAvailabilityDto {
  h24: number | null;
  d7: number | null;
  d30: number | null;
  d90: number | null;
}

export interface PublicStatusDto {
  generatedAt: string;
  overall: 'OK' | 'DEGRADED' | 'DOWN';
  availability: PublicAvailabilityDto;
  services: PublicServiceDto[];
  activeIncidents: PublicIncidentDto[];
  recentIncidents: PublicIncidentDto[];
  /** N-11 — zaplanowane i trwające prace (najbliższe 14 dni), globalne lub na publicznych serwerach. */
  maintenance: Array<Omit<PublicMaintenanceDto, 'serverName'>>;
}

export interface PublicMaintenanceDto {
  id: string;
  title: string;
  publicMessage: string | null;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  serverName: string | null;
}

/** N-11 — okna widoczne klientom: od 14 dni przed startem do końca, bez odwołanych i zakończonych. */
export const MAINTENANCE_LOOKAHEAD_DAYS = 14;
export function maintenanceVisibleWhere(now: Date, serverIds?: string[]) {
  return {
    status: { in: ['SCHEDULED', 'IN_PROGRESS'] as MaintenanceWindowStatus[] },
    scheduledEnd: { gt: now },
    scheduledStart: { lte: new Date(now.getTime() + MAINTENANCE_LOOKAHEAD_DAYS * 86400000) },
    ...(serverIds ? { OR: [{ serverId: null }, { serverId: { in: serverIds } }] } : {}),
  };
}

export function toPublicMaintenanceDto(w: {
  id: string; title: string; publicMessage: string | null; status: string;
  scheduledStart: Date; scheduledEnd: Date; server?: { name: string | null } | null;
}): PublicMaintenanceDto {
  return {
    id: w.id,
    title: w.title,
    publicMessage: w.publicMessage,
    status: w.status,
    scheduledStart: w.scheduledStart.toISOString(),
    scheduledEnd: w.scheduledEnd.toISOString(),
    serverName: w.server?.name ?? null,
  };
}

interface IncidentForUser {
  id: string;
  severity: 'MINOR' | 'MAJOR';
  startedAt: string;
  title: string;
  publicMessage: string | null;
}

/**
 * Aggregates probe state into the public `GET /status` payload (H-5) and the
 * per-customer banner feed (H-8). All read paths share a 30 s in-memory cache
 * so the public page survives spikes (status.verris.pl) without overloading
 * the DB. We intentionally don't use Redis here — the cache is per-process
 * and rebuilt on miss; if we ever scale horizontally we can swap the impl
 * without touching callers.
 */
@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name);
  private cached: { at: number; payload: PublicStatusDto } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getPublicStatus(): Promise<PublicStatusDto> {
    if (this.cached && Date.now() - this.cached.at < CACHE_TTL_MS) {
      return this.cached.payload;
    }
    const fresh = await this.buildPublicStatus();
    this.cached = { at: Date.now(), payload: fresh };
    return fresh;
  }

  /**
   * Fetches the open incident (if any) covering the given server. Used by the
   * client-panel banner (H-8) — we want a tight per-user query, NOT the cached
   * page-level payload.
   */
  async findActiveIncidentForServer(serverId: string): Promise<IncidentForUser | null> {
    const incident = await this.prisma.probeIncident.findFirst({
      where: {
        status: IncidentStatus.OPEN,
        probe: { serverId },
      },
      orderBy: { startedAt: 'asc' },
      include: {
        probe: { include: { server: { select: { id: true, name: true } } } },
      },
    });
    if (!incident) return null;
    return {
      id: incident.id,
      severity: incident.severity,
      startedAt: incident.startedAt.toISOString(),
      title: tytulIncydentuDlaKlienta(incident),
      publicMessage: incident.publicMessage,
    };
  }

  async findOpenIncidentsForServers(
    serverIds: string[],
  ): Promise<
    Array<{
      id: string;
      serverId: string;
      serverName: string;
      probeKind: ProbeKind;
      probeTarget: string;
      severity: 'MINOR' | 'MAJOR';
      title: string;
      publicMessage: string | null;
      startedAt: string;
    }>
  > {
    const uniq = Array.from(new Set(serverIds.filter(Boolean)));
    if (!uniq.length) return [];

    const rows = await this.prisma.probeIncident.findMany({
      where: {
        status: IncidentStatus.OPEN,
        probe: { serverId: { in: uniq } },
      },
      orderBy: { startedAt: 'asc' },
      include: {
        probe: { include: { server: { select: { id: true, name: true } } } },
      },
    });

    return rows.map((i) => ({
      id: i.id,
      serverId: i.probe.serverId,
      serverName: i.probe.server.name ?? i.probe.server.id,
      probeKind: i.probe.kind,
      probeTarget: i.probe.target,
      severity: i.severity as 'MINOR' | 'MAJOR',
      title: i.title,
      publicMessage: i.publicMessage,
      startedAt: i.startedAt.toISOString(),
    }));
  }

  invalidate(): void {
    this.cached = null;
  }

  // ---------------------------------------------------------------------------

  private async buildPublicStatus(): Promise<PublicStatusDto> {
    const teraz = new Date();

    // Publiczne są tylko sondy mapujące się na usługę dla klienta (SSH / DA_API zostają wewnętrzne).
    const probes = (
      await this.prisma.serviceProbe.findMany({
        where: {
          isEnabled: true,
          isPublic: true,
          server: { status: { in: [ServerStatus.ACTIVE, ServerStatus.MAINTENANCE] } },
        },
      })
    ).filter((p) => uslugaDlaRodzaju(p.kind));
    const probeIds = probes.map((p) => p.id);
    const kluczUslugi = new Map(probes.map((p) => [p.id, uslugaDlaRodzaju(p.kind)!.key]));

    // Surowe kubełki 1-min zbijamy w SQL do dni (czas polski) i godzin — 90 dni × sondy to setki tysięcy wierszy.
    const [dzienne, godzinowe] = probeIds.length
      ? await Promise.all([
          this.prisma.$queryRaw<Array<WierszProbki>>`
            SELECT "probeId",
                   to_char(date_trunc('day', "bucketStart" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Warsaw'), 'YYYY-MM-DD') AS key,
                   SUM("totalCount")::int AS total,
                   SUM("successCount")::int AS success,
                   SUM("avgLatencyMs" * "totalCount")::float8 AS "latencyWeighted"
            FROM "ProbeSample"
            WHERE "probeId" = ANY(${probeIds}) AND "bucketStart" >= ${new Date(teraz.getTime() - (HISTORIA_DNI + 2) * 86_400_000)}
            GROUP BY 1, 2`,
          this.prisma.$queryRaw<Array<WierszProbki>>`
            SELECT "probeId",
                   to_char(date_trunc('hour', "bucketStart"), 'YYYY-MM-DD"T"HH24":00:00.000Z"') AS key,
                   SUM("totalCount")::int AS total,
                   SUM("successCount")::int AS success,
                   SUM("avgLatencyMs" * "totalCount")::float8 AS "latencyWeighted"
            FROM "ProbeSample"
            WHERE "probeId" = ANY(${probeIds}) AND "bucketStart" >= ${new Date(teraz.getTime() - 25 * 3_600_000)}
            GROUP BY 1, 2`,
        ])
      : [[], []];

    const dni = dniWstecz(dzienWarszawski(teraz), HISTORIA_DNI);
    const godziny = godzinyWstecz(teraz, 24);
    const poUsludze = (wiersze: WierszProbki[], klucz?: string): WierszKubelka[] =>
      wiersze.filter((w) => !klucz || kluczUslugi.get(w.probeId) === klucz);

    const openIncidents = probeIds.length
      ? await this.prisma.probeIncident.findMany({
          where: { probeId: { in: probeIds }, status: IncidentStatus.OPEN },
          include: { probe: true },
        })
      : [];
    const openByProbe = new Map(openIncidents.map((i) => [i.probeId, i]));

    const services: PublicServiceDto[] = USLUGI_PUBLICZNE.flatMap((u) => {
      const sondy = probes.filter((p) => uslugaDlaRodzaju(p.kind)?.key === u.key);
      if (!sondy.length) return []; // pokazujemy tylko to, co realnie monitorujemy
      const dziennie = scalPoKluczu(poUsludze(dzienne, u.key));
      const godzinowo = scalPoKluczu(poUsludze(godzinowe, u.key));
      const pasek = paskiDni(dni, dziennie);
      return [
        {
          key: u.key,
          name: u.name,
          state: aggregateState(sondy.map((p) => ({ state: stanSondy(p, openByProbe.get(p.id)) }))),
          uptime90Pct: procentDostepnosci(dni.map((d) => dziennie.get(d))),
          avgLatencyMs: sredniCzas(lacz(godziny.map((g) => godzinowo.get(g)))),
          days: pasek,
          latency24h: seriaGodzin(godziny, godzinowo),
        },
      ];
    });

    const wszystkieDni = scalPoKluczu(dzienne);
    const wszystkieGodziny = scalPoKluczu(godzinowe);
    const okno = (n: number) => procentDostepnosci(dni.slice(-n).map((d) => wszystkieDni.get(d)));

    const recent = probeIds.length
      ? await this.prisma.probeIncident.findMany({
          where: { probeId: { in: probeIds } },
          orderBy: { startedAt: 'desc' },
          take: 10,
          include: { probe: true },
        })
      : [];

    const serwery = await this.prisma.server.findMany({
      where: { status: { in: [ServerStatus.ACTIVE, ServerStatus.MAINTENANCE] } },
      select: { id: true },
    });
    const maintenance = await this.prisma.maintenanceWindow.findMany({
      where: maintenanceVisibleWhere(teraz, serwery.map((x) => x.id)),
      orderBy: { scheduledStart: 'asc' },
      take: 20,
    });

    return {
      generatedAt: teraz.toISOString(),
      overall: aggregateState(services),
      availability: {
        h24: procentDostepnosci(godziny.map((g) => wszystkieGodziny.get(g))),
        d7: okno(7),
        d30: okno(30),
        d90: okno(HISTORIA_DNI),
      },
      services,
      activeIncidents: zbijDuplikaty(openIncidents.map(toPublicIncidentDto)),
      recentIncidents: zbijDuplikaty(recent.map(toPublicIncidentDto)),
      // Okno przypięte do węzła nie zdradza jego nazwy — klient widzi tytuł i termin.
      maintenance: maintenance.map((w) => ({
        id: w.id,
        title: w.title,
        publicMessage: w.publicMessage,
        status: w.status,
        scheduledStart: w.scheduledStart.toISOString(),
        scheduledEnd: w.scheduledEnd.toISOString(),
      })),
    };
  }
}

interface WierszProbki extends WierszKubelka {
  probeId: string;
}

function stanSondy(probe: ServiceProbe, open: ProbeIncident | undefined): 'OK' | 'DEGRADED' | 'DOWN' {
  if (open) return open.severity === 'MAJOR' ? 'DOWN' : 'DEGRADED';
  return probe.consecutiveFailures > 0 ? 'DEGRADED' : 'OK';
}

function aggregateState(probes: { state: string }[]): 'OK' | 'DEGRADED' | 'DOWN' {
  if (probes.some((p) => p.state === 'DOWN')) return 'DOWN';
  if (probes.some((p) => p.state === 'DEGRADED')) return 'DEGRADED';
  return 'OK';
}

function toPublicIncidentDto(incident: ProbeIncident & { probe: ServiceProbe }): PublicIncidentDto {
  const usluga = uslugaDlaRodzaju(incident.probe.kind)?.name ?? 'Usługi';
  const ended = incident.resolvedAt ?? null;
  return {
    id: incident.id,
    service: usluga,
    severity: incident.severity,
    status: incident.status,
    title: tytulIncydentuDlaKlienta(incident),
    publicMessage: incident.publicMessage,
    startedAt: incident.startedAt.toISOString(),
    resolvedAt: ended?.toISOString() ?? null,
    durationMinutes: ended
      ? Math.round((ended.getTime() - incident.startedAt.getTime()) / 60000)
      : null,
  };
}
