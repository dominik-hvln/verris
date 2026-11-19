import { walidujSvgSygnetu } from '../walidator-svg.ts';
import { KATALOG_SYGNETOW, rodzinaPoId } from '../sygnety/katalog.ts';
import { dopasowanieRodziny, kategorieBriefu, krojeDlaBriefu, KROJE_BRANZ, rodzinaPasuje } from './branze.ts';
import { FIKSTURY_SERII, odpowiedzFikstury } from './fikstury-serii.ts';
import { walidatorSymboluBiblioteki } from './kierunek-kompakt.ts';
import { WYJSCIE_SZACUNEK } from './koszt-marki.ts';
import { blokM1Marki, blokM2Marki, MAX_TOKENS_MARKI, WZORCE_SYMBOLI } from './master-prompt-marki.ts';
import { preselekcjaSerii } from './preselekcja.ts';
import { budujZapytanieSamooceny, doWymianySamoocena, MAKS_WYMIAN_SAMOOCENY, odczytajSamoocene, szacujKosztSamooceny } from './samoocena.ts';
import { budujZapytaniePonowienia, budujZapytanieSerii, odczytajPonowienie, odczytajSerie } from './seria.ts';
import { kontrolaSymbolu, przygotujSymbolAi } from './symbol-ai.ts';
import { uzupelnijSerie } from './zamiennik.ts';

/**
 * Paczka 134 – znak z briefu (feedback właściciela z serii „Lubuski Sport”: sześć szablonów z biblioteki bez związku
 * z nazwą i branżą). Na starym kodzie czerwone: preselekcja brała dowolne rodziny (Iskra, Fale, Toń dla sportu),
 * symbole AI tylko w 2 slotach, bez koncepcji, limit 8 elementów, kontrola punktów kontrolnych krzywych, kolory spoza
 * tokenów odrzucały symbol, null w polach odrzucał kierunek, brak ponowienia slotów i samooceny.
 */

const symbolOk = (s: string) => {
  const a = przygotujSymbolAi(s);
  if (!a.ok) return a.powod;
  const w = walidatorSymboluBiblioteki(a.svg);
  return w.ok ? 'ok' : w.powod;
};

describe('kategorie briefu i dopasowanie rodzin', () => {
  it('Lubuski Sport → sport; fałszywe trafienia początków słów nie przechodzą', () => {
    expect(kategorieBriefu(FIKSTURY_SERII.sport.brief)).toContain('sport');
    expect(kategorieBriefu({ branza: 'biuro rachunkowe', opis: 'Biegły rewident w Rzeszowie, automatyzacja księgowości.' })).toEqual(['finanse']);
    expect(kategorieBriefu({ branza: 'siłownia', opis: '' })).toEqual(['sport']);
    expect(kategorieBriefu({ branza: 'piekarnia', opis: 'Zielona Góra' })).toEqual(['gastronomia']);
  });

  it('rodzina abstrakcyjna pasuje tylko z dopasowaniem branży; monogram – zawsze', () => {
    const sport = FIKSTURY_SERII.sport.brief;
    const pasujace = KATALOG_SYGNETOW.filter((r) => !r.monogram && rodzinaPasuje(r, sport)).map((r) => r.id);
    expect(pasujace.sort()).toEqual(['gory', 'strzalka']);
    for (const id of ['gwiazda', 'fale', 'kreg-fala', 'promienie']) expect(rodzinaPasuje(rodzinaPoId(id)!, sport)).toBe(false);
    expect(KATALOG_SYGNETOW.filter((r) => r.monogram).every((r) => rodzinaPasuje(r, { branza: 'usługi różne', opis: 'cokolwiek' }))).toBe(true);
    expect(dopasowanieRodziny(rodzinaPoId('luk-okno')!, FIKSTURY_SERII.piekarnia.brief)).toBeGreaterThan(0);
  });

  it('każda rodzina ma uzupełnione `branze` (kategorie z KATEGORIE_BRANZ)', () => {
    for (const r of KATALOG_SYGNETOW) expect(r.branze?.length ?? 0, r.id).toBeGreaterThanOrEqual(4);
  });
});

