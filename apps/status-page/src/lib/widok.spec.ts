import type { DayDto, PublicIncidentDto, PublicMaintenanceDto, PublicServiceDto } from './api';
import { dataPelna, dzienKrotko } from './format';
import {
  grupujZdarzenia,
  klasaDnia,
  nastepnyIndeks,
  opisGrupy,
  pierwszyPomiar,
  poczatekPomiarow,
  trescDymka,
  tytulGrupy,
  zdarzeniaDni,
} from './widok';

const dzien = (state: DayDto['state'], uptimePct: number | null = null): DayDto => ({
  date: '2026-10-14',
  state,
  uptimePct,
  avgLatencyMs: null,
});

const usluga = (key: string, stany: DayDto['state'][]): PublicServiceDto => ({
  key,
  name: key,
  state: 'OK',
  uptime90Pct: null,
  avgLatencyMs: null,
  days: stany.map((s) => dzien(s)),
  latency24h: [],
});

let nr = 0;
const zdarzenie = (
  service: string,
  severity: 'MINOR' | 'MAJOR',
  startedAt: string,
  resolvedAt: string | null,
  publicMessage: string | null = null,
): PublicIncidentDto => ({
  id: `z${++nr}`,
  service,
  severity,
  status: resolvedAt ? 'RESOLVED' : 'OPEN',
  title: 'x',
  publicMessage,
  startedAt,
  resolvedAt,
  durationMinutes: null,
});

describe('klasaDnia', () => {
  it('dzień DOWN z dostępnością ≥ 99,65% to krótkie zakłócenie, nie awaria', () => {
    expect(klasaDnia(dzien('DOWN', 99.73))).toBe('krotkie');
    expect(klasaDnia(dzien('DEGRADED', 99.65))).toBe('krotkie');
  });

  it('poniżej progu zostaje awaria albo spowolnienie', () => {
    expect(klasaDnia(dzien('DOWN', 72.3))).toBe('awaria');
    expect(klasaDnia(dzien('DEGRADED', 99.5))).toBe('spowolnienie');
    expect(klasaDnia(dzien('DOWN', null))).toBe('awaria');
  });

  it('OK, prace i brak pomiarów mają własne klasy', () => {
    expect(klasaDnia(dzien('OK', 100))).toBe('ok');
    expect(klasaDnia(dzien('MAINTENANCE'))).toBe('prace');
    expect(klasaDnia(dzien('NO_DATA'))).toBe('brak');
  });
});

describe('poczatekPomiarow', () => {
  it('zwraca pierwszy dzień, w którym którakolwiek usługa ma pomiar', () => {
    const uslugi = [usluga('a', ['NO_DATA', 'NO_DATA', 'NO_DATA', 'OK']), usluga('b', ['NO_DATA', 'NO_DATA', 'DOWN', 'OK'])];
    expect(poczatekPomiarow(uslugi)).toBe(2);
  });

  it('pełne 90 dni pomiarów → 0', () => {
    expect(poczatekPomiarow([usluga('a', ['OK', 'OK'])])).toBe(0);
  });

  it('bez żadnych pomiarów wszystkie dni są sprzed uruchomienia sond (nie udaje, że ostatni dzień był mierzony)', () => {
    expect(poczatekPomiarow([usluga('a', ['NO_DATA', 'NO_DATA', 'NO_DATA'])])).toBe(3);
    expect(poczatekPomiarow([])).toBe(0);
  });
});

describe('pierwszyPomiar', () => {
  it('liczy się osobno dla usługi — sonda dodana później ma własny początek', () => {
    expect(pierwszyPomiar(usluga('a', ['NO_DATA', 'OK', 'NO_DATA', 'OK']).days)).toBe(1);
    expect(pierwszyPomiar(usluga('a', ['NO_DATA', 'NO_DATA']).days)).toBe(2);
  });
});

describe('daty bez Intl', () => {
  it('pełna data z dniem tygodnia i krótka data jak dotąd', () => {
    expect(dataPelna('2026-10-14')).toBe('środa, 14 października 2026');
    expect(dataPelna('2026-03-01')).toBe('niedziela, 1 marca 2026');
    expect(dzienKrotko('2026-10-07')).toBe('7 paź');
    expect(dzienKrotko('2026-05-31')).toBe('31 maj');
  });
});

describe('trescDymka', () => {
  it('dzień z awarią: stan, dostępność i czas odpowiedzi', () => {
    const t = trescDymka({ date: '2026-10-14', state: 'DOWN', uptimePct: 72.3, avgLatencyMs: 412 }, false);
    expect(t).toEqual({
      data: 'środa, 14 października 2026',
      klasa: 'awaria',
      stan: 'awaria',
      szczegoly: ['Dostępność 72,30%', 'Śr. czas odpowiedzi 412 ms'],
    });
  });

  it('dzień sprzed pomiarów różni się od dnia bez pomiarów w trakcie działania sond', () => {
    const d: DayDto = { date: '2026-09-01', state: 'NO_DATA', uptimePct: null, avgLatencyMs: null };
    expect(trescDymka(d, true)).toMatchObject({ klasa: 'przed', stan: 'przed uruchomieniem pomiarów' });
    expect(trescDymka(d, false)).toMatchObject({ klasa: 'brak', stan: 'brak pomiarów' });
  });
});

