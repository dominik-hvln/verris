import { opisDnia, parsujDostepnosc } from './dostepnosc';

const dzien = (date: string, state: string, uptimePct: number | null) => ({ date, state, uptimePct, avgLatencyMs: null });

describe('pasek dostępności z GET /status', () => {
  const dane = {
    availability: { h24: 100, d7: 99.99, d30: 99.73, d90: 99.73 },
    services: [
      { days: [dzien('2026-10-06', 'NO_DATA', null), dzien('2026-10-07', 'OK', 100), dzien('2026-10-13', 'DOWN', 72.22), dzien('2026-10-14', 'OK', 100)] },
      { days: [dzien('2026-10-06', 'NO_DATA', null), dzien('2026-10-07', 'OK', 100), dzien('2026-10-13', 'OK', 99.9), dzien('2026-10-14', 'DEGRADED', 99.86)] },
    ],
  };

  it('pomija dni bez pomiarów, łączy usługi (najgorszy stan, najniższa dostępność)', () => {
    const d = parsujDostepnosc(dane)!;
    expect(d.dni.map((x) => [x.data, x.klasa, x.dostepnosc])).toEqual([
      ['2026-10-07', 'ok', 100],
      ['2026-10-13', 'awaria', 72.22],
      ['2026-10-14', 'krotkie', 99.86],
    ]);
    expect(d.d30).toBe(99.73);
    expect(d.h24).toBe(100);
  });

  it('opis dnia po polsku', () => {
    expect(opisDnia({ data: '2026-10-13', klasa: 'awaria', dostepnosc: 72.22 })).toBe('13 paź: awaria · dostępność 72,22%');
  });

  it('nieczytelna odpowiedź → null (pasek się nie pokazuje)', () => {
    expect(parsujDostepnosc(null)).toBeNull();
    expect(parsujDostepnosc({ services: [] })).toBeNull();
    expect(parsujDostepnosc({ services: [{ days: [dzien('2026-10-06', 'NO_DATA', null)] }] })).toBeNull();
  });
});
