import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService } from '@nestjs/core';
import { Cron } from '@nestjs/schedule';
import { CronTime } from 'cron';
import { Prisma, Role } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { zadaniaZalegleTemplate } from '../mail/templates/ops-notifications.js';
import {
  AKCJA_ALERTU,
  AKCJA_RECZNEGO,
  COOLDOWN_ALERTU_MS,
  RECZNE_URUCHOMIENIE,
  RETENCJA_DNI,
  czyZalegle,
  kluczZadania,
  opisBledu,
} from './zadania-w-tle.js';

/** Klucz metadanych @Cron w @nestjs/schedule (schedule.constants.d.ts; pakiet nie eksportuje stałej). */
const SCHEDULE_CRON_OPTIONS = 'SCHEDULE_CRON_OPTIONS';
const ORYGINAL = Symbol('zadania-w-tle:oryginal');

type Metoda = ((...args: unknown[]) => unknown) & { [ORYGINAL]?: (...args: unknown[]) => unknown };
type OpcjeCron = { cronTime?: unknown; name?: string; timeZone?: string };

interface Zadanie {
  klucz: string;
  nazwa: string | null;
  harmonogram: string;
  strefa: string | null;
  /** Wrapper providera — instancja istnieje dopiero po utworzeniu wszystkich providerów. */
  dostawca: { instance: unknown };
  oryginal: (...args: unknown[]) => unknown;
}

export interface StanZadania {
  klucz: string;
  nazwa: string | null;
  harmonogram: string;
  strefa: string | null;
  ostatni: { start: string; koniec: string; czasMs: number; ok: boolean; blad: string | null; reczne: boolean } | null;
  ostatniBlad: { start: string; blad: string | null } | null;
  nastepny: string | null;
  trwaOd: string | null;
  zalegle: boolean;
  mozeUruchomic: boolean;
}

/** Rejestr, do którego zapisują owinięte metody (ostatnio utworzona usługa — testy tworzą kilka aplikacji). */
const REJESTR: { aktywny: ZadaniaWTleService | null } = { aktywny: null };

/**
 * F2.8 (OJ-01) — rejestr przebiegów zadań w tle. Bez zmian w samych zadaniach: przy tworzeniu providerów
 * (przed `onModuleInit`, w którym ScheduleExplorer z @nestjs/schedule czyta metody z @Cron) owijamy na
 * prototypie każdą metodę z metadanymi @Cron. Opakowanie zapisuje start, koniec, czas i wyjątek, a wyjątek
 * rzuca dalej — harmonogram i log błędu działają jak wcześniej. Metadane Nesta kopiujemy na opakowanie,
 * więc explorer rejestruje je jak oryginał.
 *
 * Ograniczenie: zadania, które same łapią wyjątki i tylko logują (większość), zapisują się jako udane —
 * rejestr widzi, czy i kiedy zadanie biegło, a błąd tylko wtedy, gdy wyjątek wyszedł z metody.
 */
@Injectable()
export class ZadaniaWTleService implements OnModuleDestroy {
  private readonly logger = new Logger('ZadaniaWTle');
  private readonly zadania = new Map<string, Zadanie>();
  private readonly trwa = new Map<string, { od: Date; ile: number }>();
  private readonly czasy = new Map<string, CronTime | null>();
  private readonly startProcesu = new Date();

  constructor(
    discovery: DiscoveryService,
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {
    REJESTR.aktywny = this;
    for (const dostawca of discovery.getProviders()) {
      const klasa = dostawca.metatype as unknown;
      if (typeof klasa !== 'function' || !klasa.prototype || !klasa.name) continue;
      const proto = klasa.prototype as Record<string, unknown>;
      for (const metoda of Object.getOwnPropertyNames(proto)) {
        if (metoda === 'constructor') continue;
        const opis = Object.getOwnPropertyDescriptor(proto, metoda);
        if (!opis || typeof opis.value !== 'function') continue;
        const fn = opis.value as Metoda;
        const opcje = Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, fn) as OpcjeCron | undefined;
        if (!opcje) continue;
        const klucz = kluczZadania(klasa.name, metoda);
        const oryginal = fn[ORYGINAL] ?? fn;
        if (!fn[ORYGINAL]) Object.defineProperty(proto, metoda, { ...opis, value: owin(klucz, oryginal) });
        if (this.zadania.has(klucz)) continue;
        this.zadania.set(klucz, {
          klucz,
          nazwa: opcje.name ?? null,
          harmonogram: typeof opcje.cronTime === 'string' ? opcje.cronTime : String(opcje.cronTime),
          strefa: opcje.timeZone ?? null,
          dostawca,
          oryginal,
        });
      }
    }
  }