describe('nastepnyIndeks', () => {
  it('strzałki w granicach paska, Home do pierwszego widocznego dnia, End do dziś', () => {
    expect(nastepnyIndeks('ArrowLeft', 5, 90)).toBe(4);
    expect(nastepnyIndeks('ArrowLeft', 0, 90)).toBe(0);
    expect(nastepnyIndeks('ArrowRight', 89, 90)).toBe(89);
    expect(nastepnyIndeks('Home', 70, 90, 60)).toBe(60);
    expect(nastepnyIndeks('ArrowLeft', 60, 90, 60)).toBe(60);
    expect(nastepnyIndeks('End', 3, 90)).toBe(89);
    expect(nastepnyIndeks('Enter', 3, 90)).toBeNull();
  });
});

describe('zdarzeniaDni', () => {
  const teraz = '2026-11-06T12:00:00Z';
  const prace = (title: string, scheduledStart: string, scheduledEnd: string): PublicMaintenanceDto => ({
    id: title,
    title,
    publicMessage: null,
    status: 'IN_PROGRESS',
    scheduledStart,
    scheduledEnd,
  });

  it('incydenty usługi trafiają do dni (czas polski), z rodzajem, godzinami i czasem trwania', () => {
    const dni = zdarzeniaDni(
      'Poczta',
      [
        zdarzenie('Poczta', 'MAJOR', '2026-10-13T08:00:00Z', '2026-10-13T14:39:00Z'),
        zdarzenie('Poczta', 'MINOR', '2026-10-20T03:00:00Z', '2026-10-20T03:02:00Z'),
        zdarzenie('Strony', 'MAJOR', '2026-10-13T08:00:00Z', '2026-10-13T09:00:00Z'),
      ],
      [],
      teraz,
    );
    expect(dni).toEqual({
      '2026-10-13': ['Awaria · 10:00–16:39 · 6 h 39 min'],
      '2026-10-20': ['Krótkie zakłócenie · 05:00–05:02 · 2 min'],
    });
  });

  it('zdarzenie przez północ jest w obu dniach; trwające ma „trwa”; prace tylko gdy już się zaczęły', () => {
    const dni = zdarzeniaDni(
      'DNS',
      [
        zdarzenie('DNS', 'MINOR', '2026-11-01T21:30:00Z', '2026-11-01T23:30:00Z'),
        zdarzenie('DNS', 'MAJOR', '2026-11-06T10:15:00Z', null),
      ],
      [prace('Wymiana dysków', '2026-11-06T07:00:00Z', '2026-11-06T09:00:00Z'), prace('Później', '2026-11-08T07:00:00Z', '2026-11-08T09:00:00Z')],
      teraz,
    );
    expect(dni['2026-11-01']).toEqual(['Spowolnienie · 1 lis 22:30 – 2 lis 00:30 · 2 h']);
    expect(dni['2026-11-02']).toEqual(dni['2026-11-01']);
    expect(dni['2026-11-06']).toEqual(['Planowane prace: Wymiana dysków · 08:00–10:00', 'Awaria · od 11:15, trwa']);
    expect(Object.keys(dni)).toHaveLength(3);
  });

  it('ponad 4 zdarzenia w dniu: trzy i „+ N kolejne”', () => {
    const lista = Array.from({ length: 6 }, (_, i) =>
      zdarzenie('API', 'MINOR', `2026-11-03T1${i}:00:00Z`, `2026-11-03T1${i}:20:00Z`),
    );
    const dzien = zdarzeniaDni('API', lista, [], teraz)['2026-11-03'];
    expect(dzien).toHaveLength(4);
    expect(dzien[3]).toBe('+ 3 kolejne zdarzenia');
  });
});

