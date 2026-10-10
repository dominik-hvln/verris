import 'reflect-metadata';
import { Global, Injectable, Module, type INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Cron, ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { CronTime } from 'cron';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ZadaniaWTleModule } from './zadania-w-tle.module.js';
import { ZadaniaWTleService } from './zadania-w-tle.service.js';
import { RECZNE_URUCHOMIENIE, ZAPAS_MS, czyZalegle, opisBledu } from './zadania-w-tle.js';
import { NbpFxService } from '../domains/nbp-fx.service.js';
import { ProbeScheduler } from '../status/probe.scheduler.js';
import { OpsWatchdogScheduler } from '../admin-readiness/ops-watchdog.scheduler.js';
import { MailHealthScheduler } from '../admin-readiness/mail-health.scheduler.js';
import { RblReputationScheduler } from '../admin-readiness/rbl-reputation.scheduler.js';
import { WpPodatnosciService } from '../subscriptions/wp-podatnosci.service.js';

/** F2.8 (OJ-01) — rejestr przebiegów zadań w tle: zapis błędu, zaległość 2× interwał, biała lista ręcznych. */

const nastepnyPo = (wyrazenie: string) => {
  const t = new CronTime(wyrazenie);
  return (d: Date) => t.getNextDateFrom(d).toJSDate();
};

describe('czyZalegle — nie biegło dłużej niż 2× interwał z harmonogramu', () => {
  const start = new Date('2026-10-10T08:00:00Z');
  it('co godzinę: po dwóch terminach + zapas — alert; tuż przed — nie', () => {
    const ostatni = new Date('2026-10-10T10:00:00.010Z');
    const fn = nastepnyPo('0 * * * *');
    expect(czyZalegle({ ostatniStart: ostatni, startProcesu: start, teraz: new Date(Date.parse('2026-10-10T12:00:00Z') + ZAPAS_MS - 1), nastepnyPo: fn })).toBe(false);
    expect(czyZalegle({ ostatniStart: ostatni, startProcesu: start, teraz: new Date(Date.parse('2026-10-10T12:00:00Z') + ZAPAS_MS + 1), nastepnyPo: fn })).toBe(true);
  });

  it('przebieg sprzed startu procesu (przestój API) liczy się od startu procesu', () => {
    const fn = nastepnyPo('30 3 * * *');
    const proces = new Date('2026-10-10T08:00:00Z');
    // Ostatni przebieg 5 dni temu, ale API wstało dziś rano — dwa terminy od startu to 11 i 12.10, 03:30.
    expect(czyZalegle({ ostatniStart: new Date('2026-10-05T03:30:00Z'), startProcesu: proces, teraz: new Date('2026-10-11T12:00:00Z'), nastepnyPo: fn })).toBe(false);
    expect(czyZalegle({ ostatniStart: null, startProcesu: proces, teraz: new Date('2026-10-12T03:40:00Z'), nastepnyPo: fn })).toBe(true);
  });

  it('nieregularny harmonogram (dni robocze) — piątkowy przebieg nie jest zaległy w niedzielę', () => {
    const fn = nastepnyPo('15 11-14 * * 1-5');
    expect(czyZalegle({ ostatniStart: new Date('2026-10-09T14:15:00Z'), startProcesu: start, teraz: new Date('2026-10-11T20:00:00Z'), nastepnyPo: fn })).toBe(false);
  });

  it('opis błędu: bez stosu, przycięty', () => {
    expect(opisBledu(new TypeError('x'))).toBe('TypeError: x');
    expect(opisBledu(new Error('a'.repeat(5000)))).toHaveLength(2000);
  });
});

@Injectable()
class TestoweZadania {
  ile = 0;
  @Cron('0 0 1 1 *', { name: 'test:boom' })
  async boom(): Promise<void> {
    this.ile += 1;
    throw new Error('rejestrator RBL nie odpowiada');
  }
  @Cron('0 0 1 1 *', { name: 'test:ok' })
  async dziala(): Promise<number> {
    this.ile += 1;
    return 7;
  }
}