describe('preselekcja z briefu', () => {
  it('Lubuski Sport: 4 sloty SYMBOL, abstrakcje tylko pasujące do sportu, kroje mocne bezszeryfowe (bez Playfair)', () => {
    for (let z = 0; z < 40; z++) {
      const p = preselekcjaSerii(FIKSTURY_SERII.sport.brief, [], z);
      expect(p.sloty.filter((s) => s.symbolAi)).toHaveLength(4);
      for (const s of p.sloty)
        for (const r of s.rodziny) {
          const def = rodzinaPoId(r.id)!;
          expect(def.monogram || ['gory', 'strzalka'].includes(r.id), `${z} ${r.id}`).toBe(true);
        }
      for (const s of p.sloty) {
        expect(s.kroje?.length).toBeGreaterThan(0);
        for (const f of s.kroje!) expect(KROJE_BRANZ.sport.minus).not.toContain(f);
      }
    }
    expect(krojeDlaBriefu(FIKSTURY_SERII.sport.brief).slice(0, 4)).toEqual(expect.arrayContaining(['Archivo Black', 'Bebas Neue']));
    expect(krojeDlaBriefu({ ...FIKSTURY_SERII.sport.brief, cechy: ['elegancka'] })).not.toContain('Playfair Display');
  });

  it('brief bez rozpoznanej branży: bez abstrakcji – same monogramy', () => {
    const b = { nazwa: 'Kowalski i Syn', branza: 'usługi różne', opis: 'Różne usługi dla klientów.', rodzaj: 'znak-i-napis' as const, cechy: [], barwyLubiane: [], barwyOdrzucone: [] };
    for (let z = 0; z < 20; z++) for (const s of preselekcjaSerii(b, [], z).sloty) for (const r of s.rodziny) expect(rodzinaPoId(r.id)!.monogram).toBe(true);
  });
});

