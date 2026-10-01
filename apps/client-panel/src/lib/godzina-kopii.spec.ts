import { przesuniecieWarszawy, terminDoUtc, terminZUtc } from './godzina-kopii';

/**
 * CL-09 — harmonogram kopii pokazujemy w czasie polskim, a API liczy w UTC. Bez przeliczenia klient, który wybrał
 * „03:00”, dostawał kopię o 04:00 zimą i o 05:00 latem; o północy dodatkowo zmienia się dzień tygodnia.
 */
const ZIMA = new Date('2026-01-15T12:00:00Z');
const LATO = new Date('2026-07-15T12:00:00Z');

describe('harmonogram kopii — czas polski ↔ UTC', () => {
  it('zimą +1 h, latem +2 h, także tuż przed i po zmianie czasu', () => {
    expect(przesuniecieWarszawy(ZIMA)).toBe(1);
    expect(przesuniecieWarszawy(LATO)).toBe(2);
    // 29.03.2026 o 01:00 UTC zegary idą do przodu, 25.10.2026 o 01:00 UTC — do tyłu.
    expect(przesuniecieWarszawy(new Date('2026-03-29T00:59:00Z'))).toBe(1);
    expect(przesuniecieWarszawy(new Date('2026-03-29T01:00:00Z'))).toBe(2);
    expect(przesuniecieWarszawy(new Date('2026-10-25T00:59:00Z'))).toBe(2);
    expect(przesuniecieWarszawy(new Date('2026-10-25T01:00:00Z'))).toBe(1);
  });

  it('03:00 w poniedziałek zapisujemy jako 02:00 zimą i 01:00 latem', () => {
    expect(terminDoUtc({ hour: 3, dayOfWeek: 1 }, ZIMA)).toEqual({ hour: 2, dayOfWeek: 1 });
    expect(terminDoUtc({ hour: 3, dayOfWeek: 1 }, LATO)).toEqual({ hour: 1, dayOfWeek: 1 });
  });

  it('po północy w Polsce w UTC jest jeszcze poprzedni dzień — także niedziela → sobota', () => {
    expect(terminDoUtc({ hour: 1, dayOfWeek: 1 }, LATO)).toEqual({ hour: 23, dayOfWeek: 0 });
    expect(terminDoUtc({ hour: 0, dayOfWeek: 0 }, ZIMA)).toEqual({ hour: 23, dayOfWeek: 6 });
    expect(terminZUtc({ hour: 23, dayOfWeek: 6 }, ZIMA)).toEqual({ hour: 0, dayOfWeek: 0 });
  });

  it('zapis i odczyt w tej samej chwili dają to, co klient wybrał', () => {
    for (const chwila of [ZIMA, LATO]) {
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        for (let hour = 0; hour < 24; hour++) {
          expect(terminZUtc(terminDoUtc({ hour, dayOfWeek }, chwila), chwila)).toEqual({ hour, dayOfWeek });
        }
      }
    }
  });
});
