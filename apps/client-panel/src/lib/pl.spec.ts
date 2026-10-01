import {
  backupForm,
  days,
  entries,
  mailboxForm,
  plForm,
  plural,
  recoveryCodesLeft,
  services,
  variants,
  years,
} from './pl';

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

describe('CL-09 odmiana w miejscach z przeglądu 30.09', () => {
  it('wpisy logu, warianty, lata — trzy formy zamiast dwóch', () => {
    expect(entries(1)).toBe('1 wpis');
    expect(entries(3)).toBe('3 wpisy');
    expect(entries(25)).toBe('25 wpisów');
    expect(variants(1)).toBe('1 wariant');
    expect(variants(2)).toBe('2 warianty');
    expect(variants(6)).toBe('6 wariantów');
    expect(years(1)).toBe('1 rok');
    expect(years(2)).toBe('2 lata');
    expect(years(5)).toBe('5 lat');
  });

  it('kopie i skrzynki jako jednostka pod liczbą', () => {
    expect(backupForm(1)).toBe('kopia');
    expect(backupForm(3)).toBe('kopie');
    expect(backupForm(7)).toBe('kopii');
    expect(mailboxForm(1)).toBe('skrzynka');
    expect(mailboxForm(4)).toBe('skrzynki');
    expect(mailboxForm(12)).toBe('skrzynek');
  });

  it('usługi resellera: 2–4 → „usługi”, nie „usług”', () => {
    expect(services(1)).toBe('1 usługa');
    expect(services(3)).toBe('3 usługi');
    expect(services(5)).toBe('5 usług');
  });

  it('kody zapasowe 2FA: odmienia się też czasownik', () => {
    expect(recoveryCodesLeft(1)).toEqual({ verb: 'Pozostał', noun: 'kod zapasowy' });
    expect(recoveryCodesLeft(3)).toEqual({ verb: 'Pozostały', noun: 'kody zapasowe' });
    expect(recoveryCodesLeft(8)).toEqual({ verb: 'Pozostało', noun: 'kodów zapasowych' });
    expect(recoveryCodesLeft(0)).toEqual({ verb: 'Pozostało', noun: 'kodów zapasowych' });
  });
});
