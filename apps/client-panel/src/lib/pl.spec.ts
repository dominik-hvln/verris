import { days, plForm, plural, services } from './pl';

/**
 * X-05 — odmiana liczebników w panelu klienta.
 *
 * CO PILNUJE. `plForm` decyduje o każdym „3 dni / 5 domen / 22 usługi" na
 * ekranie. Pułapką polszczyzny są nastki (12–14 → „many", nie „few") i liczby
 * typu 22/102, które znów biorą formę „few". Błąd w tej funkcji nie wysypie
 * niczego — po prostu każdy klient zobaczy „12 domeny", więc łapiemy go tutaj.
 */

describe('X-05 plForm — polska odmiana', () => {
  const f = (n: number) => plForm(n, 'one', 'few', 'many');

  it('1 → forma pojedyncza, 0 → mnoga', () => {
    expect(f(1)).toBe('one');
    expect(f(0)).toBe('many');
  });

  it('końcówka 2–4 → few, ale nastki 12–14 → many', () => {
    for (const n of [2, 3, 4, 22, 23, 24, 102, 1004]) expect(f(n)).toBe('few');
    for (const n of [12, 13, 14, 112, 113, 114]) expect(f(n)).toBe('many');
  });

  it('5–21 oraz 11, 21, 101 → many (tylko samo 1 jest pojedyncze)', () => {
    for (const n of [5, 11, 15, 20, 21, 25, 101]) expect(f(n)).toBe('many');
  });

  it('liczby ujemne odmieniają się jak dodatnie', () => {
    expect(f(-1)).toBe('one');
    expect(f(-3)).toBe('few');
  });

  it('plural i skróty sklejają liczbę z formą', () => {
    expect(plural(2, 'plik', 'pliki', 'plików')).toBe('2 pliki');
    expect(days(1)).toBe('1 dzień');
    expect(days(14)).toBe('14 dni');
    expect(services(12)).toBe('12 usług');
    expect(services(22)).toBe('22 usługi');
  });
});