  onModuleDestroy(): void {
    if (REJESTR.aktywny === this) REJESTR.aktywny = null;
  }

  /** Jeden przebieg: zapis po zakończeniu, także przy wyjątku (który leci dalej). Zapis nie psuje zadania. */
  async wykonaj<T>(klucz: string, fn: () => T | Promise<T>, reczneOd: string | null): Promise<T> {
    const start = new Date();
    const t = this.trwa.get(klucz);
    if (t) t.ile += 1;
    else this.trwa.set(klucz, { od: start, ile: 1 });
    let blad: string | null = null;
    try {
      return await fn();
    } catch (e) {
      blad = opisBledu(e);
      throw e;
    } finally {
      const teraz = this.trwa.get(klucz);
      if (teraz && --teraz.ile <= 0) this.trwa.delete(klucz);
      const koniec = new Date();
      await this.prisma.scheduledJobRun
        .create({
          data: {
            job: klucz,
            startedAt: start,
            finishedAt: koniec,
            durationMs: koniec.getTime() - start.getTime(),
            ok: blad === null,
            error: blad,
            manualBy: reczneOd,
          },
        })
        .catch((e: unknown) => this.logger.warn(`Nie zapisano przebiegu ${klucz}: ${opisBledu(e)}`));
    }
  }

  private nastepnyPo(z: Zadanie, d: Date): Date | null {
    let czas = this.czasy.get(z.klucz);
    if (czas === undefined) {
      try {
        czas = new CronTime(z.harmonogram, z.strefa ?? undefined);
      } catch {
        czas = null;
      }
      this.czasy.set(z.klucz, czas);
    }
    if (!czas) return null;
    try {
      return czas.getNextDateFrom(d).toJSDate();
    } catch {
      return null;
    }
  }

  /** Stan wszystkich zadań: ostatni przebieg i ostatni błąd z bazy (30 dni), następny termin, zaległość. */
  async stan(czyAdmin: boolean, teraz = new Date()): Promise<StanZadania[]> {
    const klucze = [...this.zadania.keys()].sort();
    if (klucze.length === 0) return [];
    const wiersze = await this.prisma.$queryRaw<
      Array<{
        job: string;
        startedAt: Date | null;
        finishedAt: Date | null;
        durationMs: number | null;
        ok: boolean | null;
        error: string | null;
        manualBy: string | null;
        bladStart: Date | null;
        bladTresc: string | null;
      }>
    >(Prisma.sql`
      SELECT k.job, r."startedAt", r."finishedAt", r."durationMs", r.ok, r.error, r."manualBy",
             e."startedAt" AS "bladStart", e.error AS "bladTresc"
      FROM unnest(${klucze}::text[]) AS k(job)
      LEFT JOIN LATERAL (
        SELECT * FROM "ScheduledJobRun" s WHERE s.job = k.job ORDER BY s."startedAt" DESC LIMIT 1
      ) r ON true
      LEFT JOIN LATERAL (
        SELECT s."startedAt", s.error FROM "ScheduledJobRun" s
        WHERE s.job = k.job AND s.ok = false ORDER BY s."startedAt" DESC LIMIT 1
      ) e ON true`);
    const poKluczu = new Map(wiersze.map((w) => [w.job, w]));
    return klucze.map((klucz) => {
      const z = this.zadania.get(klucz)!;
      const w = poKluczu.get(klucz);
      const trwa = this.trwa.get(klucz);
      const nastepny = this.nastepnyPo(z, teraz);
      return {
        klucz,
        nazwa: z.nazwa,
        harmonogram: z.harmonogram,
        strefa: z.strefa,
        ostatni:
          w?.startedAt && w.finishedAt
            ? {
                start: w.startedAt.toISOString(),
                koniec: w.finishedAt.toISOString(),
                czasMs: w.durationMs ?? 0,
                ok: w.ok === true,
                blad: w.error,
                reczne: w.manualBy !== null,
              }
            : null,
        ostatniBlad: w?.bladStart ? { start: w.bladStart.toISOString(), blad: w.bladTresc } : null,
        nastepny: nastepny?.toISOString() ?? null,
        trwaOd: trwa?.od.toISOString() ?? null,
        zalegle: czyZalegle({
          ostatniStart: w?.startedAt ?? null,
          startProcesu: this.startProcesu,
          teraz,
          nastepnyPo: (d) => this.nastepnyPo(z, d),
        }),
        mozeUruchomic: czyAdmin && RECZNE_URUCHOMIENIE.has(klucz),
      };
    });
  }

