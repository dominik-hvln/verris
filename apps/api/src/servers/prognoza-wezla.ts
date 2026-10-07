import { Injectable, NotFoundException } from '@nestjs/common';
import { AiInteractionStatus } from '@verris/database';
import type { ForecastResource, ServiceForecastResourceDto } from '@verris/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiService } from '../ai/ai.service.js';
import { AiProviderService } from '../ai/ai-provider.service.js';
import { HORYZONT_DNI, opisPrognozy, policzPrognoze, type LimityPlanu, type Pomiar } from '../ai/prognoza-zasobow.js';
import { SWIEZOSC_TELEMETRII_MIN, swiezaTelemetria } from '../subscriptions/node-capacity.js';
import { nazwaWezla, pozaPula } from '../admin-dashboard/stan-platformy.js';
import { StosWezlaService } from './stos-wezla.service.js';
import { zgodnoscZManifestem } from './stos-wezla.js';
import { sumyWezlow, zapasPuli, type WierszSerii, type Zapas } from './wykresy-floty.js';

/**
 * Prognozy węzłów dla operatora (koncepcja zatwierdzona 2026-10-05): WSZYSTKIE liczby liczy panel —
 * regresja 7 dni (policzPrognoze z limitami węzła), najcichsza godzina, zapas puli, kandydaci do przeniesienia,
 * sygnały. AI dopisuje tylko krótkie zalecenia do gotowych liczb i niczego nie wykonuje — każdą operację
 * uruchamia człowiek. AI dostaje wyłącznie liczby: konta jako „konto 1..N”, bez domen, e-maili i nazw klientów.
 */

const DZIEN = 86_400_000;
const AI_CACHE_MS = DZIEN;
const MIN_PUNKTOW = 6;
const r1 = (n: number) => Math.round(n * 10) / 10;
const BRAK_DANYCH = 'Za mało danych telemetrycznych — prognoza pojawi się po zebraniu kilku godzin metryk.';

export type Ton = 'warn' | 'crit';
export interface Sygnal {
  ton: Ton;
  tekst: string;
}

const dni = (n: number) => `${n} ${n === 1 ? 'dzień' : 'dni'}`;
const kont = (n: number) => {
  const r10 = n % 10;
  const r100 = n % 100;
  return `${n} ${n === 1 ? 'konto' : r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14) ? 'konta' : 'kont'}`;
};
const ZASOB: Record<ForecastResource, string> = { CPU: 'CPU', RAM: 'RAM', DISK: 'dysku', IO: 'IO' };
const ZASOB_M: Record<ForecastResource, string> = { CPU: 'CPU', RAM: 'RAM', DISK: 'Dysk', IO: 'IO' };

/** Limity węzła dla policzPrognoze: CPU w % rdzenia (próbki LVE sumowane po kontach), IO pomijamy. */
export function limityWezla(s: { totalCpuCores: number | null; totalMemoryMb: number | null; totalDiskMb: number | null }): LimityPlanu {
  return { cpuLimit: (s.totalCpuCores ?? 0) * 100, ramLimitMb: s.totalMemoryMb ?? 0, diskLimitMb: s.totalDiskMb ?? 0, ioLimitKbps: 0 };
}

export const pomiaryZSerii = (w: WierszSerii[]): Pomiar[] =>
  w.map((r) => ({ bucketStart: new Date(r.t), cpuUsageAvg: Number(r.cpu), memUsageAvgMb: Number(r.ram), diskUsageMb: Number(r.dysk), ioUsageKbps: 0 }));

const godzinaWarszawa = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Warsaw' });