describe('rejestr przebiegów — z prawdziwym ScheduleModule', () => {
  const zapisane: Array<Record<string, unknown>> = [];
  const audyt: Array<Record<string, unknown>> = [];
  const prisma = {
    scheduledJobRun: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (zapisane.push(data), data)) },
    $queryRaw: vi.fn(async () => []),
    auditLog: { findMany: vi.fn(async () => []) },
    user: { findMany: vi.fn(async () => [{ email: 'admin@test.verris.pl', firstName: null }]) },
  };
  const mailer = { send: vi.fn(async () => ({ delivered: true })) };
  const audytSvc = { record: vi.fn(async (p: Record<string, unknown>) => void audyt.push(p)) };

  // Globalne zależności usługi (w aplikacji: PrismaModule, MailModule, AuditModule, ConfigModule — @Global).
  @Global()
  @Module({
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: MailerService, useValue: mailer },
      { provide: AuditService, useValue: audytSvc },
      { provide: ConfigService, useValue: { get: () => undefined } },
    ],
    exports: [PrismaService, MailerService, AuditService, ConfigService],
  })
  class Zaleznosci {}

  @Module({ imports: [Zaleznosci, ScheduleModule.forRoot(), ZadaniaWTleModule], providers: [TestoweZadania] })
  class Aplikacja {}

  let app: INestApplicationContext;
  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(Aplikacja, { logger: false });
  });
  afterAll(async () => app?.close());

  it('wyjątek zadania z harmonogramu: przebieg zapisany z błędem i czasem, harmonogram dalej działa', async () => {
    const job = app.get(SchedulerRegistry).getCronJob('test:boom');
    await job.fireOnTick();
    await vi.waitFor(() => expect(zapisane.some((z) => z.job === 'TestoweZadania.boom')).toBe(true));
    const z = zapisane.find((x) => x.job === 'TestoweZadania.boom')!;
    expect(z).toMatchObject({ ok: false, error: 'rejestrator RBL nie odpowiada', manualBy: null });
    expect(typeof z.durationMs).toBe('number');
    expect((z.finishedAt as Date).getTime()).toBeGreaterThanOrEqual((z.startedAt as Date).getTime());
    expect(app.get(TestoweZadania).ile).toBe(1);
  });

  it('udany przebieg: ok, bez błędu; wynik metody bez zmian dla wywołującego', async () => {
    expect(await app.get(TestoweZadania).dziala()).toBe(7);
    expect(zapisane.find((x) => x.job === 'TestoweZadania.dziala')).toMatchObject({ ok: true, error: null });
  });

  it('awaria zapisu do bazy nie psuje zadania', async () => {
    prisma.scheduledJobRun.create.mockRejectedValueOnce(new Error('baza leży'));
    expect(await app.get(TestoweZadania).dziala()).toBe(7);
  });

  it('ręczne uruchomienie: zadanie spoza białej listy — odmowa (także dla administratora)', async () => {
    const s = app.get(ZadaniaWTleService);
    await expect(s.uruchomRecznie('TestoweZadania.dziala', 'admin-1')).rejects.toThrow('Tego zadania nie uruchamia się ręcznie.');
    expect(audyt.filter((a) => a.action === 'ZADANIE_W_TLE_RECZNE')).toHaveLength(0);
  });

  it('ręczne uruchomienie zadania z białej listy: wpis w dzienniku, przebieg z manualBy', async () => {
    const s = app.get(ZadaniaWTleService);
    expect(await s.uruchomRecznie('ZadaniaWTleService.sprawdzZalegle', 'admin-1')).toEqual({ uruchomiono: true });
    expect(audyt).toContainEqual({ action: 'ZADANIE_W_TLE_RECZNE', actorUserId: 'admin-1', details: { zadanie: 'ZadaniaWTleService.sprawdzZalegle' } });
    await vi.waitFor(() =>
      expect(zapisane.find((x) => x.job === 'ZadaniaWTleService.sprawdzZalegle')).toMatchObject({ ok: true, manualBy: 'admin-1' }),
    );
  });

  it('przegląd: dwa równoczesne ręczne uruchomienia — biegnie jedno, drugie 409; po przebiegu można znowu', async () => {
    const s = app.get(ZadaniaWTleService);
    const K = 'ZadaniaWTleService.sprawdzZalegle';
    const ileWpisow = () => audyt.filter((a) => a.action === 'ZADANIE_W_TLE_RECZNE').length;
    const ilePrzebiegow = () => zapisane.filter((x) => x.job === K && x.manualBy === 'admin-2').length;
    const przed = ileWpisow();
    const wyniki = await Promise.allSettled([s.uruchomRecznie(K, 'admin-2'), s.uruchomRecznie(K, 'admin-2')]);
    expect(wyniki.map((w) => w.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(String((wyniki.find((w) => w.status === 'rejected') as PromiseRejectedResult).reason)).toContain('właśnie biegnie');
    expect(ileWpisow()).toBe(przed + 1);
    await vi.waitFor(() => expect(ilePrzebiegow()).toBe(1));
    // Rezerwacja zwolniona po przebiegu i po błędzie zapisu do dziennika — zadanie da się uruchomić ponownie.
    audytSvc.record.mockRejectedValueOnce(new Error('dziennik leży'));
    await expect(s.uruchomRecznie(K, 'admin-2')).rejects.toThrow('dziennik leży');
    expect(await s.uruchomRecznie(K, 'admin-2')).toEqual({ uruchomiono: true });
    await vi.waitFor(() => expect(ilePrzebiegow()).toBe(2));
    expect((await s.stan(true)).find((z) => z.klucz === K)?.trwaOd).toBeNull();
  });

  it('widok: ręczne uruchomienie widzi tylko administrator i tylko przy zadaniach z białej listy', async () => {
    const s = app.get(ZadaniaWTleService);
    const admin = await s.stan(true);
    const staff = await s.stan(false);
    expect(admin.find((z) => z.klucz === 'ZadaniaWTleService.sprawdzZalegle')?.mozeUruchomic).toBe(true);
    expect(admin.find((z) => z.klucz === 'TestoweZadania.boom')?.mozeUruchomic).toBe(false);
    expect(staff.every((z) => !z.mozeUruchomic)).toBe(true);
    expect(admin.find((z) => z.klucz === 'TestoweZadania.boom')).toMatchObject({ nazwa: 'test:boom', harmonogram: '0 0 1 1 *' });
  });
});

describe('biała lista ręcznego uruchomienia', () => {
  const KLASY: Record<string, object> = {
    NbpFxService,
    ProbeScheduler,
    OpsWatchdogScheduler,
    MailHealthScheduler,
    RblReputationScheduler,
    WpPodatnosciService,
    ZadaniaWTleService,
  };

  it('każdy wpis wskazuje istniejącą metodę @Cron (zmiana nazwy nie zostawi martwego wpisu)', () => {
    for (const klucz of RECZNE_URUCHOMIENIE) {
      const [klasa, metoda] = klucz.split('.') as [string, string];
      const proto = (KLASY[klasa] as { prototype: Record<string, unknown> } | undefined)?.prototype;
      expect(proto, klucz).toBeDefined();
      expect(Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', proto![metoda] as object), klucz).toBeDefined();
    }
  });

  it('bez windykacji, KSeF, faktur, portfela, odnowień i retencji', () => {
    const zakazane = /Ksef|Faktur|Renewal|Wallet|Sla|Autoscaling|Partner|Trial|Retention|Retencja|Deletion|Stripe|Ssl|Registrar|Vps/i;
    for (const klucz of RECZNE_URUCHOMIENIE) expect(klucz).not.toMatch(zakazane);
  });
});
