import { blokZrodel, netto, przyjmijZrodla, zrodloCennika, zrodlaFaktow, zrodlaSpecyfikacji, zrodlaWiedzy, type Zrodlo } from './zrodla.js';

describe('źródła asystenta www', () => {
  const dostepne: Zrodlo[] = [
    { id: 'cennik', tytul: 'Cennik', url: 'https://verris.pl/cennik', tresc: 'x' },
    { id: 'fakt-kopie', tytul: 'Kopie', url: 'https://verris.pl/funkcje/kopie-zapasowe', tresc: 'y' },
  ];

  it('przyjmuje tylko id z dostarczonych źródeł, bez powtórzeń i bez treści', () => {
    expect(przyjmijZrodla(['fakt-kopie', 'zmyslone', 'cennik', 'fakt-kopie', 7, null], dostepne)).toEqual([
      { id: 'fakt-kopie', tytul: 'Kopie', url: 'https://verris.pl/funkcje/kopie-zapasowe' },
      { id: 'cennik', tytul: 'Cennik', url: 'https://verris.pl/cennik' },
    ]);
  });

  it.each([[undefined], ['cennik'], [{ 0: 'cennik' }]])('nie-tablica (%j) → brak źródeł', (v) => {
    expect(przyjmijZrodla(v, dostepne)).toEqual([]);
  });

  it('netto = brutto / 1,23 z zaokrągleniem do grosza', () => {
    expect(netto(45)).toBe(36.59);
    expect(netto(449)).toBe(365.04);
    expect(netto(9.99)).toBe(8.12);
  });

  it('cennik podaje brutto i netto z bazy oraz rabat roczny', () => {
    const z = zrodloCennika({
      hosting: { miesiecznie: 45, rocznie: 449, trialDays: 0 },
      poczta: { miesiecznie: 9.99, rocznie: 99.99 },
      stawki: { cpu: 0.0005, ram: 0.0132, dysk: 0.000137 },
    });
    expect(z.id).toBe('cennik');
    expect(z.tresc).toContain('45,00 zł brutto (36,59 zł netto)');
    expect(z.tresc).toContain('449,00 zł brutto (365,04 zł netto)');
    expect(z.tresc).toContain('16% taniej');
    expect(z.tresc).toContain('9,99 zł brutto (8,12 zł netto)');
    expect(z.tresc).toContain('0,0132 zł brutto');
    expect(z.tresc).toContain('730 godzin');
  });

  it('bez planów w bazie cennik nie wymyśla kwot', () => {
    const z = zrodloCennika({ hosting: null, poczta: null, stawki: {} });
    expect(z.tresc).not.toMatch(/\d+,\d\d zł/);
  });

  it('artykuły bazy wiedzy: link do pomoc.verris.pl/a/<slug>, fragmenty jednego artykułu sklejone', () => {
    const z = zrodlaWiedzy([
      { docId: 'd1', title: 'Poczta na telefonie', content: 'a', sourceRef: 'kb-cms:poczta-na-telefonie' },
      { docId: 'd1', title: 'Poczta na telefonie', content: 'b', sourceRef: 'kb-cms:poczta-na-telefonie' },
      { docId: 'd2', title: 'Wewnętrzny', content: 'c', sourceRef: null },
    ]);
    expect(z).toEqual([
      { id: 'kb-d1', tytul: 'Poczta na telefonie', url: 'https://pomoc.verris.pl/a/poczta-na-telefonie', tresc: 'a\nb' },
      { id: 'kb-d2', tytul: 'Wewnętrzny', url: 'https://pomoc.verris.pl', tresc: 'c' },
    ]);
  });

  it('okres próbny: bez dni próby asystent mówi, że jej nie ma', () => {
    expect(zrodlaFaktow(0, 100).find((f) => f.id === 'fakt-proba')?.tresc).toContain('nie ma darmowego okresu próbnego');
    const z14 = zrodlaFaktow(14, 100).find((f) => f.id === 'fakt-proba')?.tresc;
    expect(z14).toContain('14 dni');
    expect(z14).toContain('100 wiadomości');
  });

  it('id źródeł są unikalne, a blok promptu zawiera każde id', () => {
    const wszystkie = [zrodloCennika({ stawki: {} }), ...zrodlaSpecyfikacji(), ...zrodlaFaktow(0, 100)];
    const ids = wszystkie.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
    const blok = blokZrodel(wszystkie);
    for (const id of ids) expect(blok).toContain(`<zrodlo id="${id}"`);
  });
});