/** Godzina doby (czas polski) o najniższym średnim CPU z serii godzinowej — okno na aktualizacje. */
export function najcichszaGodzina(pomiary: Pomiar[], cpuLimit: number): { godzina: number; cpuProc: number } | null {
  if (cpuLimit <= 0 || !pomiary.length) return null;
  const wg = new Map<number, number[]>();
  for (const p of pomiary) {
    const h = Number(godzinaWarszawa.format(p.bucketStart));
    wg.set(h, [...(wg.get(h) ?? []), p.cpuUsageAvg]);
  }
  const [godzina, srednia] = [...wg.entries()]
    .map(([h, v]) => [h, v.reduce((a, b) => a + b, 0) / v.length] as const)
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])[0]!;
  return { godzina, cpuProc: Math.round((srednia / cpuLimit) * 100) };
}

export { zapasPuli, type WezelPojemnosc, type Zapas } from './wykresy-floty.js';

/** Konta o największym udziale w CPU węzła (średnia 7 dni). Etykiety „konto N” idą do AI zamiast domen. */
export function kandydaciDoPrzeniesienia(konta: { accountId: string; cpu: number }[], cpuLimit: number, n = 3) {
  const suma = konta.reduce((a, k) => a + Number(k.cpu), 0);
  if (suma <= 0) return [];
  return [...konta]
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, n)
    .map((k, i) => ({
      etykieta: `konto ${i + 1}`,
      accountId: k.accountId,
      udzialProc: r1((k.cpu / suma) * 100),
      mocWezlaProc: cpuLimit > 0 ? r1((k.cpu / cpuLimit) * 100) : null,
    }));
}

export function sygnalyWezla(a: {
  resources: ServiceForecastResourceDto[];
  rozjazdy: number;
  lastOffsiteBackupAt: Date | null;
  lastOffsiteBackupOk: boolean;
  zapas: Zapas | null;
  teraz: number;
}): Sygnal[] {
  const out: Sygnal[] = [];
  for (const r of [...a.resources].sort((x, y) => (x.daysToLimit ?? 999) - (y.daysToLimit ?? 999))) {
    if (r.daysToLimit === null || r.daysToLimit > 30) continue;
    out.push({
      ton: r.daysToLimit <= 7 ? 'crit' : 'warn',
      tekst: r.daysToLimit === 0 ? `${ZASOB_M[r.resource]} na limicie węzła (${r.currentPct}%)` : `Limit ${ZASOB[r.resource]} za ~${dni(r.daysToLimit)}`,
    });
  }
  const dysk = a.resources.find((r) => r.resource === 'DISK');
  const dyskProc = dysk?.currentPct ?? 0;
  if (dyskProc >= 80) out.push({ ton: dyskProc >= 90 ? 'crit' : 'warn', tekst: `Dysk zajęty w ${Math.round(dyskProc)}%` });
  if (a.rozjazdy > 0) out.push({ ton: 'warn', tekst: `Stos nieaktualny względem manifestu floty (rozjazdy: ${a.rozjazdy})` });
  if (!a.lastOffsiteBackupAt || !a.lastOffsiteBackupOk || a.teraz - a.lastOffsiteBackupAt.getTime() > DZIEN) {
    out.push({ ton: 'crit', tekst: 'Brak udanej kopii poza serwerem w ostatnich 24 h' });
  }
  if (a.zapas && a.zapas.kont === 0) out.push({ ton: 'warn', tekst: `Pula sprzedażowa wyczerpana (${a.zapas.wymiar})` });
  return out;
}

/** Jedna linia na kartę węzła na stronie „Wykresy” — bez AI. */
export function liniaKarty(resources: ServiceForecastResourceDto[], dostepna: boolean): { tekst: string; ton: Ton | null } {
  if (!dostepna) return { tekst: 'za mało danych do prognozy', ton: null };
  const r = resources.filter((x) => x.daysToLimit !== null && x.daysToLimit <= 30).sort((x, y) => x.daysToLimit! - y.daysToLimit!)[0];
  if (!r) return { tekst: 'w normie przez 30 dni', ton: null };
  const ton: Ton = r.daysToLimit! <= 7 ? 'crit' : 'warn';
  return r.daysToLimit === 0 ? { tekst: `${ZASOB_M[r.resource]} na limicie`, ton } : { tekst: `limit ${ZASOB[r.resource]} za ~${dni(r.daysToLimit!)}`, ton };
}

