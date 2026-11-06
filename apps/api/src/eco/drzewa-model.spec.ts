import {
  CERTYFIKAT_VERRIS,
  CZESCI_DRZEWA,
  DOMYSLNE_PUNKTY_NA_DRZEWO,
  KLUCZ_PUNKTY_NA_DRZEWO,
  KLUCZE_DRZEW,
  groszeZKwoty,
  kosztCzesciGrosze,
  nettoZBruttoGrosze,
  odczytajUstawieniaDrzew,
  odstepPonowieniaMs,
  opisPosadzonychDrzew,
  planujPrzydzial,
  procentDrzewa,
  punktyZaProcent,
  wkladZUslugiCzesci,
  DOMYSLNE_USTAWIENIA_DRZEW,
} from './drzewa-model.js';

/** W6 (decyzja 12) — przeliczenia drzew w liczbach całkowitych. */
describe('Drzewa – model', () => {
  const stawka = DOMYSLNE_USTAWIENIA_DRZEW.wkladNa100ZlNetto;

  it('domyślna stawka: hosting roczny 449 zł brutto = 7,00% drzewa, miesięczny 45 zł = 0,70%', () => {
    const rok = nettoZBruttoGrosze(groszeZKwoty('449.00'));
    const mies = nettoZBruttoGrosze(groszeZKwoty('45.00'));
    expect(rok).toBe(36504);
    expect(mies).toBe(3659);
    expect(procentDrzewa(wkladZUslugiCzesci(rok, stawka))).toBe('7,00%');
    expect(procentDrzewa(wkladZUslugiCzesci(mies, stawka))).toBe('0,70%');
    // Dawny rabat na start (do 6.11.2026: −15% rok, −10% miesiąc) — wkład proporcjonalny do faktycznie zapłaconej kwoty netto.
    expect(wkladZUslugiCzesci(nettoZBruttoGrosze(groszeZKwoty('381.65')), stawka)).toBe(595);
    expect(wkladZUslugiCzesci(nettoZBruttoGrosze(groszeZKwoty('40.50')), stawka)).toBe(63);
  });

  it('kwoty bez liczb zmiennoprzecinkowych; zero, ujemne i stawka 0 nie dają wkładu', () => {
    expect(groszeZKwoty('0.1')).toBe(10);
    expect(groszeZKwoty('-12.34')).toBe(-1234);
    expect(groszeZKwoty('zła')).toBe(0);
    expect(wkladZUslugiCzesci(0, stawka)).toBe(0);
    expect(wkladZUslugiCzesci(36504, 0)).toBe(0);
    expect(nettoZBruttoGrosze(-100)).toBe(0);
  });

  it('wymiana punktów: procent drzewa w górę do pełnego punktu', () => {
    expect(punktyZaProcent(1, 200)).toBe(2);
    expect(punktyZaProcent(1, 1000)).toBe(10);
    expect(punktyZaProcent(7, 150)).toBe(11); // 10,5 → 11
    expect(punktyZaProcent(100, 200)).toBe(200);
  });

  it('decyzja 16 (4.11.2026): domyślnie 300 pkt = 1 drzewo, 1% = 3 pkt; ustawienie w adminie nadpisuje', () => {
    expect(DOMYSLNE_PUNKTY_NA_DRZEWO).toBe(300);
    expect(odczytajUstawieniaDrzew(new Map()).punktyNaDrzewo).toBe(300);
    expect(punktyZaProcent(1, 300)).toBe(3);
    expect(punktyZaProcent(100, 300)).toBe(300);
    expect(odczytajUstawieniaDrzew(new Map([[KLUCZ_PUNKTY_NA_DRZEWO, '450']])).punktyNaDrzewo).toBe(450);
    expect(odczytajUstawieniaDrzew(new Map([[KLUCZ_PUNKTY_NA_DRZEWO, '0']])).punktyNaDrzewo).toBe(300);
  });

  it('decyzja 17 (4.11.2026): certyfikat wyłącznie na Verris, bez ustawienia nazwy w adminie', () => {
    expect(CERTYFIKAT_VERRIS).toEqual({ customerName: 'Verris', certificateText: 'Drzewo posadzone dzięki klientom Verris' });
    expect(Object.keys(odczytajUstawieniaDrzew(new Map()))).not.toContain('nazwaNaCertyfikacie');
  });

  it('koszt drzewa nigdy ponad 20 zł – wartość spoza zakresu = domyślna', () => {
    const u = odczytajUstawieniaDrzew(new Map([[KLUCZE_DRZEW.KOSZT_DRZEWA_GROSZE, '2500']]));
    expect(u.kosztDrzewaGrosze).toBe(2000);
    expect(odczytajUstawieniaDrzew(new Map([[KLUCZE_DRZEW.KOSZT_DRZEWA_GROSZE, '1500']])).kosztDrzewaGrosze).toBe(1500);
    expect(odczytajUstawieniaDrzew(new Map()).srodowisko).toBe('test');
    expect(odczytajUstawieniaDrzew(new Map()).wlaczone).toBe(false);
    expect(kosztCzesciGrosze(700, 2000)).toBe(140);
  });

  it('odmiana na odznakę: całe drzewa przez liczebnik, ułamek obcięty do setnych', () => {
    expect(opisPosadzonychDrzew(CZESCI_DRZEWA)).toBe('1 posadzone drzewo');
    expect(opisPosadzonychDrzew(3 * CZESCI_DRZEWA)).toBe('3 posadzone drzewa');
    expect(opisPosadzonychDrzew(12 * CZESCI_DRZEWA)).toBe('12 posadzonych drzew');
    expect(opisPosadzonychDrzew(22 * CZESCI_DRZEWA)).toBe('22 posadzone drzewa');
    expect(opisPosadzonychDrzew(10_799)).toBe('1,07 posadzonego drzewa');
    expect(opisPosadzonychDrzew(700)).toBe('0,07 posadzonego drzewa');
  });

  it('przydział FIFO: całe wkłady, a ten na granicy drzewa dzielony', () => {
    const w = [
      { id: 'a', czesci: 6000 },
      { id: 'b', czesci: 3000 },
      { id: 'c', czesci: 2500 },
      { id: 'd', czesci: 100 },
    ];
    expect(planujPrzydzial(w, CZESCI_DRZEWA)).toEqual({
      cale: ['a', 'b'],
      podzial: { id: 'c', przydzielone: 1000, reszta: 1500 },
    });
    expect(planujPrzydzial([{ id: 'a', czesci: 10_000 }, { id: 'b', czesci: 5 }], CZESCI_DRZEWA)).toEqual({
      cale: ['a'],
      podzial: null,
    });
    expect(() => planujPrzydzial([{ id: 'a', czesci: 9999 }], CZESCI_DRZEWA)).toThrow(/brakuje/);
  });

  it('ponowienie po odrzuceniu: 1 h, 2 h, 4 h … maks. doba', () => {
    expect(odstepPonowieniaMs(1)).toBe(3_600_000);
    expect(odstepPonowieniaMs(3)).toBe(4 * 3_600_000);
    expect(odstepPonowieniaMs(30)).toBe(24 * 3_600_000);
  });
});
