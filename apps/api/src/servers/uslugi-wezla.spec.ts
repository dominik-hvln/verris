import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { NodeTaskStatus } from '@verris/database';
import { UslugiWezlaService } from './uslugi-wezla.admin.controller.js';
import { logZWyniku, stanUslug, uslugiZLogu, type ZadanieUslug } from './uslugi-wezla.js';

/** F3.4 — usługi i logi węzła: odczyt wyniku skryptu, maska logów poczty dla STAFF, zasady restartu (D2) i kolejka. */

const wynikStatusu = [
  'VERRIS_SVC www|lsws.service|loaded|active|running|2026-10-11T06:00:00Z|0',
  'VERRIS_SVC exim|exim.service|loaded|failed|failed|-|3',
  'VERRIS_SVC dovecot|dovecot.service|loaded|inactive|dead|-|0',
  'VERRIS_SVC named|-|not-found|-|-|-|-',
  'VERRIS_SVC mariadb|evil.service|loaded|active|running|-|0',
  'VERRIS_SVC obca|obca.service|loaded|active|running|-|0',
  '[services] Gotowe.',
].join('\n');

const zad = (o: Partial<ZadanieUslug> & { payload: unknown }): ZadanieUslug => ({
  id: Math.random().toString(36).slice(2),
  status: NodeTaskStatus.COMPLETED,
  outputLog: null,
  errorMessage: null,
  createdAt: new Date('2026-10-11T08:00:00Z'),
  completedAt: new Date('2026-10-11T08:00:05Z'),
  ...o,
});

describe('audyt Fali 3 — log usługi wyczyszczony retencją', () => {
  it('ukończony log bez wyniku (30 dni) to „nie wczytano”, nie pusty log', () => {
    expect(stanUslug([zad({ payload: { mode: 'log', name: 'exim-main', lines: '200' }, outputLog: null })], true).log).toBeNull();
  });
});