/** Podsumowanie floty bez AI. */
export function opisFloty(wezly: { nazwa: string; wPuli: boolean; resources: ServiceForecastResourceDto[]; zapas: Zapas | null }[]): string {
  if (!wezly.length) return 'Brak węzłów hostujących — nie ma czego prognozować.';
  const najblizszy = wezly
    .flatMap((w) => w.resources.filter((r) => r.daysToLimit !== null && r.daysToLimit <= 30).map((r) => ({ w, r })))
    .sort((a, b) => a.r.daysToLimit! - b.r.daysToLimit!)[0];
  const zapas = wezly.filter((w) => w.wPuli).reduce((a, w) => a + (w.zapas?.kont ?? 0), 0);
  const pierwsze = najblizszy
    ? najblizszy.r.daysToLimit === 0
      ? `${najblizszy.w.nazwa}: ${ZASOB_M[najblizszy.r.resource]} na limicie.`
      : `Najbliżej limitu: ${najblizszy.w.nazwa} — ${ZASOB[najblizszy.r.resource]} za ok. ${dni(najblizszy.r.daysToLimit!)}.`
    : 'Wszystkie węzły w normie przez 30 dni.';
  return `${pierwsze} Pula floty zmieści jeszcze ok. ${kont(zapas)} w pakiecie standardowym.`;
}

/** Bezpieczne odczytanie odpowiedzi AI: JSON od dostawcy może mieć dowolny kształt. */
export function zKomentarza(out: unknown): { podsumowanie: string; zalecenia: string[] } | null {
  const o = out && typeof out === 'object' ? (out as Record<string, unknown>) : {};
  const podsumowanie = typeof o.podsumowanie === 'string' ? o.podsumowanie.trim().slice(0, 600) : '';
  if (!podsumowanie) return null;
  const zalecenia = Array.isArray(o.zalecenia)
    ? o.zalecenia.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim().slice(0, 300)).slice(0, 4)
    : [];
  return { podsumowanie, zalecenia };
}

/** „konto 2” / „kontem 2” w tekście AI → domena konta (mapowanie robi panel, AI domen nie widzi). */
export function podstawDomeny(tekst: string, domeny: Map<number, string>): string {
  return tekst.replace(/\b(kont\p{Ll}*)\s+(\d+)\b/gu, (m, slowo: string, n: string) => (domeny.has(Number(n)) ? `${slowo} ${domeny.get(Number(n))}` : m));
}

const SYSTEM_WEZEL = [
  'Jesteś asystentem operatora hostingu Verris. Dostajesz GOTOWE liczby prognozy jednego węzła (procent pojemności węzła,',
  'najcichsza godzina, zapas puli w standardowych kontach, konta o największym udziale w CPU, sygnały, węzły z zapasem).',
  'Nie zmieniaj ani nie wymyślaj liczb. Niczego nie wykonujesz — decyzję i operację podejmuje operator.',
  'Zwracasz WYŁĄCZNIE JSON: {"podsumowanie": string, "zalecenia": [string]}.',
  'podsumowanie: 1–2 zdania po polsku. zalecenia: najwyżej 4 konkretne kroki uzasadnione liczbami, np. przenieś konto N',
  'na węzeł z zapasem (podaj jego nazwę), zaplanuj aktualizację na HH:00, zamów nowy węzeł za ok. N tygodni, sprawdź kopię.',
  'Konta nazywaj dokładnie „konto N”, tak jak w danych. Gdy wszystko jest w normie — zwróć pustą listę zaleceń.',
].join('\n');