describe('symbol AI – walidator i kontrola jakości (typowe SVG modeli)', () => {
  it('przyjmuje łuki A, krzywe C/Q z punktem kontrolnym poza polem, evenodd, biel jako wycięcie, transform rotate', () => {
    expect(symbolOk("<path d='M10 70C10 -5 90 -5 90 70L78 70C78 15 22 15 22 70Z'/><circle cx='50' cy='80' r='9' fill='A'/>")).toBe('ok');
    expect(symbolOk("<path fill-rule='evenodd' d='M50 5a45 45 0 1 0 0.1 0zm0 17a28 28 0 1 1-0.1 0z'/><rect x='42' y='30' width='16' height='40' rx='8' fill='A'/>")).toBe('ok');
    expect(symbolOk("<circle cx='50' cy='50' r='44'/><path fill='#fff' d='M30 44h40v14H30z'/>")).toBe('ok');
    expect(symbolOk("<path d='M15 80Q50 0 85 80H70Q50 30 30 80Z'/>")).toBe('ok');
    expect(symbolOk("<ellipse cx='50' cy='50' rx='14' ry='40' transform='rotate(30 50 50)'/>")).toBe('ok');
    // Kolor spoza tokenów (czerń, hex) → kolor główny, nie odrzucenie.
    expect(symbolOk("<path fill='#000' d='M20 20h60v60H20z'/><circle cx='50' cy='50' r='12' fill='#ffffff'/>")).toBe('ok');
  });

  it('12 elementów i 220 węzłów to limit; ponad – odrzucenie', () => {
    const el = (n: number) => Array.from({ length: n }, (_, i) => `<rect x='${4 + i * 6}' y='${10 + (i % 3) * 4}' width='14' height='70'/>`).join('');
    expect(symbolOk(el(12))).toBe('ok');
    expect(symbolOk(el(13))).toContain('13 elementów');
    expect(walidujSvgSygnetu(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${el(12).replace(/'/g, '"')}</svg>`, { tryb: 'ai' }).ok).toBe(true);
  });

  it('kontrola jakości odrzuca: pył, kreski, plamę; przepuszcza wzorce z M1', () => {
    const pyl = Array.from({ length: 12 }, (_, i) => `<circle cx='${(i % 4) * 25 + 12}' cy='${Math.floor(i / 4) * 30 + 15}' r='3'/>`).join('');
    expect(symbolOk(pyl)).toMatch(/jakość: .*(drobnych|lekki|cienkie)/);
    expect(symbolOk("<path d='M10 10L90 90L91 89L11 9Z'/><path d='M10 90L90 10L91 11L11 91Z'/>")).toMatch(/jakość/);
    expect(symbolOk("<rect x='0' y='0' width='100' height='100'/>")).toMatch(/plama/);
    for (const [k, s] of Object.entries(WZORCE_SYMBOLI)) expect(symbolOk(s), k).toBe('ok');
    const a = przygotujSymbolAi(WZORCE_SYMBOLI.sport);
    expect(a.ok && kontrolaSymbolu(walidujSvgSygnetu(a.svg, { tryb: 'ai' }).svg)).toEqual([]);
  });
});

describe('seria z briefu – realistyczne odpowiedzi modelu (fikstury)', () => {
  for (const [nazwa, f] of Object.entries(FIKSTURY_SERII)) {
    it(`${f.brief.nazwa}: odczyt przechodzi, ≥ 4 symbole AI z koncepcją, wszystkie kierunki z koncepcją`, () => {
      const p = preselekcjaSerii(f.brief, [], 2026);
      const w = odczytajSerie(odpowiedzFikstury(f, p), f.brief, p, { walidujSymbol: walidatorSymboluBiblioteki });
      if (!w.ok) throw new Error(`${nazwa}: ${w.bledy.join('; ')}`);
      expect(w.dane.odrzucone, nazwa).toEqual([]);
      const ai = w.dane.kierunki.filter((k) => k?.zrodloZnaku === 'ai');
      expect(ai.length).toBeGreaterThanOrEqual(4);
      expect(w.dane.kierunki.filter((k) => k?.koncepcja).length).toBeGreaterThanOrEqual(4);
      for (const k of w.dane.kierunki) expect(k!.koncepcja!.split(/\s+/).length).toBeLessThanOrEqual(25);
      for (const k of w.dane.kierunki) expect(p.sloty.find((s) => s.id === k!.id)!.kroje).toContain(k!.projekt.napis.font);
    });
  }

  it('wyjście fikstur (≈ 3 znaki/token) mieści się w szacunku, max_tokens = 2 × szacunek + zapas na myślenie', () => {
    for (const f of Object.values(FIKSTURY_SERII)) {
      const t = odpowiedzFikstury(f, preselekcjaSerii(f.brief, [], 1));
      expect(Math.ceil(t.length / 3)).toBeLessThanOrEqual(WYJSCIE_SZACUNEK.seria);
    }
    expect(MAX_TOKENS_MARKI.seria).toBeGreaterThanOrEqual(2 * WYJSCIE_SZACUNEK.seria + 3000);
  });

  it('M1 wymusza związek z briefem i koncepcję; M2 ma słownik motywów; wiadomość podaje kategorie', () => {
    const m1 = blokM1Marki();
    for (const fraza of ['Związek z briefem jest obowiązkowy', 'Zakaz dekoracyjnych abstrakcji', '"c" – koncepcja, WYMAGANA', 'zadanie PONOWNIE', 'Test 16 px']) expect(m1).toContain(fraza);
    for (const s of Object.values(WZORCE_SYMBOLI)) expect(m1).toContain(s);
    expect(blokM2Marki()).toContain('- sport: tor i linia mety');
    const f = FIKSTURY_SERII.sport;
    const t = budujZapytanieSerii(f.brief, preselekcjaSerii(f.brief, [], 3)).wiadomosci[0].content;
    expect(t).toContain('Litery nazwy do znaku: LS');
    expect(t).toMatch(/Kategorie branży z briefu \(motywy w M2\): sport/);
  });
});

describe('ponowienie slotów i zamiennik', () => {
  const f = FIKSTURY_SERII.sport;
  const p = preselekcjaSerii(f.brief, [], 5);

  it('zapytanie PONOWNIE: tylko podane sloty z powodami, brief w <brief>, ten sam prefiks M1+M2', () => {
    const z = budujZapytaniePonowienia(f.brief, p, [
      { slot: 'k2', powod: 'jakość: zbyt cienkie elementy' },
      { slot: 'k4', powod: 'samoocena: trafność 2' },
    ]);
    const t = z.wiadomosci[0].content;
    expect(t).toContain('Zadanie: PONOWNIE');
    expect(t).toContain('k2: jakość: zbyt cienkie elementy');
    expect(t.match(/^k\d – /gm)).toEqual(['k2 – ', 'k4 – ']);
    expect(z.system.map((b) => b.cache)).toEqual(['1h', '1h']);
    expect(z.maxTokens).toBe(MAX_TOKENS_MARKI.ponowienie);
  });

  it('odczyt ponowienia: dobry symbol wchodzi, zły dalej null; uzupelnijSerie daje w jego miejsce monogram', () => {
    const odp = JSON.stringify({ k: [{ c: 'Litera L z toru bieżni – z nazwy', s: f.symbole[0].s, b: p.sloty[1].barwy[0] }, { c: 'Kreski', s: "<path d='M10 10L90 90L91 89L11 9Z'/>", b: p.sloty[3].barwy[0] }] });
    const w = odczytajPonowienie(odp, f.brief, p, [{ slot: 'k2', powod: 'x' }, { slot: 'k4', powod: 'y' }], { walidujSymbol: walidatorSymboluBiblioteki });
    if (!w.ok) throw new Error(w.bledy.join());
    expect(w.dane.kierunki[0]!.zrodloZnaku).toBe('ai');
    expect(w.dane.kierunki[1]).toBeNull();
    expect(w.dane.odrzucone[0].powod).toMatch(/^ponowienie: k4: symbol odrzucony.*jakość/);
    const g = uzupelnijSerie({ kierunki: [null], odrzucone: [] }, f.brief, { ...p, sloty: [p.sloty[3]] });
    const s = g.kierunki[0].projekt.sygnet;
    expect(s.typ === 'biblioteka' && rodzinaPoId(s.rodzina)!.monogram).toBe(true);
  });
});

describe('samoocena wizją', () => {
  it('zapytanie: tani model, obraz, koncepcje kafli, brief w <brief>; koszt szacunkowy < 0,01 USD', () => {
    const z = budujZapytanieSamooceny(FIKSTURY_SERII.sport.brief, [{ id: 'k1', koncepcja: 'Litera L z toru' }, { id: 'k2' }]);
    expect(z.klasaModelu).toBe('tani');
    expect(z.obraz).toEqual({ mediaType: 'image/png' });
    expect(z.wiadomosci[0].content).toContain('1. k1 – koncepcja: Litera L z toru');
    expect(z.wiadomosci[0].content).toContain('<brief>');
    expect(szacujKosztSamooceny(6)).toBeLessThan(0.01);
  });

  it('odczyt i wymiana: ocena < 3 → do wymiany, najsłabsze najpierw, najwyżej MAKS_WYMIAN_SAMOOCENY', () => {
    const o = (id: string, t: number, c = 4, k = 4) => ({ id, t, c, k });
    const w = odczytajSamoocene(JSON.stringify({ o: [o('k1', 5), o('k2', 2), o('k3', 4, 1), o('k4', 3, 3, 2), o('k5', 1, 1, 1), o('k6', 4)] }), ['k1', 'k2', 'k3', 'k4', 'k5', 'k6']);
    if (!w.ok) throw new Error(w.bledy.join());
    const d = doWymianySamoocena(w.dane);
    expect(d).toHaveLength(MAKS_WYMIAN_SAMOOCENY);
    expect(d.map((x) => x.slot)).toEqual(['k5', 'k3', 'k2']);
    expect(d[0].powod).toContain('samoocena: trafność 1');
    expect(odczytajSamoocene('{"o":[{"id":"k1","t":9,"c":1,"k":1}]}', ['k1']).ok).toBe(false);
  });
});
