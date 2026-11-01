import type { DayDto, PublicIncidentDto, PublicServiceDto } from './api';
import { grupujZdarzenia, klasaDnia, opisGrupy, poczatekPomiarow, tytulGrupy } from './widok';

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

  it('bez żadnych pomiarów zostawia przynajmniej ostatni dzień', () => {
    expect(poczatekPomiarow([usluga('a', ['NO_DATA', 'NO_DATA', 'NO_DATA'])])).toBe(2);
    expect(poczatekPomiarow([])).toBe(0);
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