const SYSTEM_FLOTA = [
  'Jesteś asystentem operatora hostingu Verris. Dostajesz GOTOWE liczby prognozy wszystkich węzłów floty',
  '(procent pojemności teraz i za 7 dni, dni do limitu, zapas puli w standardowych kontach, tempo nowych kont, sygnały).',
  'Nie zmieniaj ani nie wymyślaj liczb. Niczego nie wykonujesz — decyzję podejmuje operator.',
  'Zwracasz WYŁĄCZNIE JSON: {"podsumowanie": string, "zalecenia": [string]}.',
  'podsumowanie: 1–2 zdania po polsku o stanie floty. zalecenia: najwyżej 4 konkretne kroki uzasadnione liczbami, np. który węzeł',
  'zapełni się pierwszy, czy i kiedy zamówić kolejny węzeł, gdzie kierować nowe konta. Gdy wszystko w normie — pusta lista.',
].join('\n');

const POLA = {
  id: true,
  name: true,
  hostname: true,
  ipAddress: true,
  status: true,
  lastHeartbeatAt: true,
  onboardReport: true,
  maintenanceReason: true,
  onboardVerifiedAt: true,
  acceptsNewAccounts: true,
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
  maxAccounts: true,
  stackVersion: true,
  dbVersion: true,
  lsVersion: true,
  phpDefaultVersion: true,
  lastOffsiteBackupAt: true,
  lastOffsiteBackupOk: true,
  _count: { select: { accounts: { where: { status: { not: 'DELETED' as const } } } } },
} as const;