describe('grupujZdarzenia', () => {
  // Restart węzła 14.10: pięć usług w ciągu dwóch minut, każda wróciła po 1–3 minutach.
  const restart = [
    zdarzenie('Strony', 'MAJOR', '2026-10-14T09:53:10Z', '2026-10-14T09:55:40Z'),
    zdarzenie('Poczta', 'MAJOR', '2026-10-14T09:53:40Z', '2026-10-14T09:55:10Z'),
    zdarzenie('Bazy danych', 'MAJOR', '2026-10-14T09:54:00Z', '2026-10-14T09:56:00Z'),
    zdarzenie('Panel', 'MINOR', '2026-10-14T09:54:30Z', '2026-10-14T09:55:30Z'),
    zdarzenie('Strony', 'MINOR', '2026-10-14T09:55:00Z', '2026-10-14T09:55:50Z'),
  ];
  // 13.10: awaria trwająca 6 h 39 min.
  const dluga = zdarzenie('Poczta', 'MAJOR', '2026-10-13T08:00:00Z', '2026-10-13T14:39:00Z', 'Awaria dysku na serwerze poczty.');

  it('zdarzenia z jednego okna 5 minut łączy w jedno, najnowsze pierwsze', () => {
    const grupy = grupujZdarzenia([dluga, ...restart]);
    expect(grupy).toHaveLength(2);
    expect(grupy[0].start).toBe('2026-10-14T09:53:10Z');
    expect(grupy[1].start).toBe('2026-10-13T08:00:00Z');
  });

  it('w grupie dzieli usługi na niedostępne (MAJOR) i wolniejsze (MINOR), bez powtórzeń', () => {
    const [g] = grupujZdarzenia(restart);
    expect(g.niedostepne).toEqual(['Strony', 'Poczta', 'Bazy danych']);
    expect(g.wolniejsze).toEqual(['Panel']);
    expect(g.koniec).toBe('2026-10-14T09:56:00Z');
    expect(g.minuty).toBe(3);
    expect(g.rodzaj).toBe('krotkie');
    expect(g.trwa).toBe(false);
  });

  it('długie zdarzenie MAJOR to awaria z czasem trwania i komunikatem', () => {
    const [g] = grupujZdarzenia([dluga]);
    expect(g.rodzaj).toBe('awaria');
    expect(g.minuty).toBe(399);
    expect(g.komunikaty).toEqual(['Awaria dysku na serwerze poczty.']);
  });

  it('zdarzenie poza oknem zaczyna nową grupę', () => {
    const grupy = grupujZdarzenia([
      zdarzenie('Panel', 'MINOR', '2026-10-14T10:00:00Z', '2026-10-14T10:20:00Z'),
      zdarzenie('API', 'MINOR', '2026-10-14T10:05:01Z', '2026-10-14T10:20:00Z'),
    ]);
    expect(grupy).toHaveLength(2);
    expect(grupy.every((g) => g.rodzaj === 'spowolnienie')).toBe(true);
  });

  it('otwarte zdarzenie trwa, nie ma końca ani czasu i nie jest krótkie', () => {
    const [g] = grupujZdarzenia([zdarzenie('Strony', 'MAJOR', '2026-11-01T10:00:00Z', null)]);
    expect(g).toMatchObject({ trwa: true, koniec: null, minuty: null, rodzaj: 'awaria' });
  });
});

describe('tytulGrupy i opisGrupy', () => {
  it('krótkie zakłócenie w kilku usługach: tytuł z liczbą, opis z podziałem', () => {
    const [g] = grupujZdarzenia([
      zdarzenie('Strony', 'MAJOR', '2026-10-14T09:53:00Z', '2026-10-14T09:55:00Z'),
      zdarzenie('Poczta', 'MAJOR', '2026-10-14T09:53:30Z', '2026-10-14T09:55:00Z'),
      zdarzenie('Panel', 'MINOR', '2026-10-14T09:54:00Z', '2026-10-14T09:55:00Z'),
    ]);
    expect(tytulGrupy(g)).toBe('Krótkie zakłócenie w 3 usługach');
    expect(opisGrupy(g)).toBe('Niedostępne: Strony, Poczta. Wolniej: Panel.');
  });

  it('jedna usługa: nazwa w tytule, bez opisu', () => {
    const [g] = grupujZdarzenia([zdarzenie('Poczta', 'MAJOR', '2026-10-13T08:00:00Z', '2026-10-13T14:39:00Z')]);
    expect(tytulGrupy(g)).toBe('Awaria: Poczta');
    expect(opisGrupy(g)).toBeNull();
  });

  it('trwające zdarzenia mają tytuł „Trwa …”', () => {
    const [a] = grupujZdarzenia([zdarzenie('Strony', 'MAJOR', '2026-11-01T10:00:00Z', null)]);
    const [s] = grupujZdarzenia([zdarzenie('API', 'MINOR', '2026-11-01T10:00:00Z', null)]);
    expect(tytulGrupy(a)).toBe('Trwa awaria: Strony');
    expect(tytulGrupy(s)).toBe('Trwa spowolnienie: API');
  });

  it('krótkie zakłócenie jednej usługi', () => {
    const [g] = grupujZdarzenia([zdarzenie('DNS', 'MINOR', '2026-10-20T03:00:00Z', '2026-10-20T03:02:00Z')]);
    expect(tytulGrupy(g)).toBe('Krótkie zakłócenie: DNS');
  });
});
