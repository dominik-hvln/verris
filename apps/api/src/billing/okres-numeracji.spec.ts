import { okresNumeracji, STREFA_NUMERACJI } from './faktura-za-portfel';

/**
 * M-02 — okres numeracji faktur liczony w czasie polskim.
 *
 * Ten plik jest JEDNOSTKOWY, mimo że defekt wyszedł w teście integracyjnym.
 * Powód: sama pomyłka nie miała nic wspólnego z bazą — była w tym, skąd kod
 * bierze rok i miesiąc. Wyliczanie okresu to czysta funkcja i ma być pilnowana
 * przez pakiet, który biegnie zawsze, bez Postgresa.
 *
 * Testy są też odporne na strefę maszyny, na której biegną: przed poprawką
 * ten sam zestaw dawał inne wyniki na Macu (Europe/Warsaw) niż w CI (UTC), co
 * jest dokładnie tą własnością, którą naprawiamy. Test, którego wynik zależy
 * od maszyny, jest bezwartościowy — tak samo jak numeracja, która od niej zależy.
 */
describe('M-02 — okres numeracji faktur', () => {
  it('używa strefy polskiej, nie strefy procesu', () => {
    expect(STREFA_NUMERACJI).toBe('Europe/Warsaw');
  });

  describe('czas letni (UTC+2)', () => {
    // 31 sierpnia 23:59:59 UTC = 1 września 01:59:59 w Polsce.
    it('ostatnia sekunda sierpnia w UTC należy już do września', () => {
      expect(okresNumeracji(new Date('2026-08-31T23:59:59.000Z'))).toEqual({
        rok: 2026,
        miesiac: 9,
      });
    });

    // 31 sierpnia 21:59:59 UTC = 31 sierpnia 23:59:59 w Polsce — wciąż sierpień.
    it('dwie godziny wcześniej to jeszcze sierpień', () => {
      expect(okresNumeracji(new Date('2026-08-31T21:59:59.000Z'))).toEqual({
        rok: 2026,
        miesiac: 8,
      });
    });
  });

  describe('czas zimowy (UTC+1)', () => {
    // 31 grudnia 23:00:00 UTC = 1 stycznia 00:00:00 w Polsce — nowy ROK.
    it('ostatnia godzina roku w UTC należy już do następnego roku', () => {
      expect(okresNumeracji(new Date('2026-12-31T23:00:00.000Z'))).toEqual({
        rok: 2027,
        miesiac: 1,
      });
    });

    it('godzinę wcześniej to jeszcze grudzień poprzedniego roku', () => {
      expect(okresNumeracji(new Date('2026-12-31T22:59:59.000Z'))).toEqual({
        rok: 2026,
        miesiac: 12,
      });
    });
  });

  // Przesunięcie Polski nie jest stałe. Gdyby ktoś „uprościł" to na +1 albo +2,
  // kod byłby poprawny przez pół roku — a druga połowa objawiałaby się jako
  // pojedyncze faktury z numerem z sąsiedniego miesiąca.
  it('uwzględnia zmianę czasu — to samo UTC daje różne przesunięcie latem i zimą', () => {
    const lato = okresNumeracji(new Date('2026-06-30T22:30:00.000Z')); // +2 → 1 lipca
    const zima = okresNumeracji(new Date('2026-11-30T22:30:00.000Z')); // +1 → 30 listopada
    expect(lato).toEqual({ rok: 2026, miesiac: 7 });
    expect(zima).toEqual({ rok: 2026, miesiac: 11 });
  });

  describe('kontrola — środek miesiąca jest jednoznaczny', () => {
    it('południe UTC w środku miesiąca daje ten sam miesiąc', () => {
      expect(okresNumeracji(new Date('2026-08-15T12:00:00.000Z'))).toEqual({
        rok: 2026,
        miesiac: 8,
      });
    });
  });
});