describe('F3.4 — wynik zadania NODE_SERVICES', () => {
  it('stan usług w kolejności białej listy; jednostka spoza listy usługi i usługa spoza listy — odrzucone', () => {
    const u = uslugiZLogu(wynikStatusu);
    expect(u.map((x) => [x.klucz, x.stan])).toEqual([
      ['www', 'dziala'],
      ['exim', 'blad'],
      ['dovecot', 'stoi'],
      ['mariadb', 'brak'],
      ['named', 'brak'],
    ]);
    expect(u[0]).toMatchObject({ jednostka: 'lsws.service', od: '2026-10-11T06:00:00Z', restarty: 0, przerwa: true });
    expect(u[1].restarty).toBe(3);
    expect(u.find((x) => x.klucz === 'mariadb')!.jednostka).toBeNull();
  });

  it('log poczty: STAFF zawsze z maską (także wynik zamówiony przez ADMIN-a bez maski); sekrety maskowane zawsze', () => {
    const log = 'VERRIS_LOG_ZRODLO exim-main|/var/log/exim/mainlog|2|2|0\nVERRIS_LOG <= jan@firma.pl password=x1\nVERRIS_LOG => ola@example.com';
    expect(logZWyniku(log, true).linie).toEqual(['<= •••@firma.pl password=•••', '=> •••@example.com']);
    expect(logZWyniku(log, true).maska).toBe(true);
    expect(logZWyniku(log, false).linie).toEqual(['<= jan@firma.pl password=•••', '=> ola@example.com']);
    const zadania = [zad({ payload: { mode: 'log', name: 'exim-main', mask: '0', lines: '200' }, outputLog: log })];
    expect(stanUslug(zadania, false).log!.linie[0]).toBe('<= •••@firma.pl password=•••');
    expect(stanUslug(zadania, true).log!.linie[0]).toBe('<= jan@firma.pl password=•••');
  });

  it('przegląd: log agenta (wynik starszego skryptu) — API pokazuje tylko wiersze agenta, także ADMIN-owi', () => {
    const log = [
      'VERRIS_LOG_ZRODLO agent|/var/log/verris-tasks.log|3|3|0',
      'VERRIS_LOG [verris-tasks] Dispatching MAIL_LOG task t1',
      'VERRIS_LOG VERRIS_ML 2026-10-11 07:59|1abc|<=|jan@firma.pl|H=mx',
      'VERRIS_LOG   [verris-task-run] Starting task t2',
    ].join('\n');
    const zadania = [zad({ payload: { mode: 'log', name: 'agent', lines: '200' }, outputLog: log })];
    for (const admin of [false, true]) {
      expect(stanUslug(zadania, admin).log!.linie).toEqual(['[verris-tasks] Dispatching MAIL_LOG task t1', '  [verris-task-run] Starting task t2']);
    }
  });

  it('przegląd: filtr ADMIN-a z adresem albo IP — STAFF widzi go zamaskowanego (każdy log, decyzja 14.10), ADMIN w całości', () => {
    const log = 'VERRIS_LOG_ZRODLO exim-main|/var/log/exim/mainlog|1|1|0\nVERRIS_LOG <= jan@firma.pl';
    const zadania = [zad({ payload: { mode: 'log', name: 'exim-main', mask: '0', lines: '200', filter: 'jan@firma.pl' }, outputLog: log })];
    expect(stanUslug(zadania, false).log!.filtr).toBe('•••@firma.pl');
    expect(stanUslug(zadania, true).log!.filtr).toBe('jan@firma.pl');
    const www = [zad({ payload: { mode: 'log', name: 'ssh', mask: '0', filter: '203.0.113.7' }, outputLog: 'VERRIS_LOG_ZRODLO ssh|/x|0|0|0' })];
    expect(stanUslug(www, false).log!.filtr).toBe('203.0.113.•••');
    expect(stanUslug(www, true).log!.filtr).toBe('203.0.113.7');
  });

  it('decyzja 14.10: STAFF ma zamaskowane adresy e-mail i IP w KAŻDYM logu, także zamówionym przez ADMIN-a bez maski', () => {
    const log = 'VERRIS_LOG_ZRODLO ssh|/var/log/secure|1|1|0\nVERRIS_LOG Accepted password for root from 203.0.113.7 port 22 (wp@domena.pl)';
    const z = [zad({ payload: { mode: 'log', name: 'ssh', mask: '0' }, outputLog: log })];
    expect(stanUslug(z, false).log!.linie).toEqual(['Accepted password for root from 203.0.113.••• port 22 (•••@domena.pl)']);
    expect(stanUslug(z, false).log!.maska).toBe(true);
    expect(stanUslug(z, true).log!.linie).toEqual(['Accepted password for root from 203.0.113.7 port 22 (wp@domena.pl)']);
  });

  it('filtry domeny, użytkownika i czasu: zakres okna i zastosowane filtry z węzła; brak raportu = agent sprzed 14.10', () => {
    const log = [
      'VERRIS_LOG x',
      'VERRIS_LOG_ZAKRES 1791936000|1791939600',
      'VERRIS_LOG_FILTRY domena,uzytkownik,czas',
      'VERRIS_LOG_ZRODLO www-domena|/var/log/httpd/domains/firma.pl.log|1|1|1',
    ].join('\n');
    const p = { mode: 'log', name: 'www-domena', domain: 'firma.pl', user: 'klient1', since: '1791936000', until: '1791939600' };
    const s = stanUslug([zad({ payload: p, outputLog: log })], true).log!;
    expect(s).toMatchObject({
      domena: 'firma.pl',
      uzytkownik: 'klient1',
      od: '2026-10-14T00:00:00.000Z',
      do: '2026-10-14T01:00:00.000Z',
      zakres: { od: '2026-10-14T00:00:00.000Z', do: '2026-10-14T01:00:00.000Z' },
      zastosowane: ['domena', 'uzytkownik', 'czas'],
    });
    const stary = stanUslug([zad({ payload: p, outputLog: 'VERRIS_LOG_ZRODLO www|/x|1|1|1\nVERRIS_LOG x' })], true).log!;
    expect(stary.zastosowane).toBeNull();
  });

  it('stan: ostatni udany odczyt usług, ostatni restart z błędem skryptu, „w toku” per tryb', () => {
    const zadania = [
      zad({ payload: { mode: 'restart', name: 'exim' }, status: NodeTaskStatus.FAILED, outputLog: '[services] BŁĄD: usługa nie działa po restarcie (stan: failed/failed) — sprawdź jej log' }),
      zad({ payload: { mode: 'status' }, status: NodeTaskStatus.QUEUED }),
      zad({ payload: { mode: 'status' }, outputLog: wynikStatusu }),
    ];
    const s = stanUslug(zadania, false);
    expect(s.wToku).toEqual({ status: true, restart: false, log: false });
    expect(s.uslugi!.lista).toHaveLength(5);
    expect(s.restart).toMatchObject({ usluga: 'exim', etykieta: 'Poczta SMTP (Exim)', blad: 'usługa nie działa po restarcie (stan: failed/failed) — sprawdź jej log' });
  });
});