@Injectable()
export class PrognozaWezlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stos: StosWezlaService,
    private readonly ai: AiService,
    private readonly provider: AiProviderService,
  ) {}

  /** Wszystkie węzły z zapasem puli i zgodnością — tanie zapytania, bez serii czasowych. */
  private async kontekst(teraz: number) {
    const [serwery, swieze, przyrost, manifest] = await Promise.all([
      this.prisma.server.findMany({ where: { status: { not: 'DEPROVISIONING' } }, select: POLA }),
      this.prisma.$queryRaw<{ serverId: string }[]>`
        SELECT DISTINCT "serverId" FROM "UsageMetric"
        WHERE "serverId" IS NOT NULL AND "bucketStart" >= ${new Date(teraz - SWIEZOSC_TELEMETRII_MIN * 60_000)}`,
      this.prisma.account.groupBy({
        by: ['serverId'],
        where: { status: { not: 'DELETED' }, createdAt: { gte: new Date(teraz - 30 * DZIEN) } },
        _count: { _all: true },
      }),
      this.stos.pobierz(),
    ]);
    const swiezy = new Set(swieze.map((r) => r.serverId));
    const nowe = new Map(przyrost.map((r) => [r.serverId, r._count._all]));
    return serwery.map((s) => ({
      s,
      nazwa: nazwaWezla(s),
      konta: s._count.accounts,
      zapas: zapasPuli(s, { konta: s._count.accounts, swieza: swiezaTelemetria(swiezy.has(s.id), s._count.accounts), nowe30: nowe.get(s.id) ?? 0 }),
      rozjazdy: zgodnoscZManifestem(
        { stackVersion: s.stackVersion, dbVersion: s.dbVersion, lsVersion: s.lsVersion, phpVersion: s.phpDefaultVersion },
        manifest,
      ).filter((p) => p.zgodne === false).length,
    }));
  }

  private liczby(w: Awaited<ReturnType<PrognozaWezlaService['kontekst']>>[number], wiersze: WierszSerii[], teraz: number) {
    const limity = limityWezla(w.s);
    const pomiary = pomiaryZSerii(wiersze);
    const dostepna = pomiary.length >= MIN_PUNKTOW && limity.cpuLimit > 0 && limity.ramLimitMb > 0 && limity.diskLimitMb > 0;
    const prognoza = dostepna ? policzPrognoze(limity, pomiary) : { confidence: 'low' as const, horizonDays: HORYZONT_DNI, resources: [] };
    return {
      limity,
      dostepna,
      ...prognoza,
      oknoAktualizacji: dostepna ? najcichszaGodzina(pomiary, limity.cpuLimit) : null,
      sygnaly: sygnalyWezla({ resources: prognoza.resources, rozjazdy: w.rozjazdy, lastOffsiteBackupAt: w.s.lastOffsiteBackupAt, lastOffsiteBackupOk: w.s.lastOffsiteBackupOk, zapas: w.zapas, teraz }),
    };
  }

  /** Komentarz AI raz na 24 h (aiInteractionLog), null = pokazujemy same liczby z tekstem panelu. */
  private async komentarz(a: { feature: string; serverId: string | null; system: string; wejscie: object; konta: string[]; actorUserId: string; teraz: number }) {
    try {
      if (!(await this.provider.dostepny('analiza'))) return null;
      const swiezy = await this.prisma.aiInteractionLog.findFirst({
        where: {
          feature: a.feature,
          status: AiInteractionStatus.COMPLETED,
          createdAt: { gte: new Date(a.teraz - AI_CACHE_MS) },
          ...(a.serverId ? { inputSummary: { path: ['serverId'], equals: a.serverId } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: { output: true, inputSummary: true },
      });
      const out = swiezy
        ? swiezy.output
        : await this.ai.runLogged({
            feature: a.feature,
            actorUserId: a.actorUserId,
            inputSummary: { serverId: a.serverId, konta: a.konta },
            system: a.system,
            user: JSON.stringify(a.wejscie),
          });
      const k = zKomentarza(out);
      if (!k) return null;
      // Mapowanie „konto N” → konto z TEGO wywołania (ranking mógł się zmienić od zapisu komentarza).
      const zapisane = swiezy ? (swiezy.inputSummary as { konta?: unknown } | null)?.konta : a.konta;
      return { ...k, konta: Array.isArray(zapisane) ? zapisane.filter((x): x is string => typeof x === 'string') : [] };
    } catch {
      return null;
    }
  }

  async wezel(id: string, actorUserId: string, teraz = Date.now()) {
    const ctx = await this.kontekst(teraz);
    const w = ctx.find((x) => x.s.id === id);
    if (!w) throw new NotFoundException('Nie znaleziono węzła.');
    const od = new Date(teraz - 7 * DZIEN);
    const [wiersze, naKonto] = await Promise.all([
      sumyWezlow(this.prisma, od, '1 hour', id),
      this.prisma.$queryRaw<{ accountId: string; cpu: number }[]>`
        SELECT "accountId", AVG("cpuUsageAvg")::float8 AS cpu FROM "UsageMetric"
        WHERE "serverId" = ${id} AND "accountId" IS NOT NULL AND "bucketDurationS" <= 300 AND "bucketStart" >= ${od}
        GROUP BY 1`,
    ]);
    const l = this.liczby(w, wiersze, teraz);
    const top = kandydaciDoPrzeniesienia(naKonto, l.limity.cpuLimit);

    const ai = l.dostepna
      ? await this.komentarz({
          feature: 'node_forecast',
          serverId: id,
          system: SYSTEM_WEZEL,
          actorUserId,
          teraz,
          konta: top.map((k) => k.accountId),
          wejscie: {
            wezel: { rdzenie: w.s.totalCpuCores, ramGb: Math.round(l.limity.ramLimitMb / 1024), dyskGb: Math.round(l.limity.diskLimitMb / 1024), konta: w.konta },
            horyzontDni: l.horizonDays,
            pewnosc: l.confidence,
            zasoby: l.resources.map(({ resource, currentPct, predictedPct, trend, daysToLimit }) => ({ resource, currentPct, predictedPct, trend, daysToLimit })),
            oknoAktualizacji: l.oknoAktualizacji && { godzina: `${String(l.oknoAktualizacji.godzina).padStart(2, '0')}:00`, cpuProc: l.oknoAktualizacji.cpuProc },
            zapas: w.zapas,
            kandydaci: top.map((k) => ({ konto: k.etykieta, udzialWCpuWezlaProc: k.udzialProc, mocWezlaProc: k.mocWezlaProc })),
            sygnaly: l.sygnaly.map((s) => s.tekst),
            wezlyZZapasem: ctx
              .filter((x) => x.s.id !== id && !pozaPula(x.s) && (x.zapas?.kont ?? 0) > 0)
              .map((x) => ({ nazwa: x.nazwa, zapasKont: x.zapas!.kont })),
          },
        })
      : null;

    const ids = [...new Set([...top.map((k) => k.accountId), ...(ai?.konta ?? [])])];
    const konta = ids.length ? await this.prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, domain: true, subscriptionId: true } }) : [];
    const kontoWg = new Map(konta.map((k) => [k.id, k]));
    const domeny = new Map((ai?.konta ?? []).flatMap((accountId, i) => (kontoWg.has(accountId) ? [[i + 1, kontoWg.get(accountId)!.domain] as const] : [])));

    return {
      generatedAt: new Date(teraz).toISOString(),
      serverId: id,
      nazwa: w.nazwa,
      dostepna: l.dostepna,
      confidence: l.confidence,
      horizonDays: l.horizonDays,
      resources: l.resources,
      oknoAktualizacji: l.oknoAktualizacji,
      zapas: w.zapas,
      kandydaci: top.map((k) => ({ ...k, domena: kontoWg.get(k.accountId)?.domain ?? null, subscriptionId: kontoWg.get(k.accountId)?.subscriptionId ?? null })),
      sygnaly: l.sygnaly,
      podsumowanie: ai ? podstawDomeny(ai.podsumowanie, domeny) : l.dostepna ? opisPrognozy(l.resources, 'węzła') : BRAK_DANYCH,
      zalecenia: ai ? ai.zalecenia.map((z) => podstawDomeny(z, domeny)) : [],
      komentarzAi: Boolean(ai),
    };
  }

  async flota(actorUserId: string, teraz = Date.now()) {
    const ctx = (await this.kontekst(teraz)).filter((x) => x.s.status === 'ACTIVE' || x.s.status === 'MAINTENANCE');
    const wiersze = ctx.length ? await sumyWezlow(this.prisma, new Date(teraz - 7 * DZIEN), '1 hour') : [];
    const wg = new Map<string, WierszSerii[]>();
    for (const r of wiersze) wg.set(r.serverId, [...(wg.get(r.serverId) ?? []), r]);

    const wezly = ctx.map((w) => {
      const l = this.liczby(w, wg.get(w.s.id) ?? [], teraz);
      return {
        id: w.s.id,
        nazwa: w.nazwa,
        wPuli: !pozaPula(w.s),
        konta: w.konta,
        dostepna: l.dostepna,
        resources: l.resources.map(({ historia: _h, ...r }) => r),
        zapas: w.zapas,
        sygnaly: l.sygnaly,
        linia: liniaKarty(l.resources, l.dostepna),
      };
    });
    const ai = wezly.some((w) => w.dostepna)
      ? await this.komentarz({
          feature: 'fleet_forecast',
          serverId: null,
          system: SYSTEM_FLOTA,
          actorUserId,
          teraz,
          konta: [],
          wejscie: {
            horyzontDni: HORYZONT_DNI,
            wezly: wezly.map((w) => ({
              nazwa: w.nazwa,
              wPuli: w.wPuli,
              konta: w.konta,
              zasoby: w.resources.map(({ resource, currentPct, predictedPct, trend, daysToLimit }) => ({ resource, currentPct, predictedPct, trend, daysToLimit })),
              zapas: w.zapas,
              sygnaly: w.sygnaly.map((s) => s.tekst),
            })),
          },
        })
      : null;

    return {
      generatedAt: new Date(teraz).toISOString(),
      wezly,
      podsumowanie: ai?.podsumowanie ?? opisFloty(wezly),
      zalecenia: ai?.zalecenia ?? [],
      komentarzAi: Boolean(ai),
    };
  }
}