  /** Ręczne uruchomienie (ADMIN — strażnik w kontrolerze) zadania z białej listy. Biegnie w tle, wynik w rejestrze. */
  async uruchomRecznie(klucz: string, adminId: string): Promise<{ uruchomiono: true }> {
    if (!RECZNE_URUCHOMIENIE.has(klucz)) throw new ForbiddenException('Tego zadania nie uruchamia się ręcznie.');
    const z = this.zadania.get(klucz);
    if (!z) throw new NotFoundException('Nie ma takiego zadania.');
    if (this.trwa.has(klucz)) throw new ConflictException('Zadanie właśnie biegnie — poczekaj na koniec przebiegu.');
    const instancja = z.dostawca.instance;
    if (!instancja) throw new ConflictException('Zadanie nie jest jeszcze gotowe.');
    await this.audit.record({ action: AKCJA_RECZNEGO, actorUserId: adminId, details: { zadanie: klucz } });
    void this.wykonaj(klucz, () => z.oryginal.call(instancja), adminId).catch((e: unknown) =>
      this.logger.error(`Ręczne uruchomienie ${klucz}: ${opisBledu(e)}`),
    );
    return { uruchomiono: true };
  }

  /**
   * Alert o zadaniach, które nie biegły od dwóch terminów z harmonogramu — mail do administratorów jak inne alerty
   * operatorskie (ops-watchdog), najwyżej raz na dobę na zadanie (cooldown przez AuditLog).
   */
  @Cron('*/5 * * * *', { name: 'zadania-w-tle:straznik' })
  async sprawdzZalegle(teraz = new Date()): Promise<string[]> {
    const zalegle = (await this.stan(false, teraz)).filter((z) => z.zalegle);
    if (zalegle.length === 0) return [];
    const ostatnie = await this.prisma.auditLog.findMany({
      where: { action: AKCJA_ALERTU, createdAt: { gte: new Date(teraz.getTime() - COOLDOWN_ALERTU_MS) } },
      select: { details: true },
    });
    const juz = new Set(ostatnie.map((r) => (r.details as { zadanie?: string } | null)?.zadanie));
    const nowe = zalegle.filter((z) => !juz.has(z.klucz));
    if (nowe.length === 0) return [];
    for (const z of nowe) {
      await this.audit.record({ action: AKCJA_ALERTU, details: { zadanie: z.klucz, ostatnio: z.ostatni?.start ?? null } });
    }
    this.logger.error(`Zadania w tle nie biegną: ${nowe.map((z) => z.klucz).join(', ')}`);
    const admini = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, anonymizedAt: null },
      select: { email: true, firstName: true },
    });
    const panelUrl = (this.config.get<string>('adminPanelUrl') ?? process.env.ADMIN_PANEL_URL ?? 'https://admin.verris.pl').replace(/\/$/, '');
    for (const a of admini) {
      await this.mailer
        .send(
          zadaniaZalegleTemplate({
            to: a.email,
            firstName: a.firstName,
            zadania: nowe.map((z) => ({ nazwa: z.nazwa ?? z.klucz, harmonogram: z.harmonogram, ostatnio: z.ostatni ? new Date(z.ostatni.start) : null })),
            panelUrl,
          }),
        )
        .catch((e: unknown) => this.logger.error(`Alert o zadaniach w tle do ${a.email}: ${opisBledu(e)}`));
    }
    return nowe.map((z) => z.klucz);
  }

  /** Retencja rejestru — przebiegi starsze niż 30 dni. */
  @Cron('50 3 * * *', { name: 'zadania-w-tle:retencja' })
  async retencja(teraz = new Date()): Promise<number> {
    const { count } = await this.prisma.scheduledJobRun.deleteMany({
      where: { startedAt: { lt: new Date(teraz.getTime() - RETENCJA_DNI * 24 * 60 * 60 * 1000) } },
    });
    return count;
  }
}

/** Opakowanie metody @Cron: przebieg idzie przez aktywny rejestr; bez rejestru — wprost. Metadane jak w oryginale. */
function owin(klucz: string, oryginal: (...args: unknown[]) => unknown): Metoda {
  const owiniety: Metoda = function (this: unknown, ...args: unknown[]) {
    const rejestr = REJESTR.aktywny;
    return rejestr ? rejestr.wykonaj(klucz, () => oryginal.apply(this, args), null) : oryginal.apply(this, args);
  };
  for (const k of Reflect.getOwnMetadataKeys(oryginal)) {
    Reflect.defineMetadata(k, Reflect.getOwnMetadata(k, oryginal), owiniety);
  }
  Object.defineProperty(owiniety, 'name', { value: oryginal.name });
  owiniety[ORYGINAL] = oryginal;
  return owiniety;
}