function srodowisko(o: { status?: string; zadania?: Array<{ status: NodeTaskStatus; payload: unknown }> } = {}) {
  const utworzone: Array<{ payload: Record<string, string> }> = [];
  const audyt: Array<{ action: string; details: Record<string, unknown> }> = [];
  const prisma = {
    server: { findUnique: async () => ({ id: 'w1', name: 'fra-01', hostname: null, ipAddress: '203.0.113.1', status: o.status ?? 'ACTIVE', uslugiStan: null, uslugiStanAt: null }) },
    nodeTask: {
      findMany: async () => (o.zadania ?? []).map((z) => zad(z)),
      create: async ({ data }: { data: { payload: Record<string, string> } }) => {
        utworzone.push(data);
        return { id: `t${utworzone.length}`, ...data };
      },
    },
  };
  const svc = new UslugiWezlaService(prisma as never, { record: async (a: never) => void audyt.push(a) } as never);
  return { svc, utworzone, audyt };
}

const NOC = { userId: 'noc', role: 'STAFF' };
const ADM = { userId: 'adm', role: 'ADMIN' };

describe('F3.4 — UslugiWezlaService', () => {
  it('NOC: usługa wspólna — tylko „uruchom, gdy stoi” (onlyDown=1); pomocnicza — zwykły restart', async () => {
    const s = srodowisko();
    await s.svc.restart('w1', NOC, 'mariadb', 'baza nie odpowiada od 5 min');
    expect(s.utworzone[0].payload).toEqual({ mode: 'restart', name: 'mariadb', onlyDown: '1' });
    const t = srodowisko();
    await t.svc.restart('w1', NOC, 'fail2ban', 'fail2ban zawiesił się');
    expect(t.utworzone[0].payload).toEqual({ mode: 'restart', name: 'fail2ban' });
    expect(t.audyt[0]).toMatchObject({ action: 'NODE_SERVICE_RESTART_QUEUED', details: { usluga: 'fail2ban', powod: 'fail2ban zawiesił się', tylkoGdyStoi: false } });
  });

  it('restart: bez powodu, usługa tylko do podglądu, węzeł nieaktywny — odmowa bez zadania', async () => {
    const s = srodowisko();
    await expect(s.svc.restart('w1', NOC, 'exim', 'krótko')).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.svc.restart('w1', NOC, 'sshd', 'restart ssh na prośbę')).rejects.toThrow(/nie restartuje się/);
    await expect(srodowisko({ status: 'OFFLINE' }).svc.restart('w1', NOC, 'fail2ban', 'fail2ban zawiesił się')).rejects.toThrow(/nie jest aktywny/);
    expect(s.utworzone).toEqual([]);
  });

  it('ADMIN: restart działającej usługi wspólnej tylko z nazwą węzła jako potwierdzeniem; usługi pomocniczej tą drogą nie', async () => {
    const s = srodowisko();
    await expect(s.svc.restartWspolnejZPotwierdzeniem('w1', ADM, 'exim', 'kolejka stoi od godziny', 'tak')).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.utworzone).toEqual([]);
    await s.svc.restartWspolnejZPotwierdzeniem('w1', ADM, 'exim', 'kolejka stoi od godziny', 'fra-01');
    expect(s.utworzone[0].payload).toEqual({ mode: 'restart', name: 'exim' });
    await expect(srodowisko().svc.restartWspolnej('w1', ADM, 'fail2ban', 'restart pomocniczej')).rejects.toThrow(/nie jest usługa wspólna/);
  });

  it('jedna operacja danego trybu naraz: trwający restart blokuje kolejny (409), nie blokuje odczytu logu', async () => {
    const s = srodowisko({ zadania: [{ status: NodeTaskStatus.RUNNING, payload: { mode: 'restart', name: 'exim' } }] });
    await expect(s.svc.restartWspolnej('w1', ADM, 'mariadb', 'baza nie odpowiada')).rejects.toBeInstanceOf(ConflictException);
    await s.svc.log('w1', NOC, 'www', 100, 'error');
    expect(s.utworzone).toHaveLength(1);
  });

  it('log: maska ustawiana z roli (STAFF 1, ADMIN 0), nie z formularza; filtr bez znaków sterujących; wpis w dzienniku', async () => {
    const s = srodowisko();
    await s.svc.log('w1', NOC, 'exim-main', undefined, ' jan ');
    expect(s.utworzone[0].payload).toEqual({ mode: 'log', name: 'exim-main', lines: '200', filter: 'jan', mask: '1' });
    expect(s.audyt[0]).toMatchObject({ action: 'NODE_LOG_VIEWED', details: { log: 'exim-main', filtr: 'jan', maska: true } });
    const a = srodowisko();
    await a.svc.log('w1', ADM, 'exim-main', 50, undefined);
    expect(a.utworzone[0].payload).toEqual({ mode: 'log', name: 'exim-main', lines: '50', mask: '0' });
    await expect(srodowisko().svc.log('w1', NOC, 'www', 100, 'a\nb')).rejects.toBeInstanceOf(BadRequestException);
    await expect(srodowisko().svc.log('w1', NOC, '/etc/shadow', 100, undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('14.10 — filtry domeny, użytkownika i czasu trafiają do zadania (czas w sekundach epoki); dziennik bez pełnych adresów', async () => {
    const s = srodowisko();
    await s.svc.log('w1', ADM, 'www-domena', 100, '203.0.113.7', {
      domena: ' Firma.PL. ',
      uzytkownik: 'klient1',
      od: '2026-10-14T00:00:00.000Z',
      do: '2026-10-14T01:00:00.000Z',
    });
    expect(s.utworzone[0].payload).toEqual({
      mode: 'log',
      name: 'www-domena',
      lines: '100',
      filter: '203.0.113.7',
      domain: 'firma.pl',
      user: 'klient1',
      since: '1791936000',
      until: '1791939600',
      mask: '0',
    });
    expect(s.audyt[0]).toMatchObject({
      details: { domena: 'firma.pl', uzytkownik: 'klient1', od: '2026-10-14T00:00:00.000Z', filtr: '203.0.113.•••', maska: false },
    });
  });

  it.each([
    ['ssh', { uzytkownik: '203.0.113.7' }, /nie może być adresem IP/],
    ['www-domena', { domena: '203.0.113.7' }, /Domena/],
    ['www-domena', {}, /podaj domenę/],
    ['www-domena', { domena: 'https://firma.pl/x' }, /Domena/],
    ['ssh', { uzytkownik: 'jan kowalski' }, /Użytkownik/],
    ['ssh', { uzytkownik: 'jan@firma.pl' }, /Użytkownik/],
    ['ssh', { od: '2026-10-14T02:00:00Z', do: '2026-10-14T01:00:00Z' }, /„od” jest po „do”/],
  ])('log %s z filtrami %j — odmowa przed zleceniem', async (log, filtry, blad) => {
    const s = srodowisko();
    await expect(s.svc.log('w1', NOC, log, 100, undefined, filtry)).rejects.toThrow(blad);
    expect(s.utworzone).toEqual([]);
  });
});

describe('F3.4 — ponowienie z listy zadań węzła', () => {
  it('zadania NODE_SERVICES nie ponawiają się z listy (ominęłoby powód, potwierdzenie i wniosek); inne — jak dotąd', async () => {
    const { NodeTasksService } = await import('./node-tasks.service.js');
    const { NodeTaskKind } = await import('@verris/database');
    const zmiany: unknown[] = [];
    const svc = (kind: string) =>
      new NodeTasksService(
        {
          nodeTask: {
            findUnique: async () => ({ id: 't1', kind, status: NodeTaskStatus.FAILED, serverId: 'w1' }),
            update: async (a: unknown) => void zmiany.push(a),
          },
        } as never,
        { record: async () => undefined } as never,
        {} as never,
      );
    await expect(svc(NodeTaskKind.NODE_SERVICES).retryFailedTask('t1', 'noc')).rejects.toThrow(/nie ponawia się z listy/);
    expect(zmiany).toEqual([]);
    await expect(svc(NodeTaskKind.MAIL_LOG).retryFailedTask('t1', 'noc')).resolves.toEqual({ ok: true });
  });
});
