import { DOMYSLNE_PUNKTY_NA_DRZEWO, kosztRocznyGrosze, procent, punktyZaProcent, wkladCzesci, zl } from './drzewa-wyliczenia';

/** Podgląd stawek w adminie liczy tak samo jak API (W6): 7,00% za rok, 0,70% za miesiąc przy stawce 1,92%. */
describe('Drzewa – podgląd stawek', () => {
  it('domyślna stawka i koszt na 100 klientów przy 20 zł za drzewo', () => {
    expect(procent(wkladCzesci(44_900, 192))).toBe('7,00%');
    expect(procent(wkladCzesci(4_500, 192))).toBe('0,70%');
    expect(kosztRocznyGrosze({ bruttoGrosze: 44_900, platnosciWRoku: 1, klienci: 100, stawka: 192, kosztDrzewaGrosze: 2000 })).toEqual({ czesci: 70_000, grosze: 14_000 });
    expect(kosztRocznyGrosze({ bruttoGrosze: 4_500, platnosciWRoku: 12, klienci: 100, stawka: 192, kosztDrzewaGrosze: 2000 })).toEqual({ czesci: 84_000, grosze: 16_800 });
    expect(zl(14_000)).toBe('140,00 zł');
  });

  it('decyzja 16: 300 pkt = drzewo, 1% = 3 pkt, 10% = 30 pkt', () => {
    expect(DOMYSLNE_PUNKTY_NA_DRZEWO).toBe(300);
    expect(punktyZaProcent(100, 300)).toBe(300);
    expect(punktyZaProcent(1, 300)).toBe(3);
    expect(punktyZaProcent(10, 300)).toBe(30);
  });
});
