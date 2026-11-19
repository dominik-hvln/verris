import { createHash } from 'node:crypto';
import { blokMasterPromptu } from '../../ai/master-prompt.ts';
import { KATALOG_FONTOW } from '../../style/katalog-stylow.ts';
import { CHARAKTERY_PALET } from '../../style/kolory.ts';
import { KATALOG_SYGNETOW } from '../sygnety/katalog.ts';
import type { RodzinaSygnetu } from '../typy.ts';
import { kosztUsd, tokenyObrazu, WYJSCIE_SZACUNEK } from './koszt-marki.ts';
import { CHARAKTER_KROJOW } from './kroje.ts';
import { blokiSystemuMarki, blokM1Marki, blokM2Marki, MAX_TOKENS_MARKI, szacujTokenyMarki, tekstM2, ZAPAS_NA_MYSLENIE, zbudujBlokiMarki } from './master-prompt-marki.ts';
import { preselekcjaSerii } from './preselekcja.ts';
import { budujZapytanieSerii } from './seria.ts';
import { budujZapytanieDrobnejZmiany } from './drobne.ts';
import type { BriefMarki } from '../model.ts';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

const brief: BriefMarki = {
  nazwa: 'Piekarnia Zakwas',
  branza: 'piekarnia',
  opis: 'Chleb na zakwasie z pieca opalanego drewnem w Swarzędzu.',
  rodzaj: 'znak-i-napis',
  cechy: ['rzemieslnicza', 'ciepla'],
  barwyLubiane: [],
  barwyOdrzucone: [],
};

describe('bloki M1 i M2 – stabilność bajtowa (cache 1 h)', () => {
  it('M1 i M2 są deterministyczne bajt w bajt (pamięć podręczna i niezależne budowanie)', () => {
    const [m1, m2] = zbudujBlokiMarki();
    expect(hash(blokM1Marki())).toBe(hash(m1));
    expect(hash(blokM2Marki())).toBe(hash(m2));
    const [m1b, m2b] = zbudujBlokiMarki();
    expect(hash(m1b)).toBe(hash(m1));
    expect(hash(m2b)).toBe(hash(m2));
  });

  it('bez dat i znaczników czasu (stały prefiks)', () => {
    for (const b of zbudujBlokiMarki()) expect(b).not.toMatch(/20\d\d-\d\d-\d\d|\d{1,2}\.\d{1,2}\.20\d\d/);
  });

  it('każda operacja zaczyna się tym samym M1; drobne zmiany – samo M1 (ten sam wpis cache)', () => {
    const seria = budujZapytanieSerii(brief, preselekcjaSerii(brief, [], 1));
    const drobna = budujZapytanieDrobnejZmiany('haslo', brief);
    expect(seria.system.map((b) => b.cache)).toEqual(['1h', '1h']);
    expect(drobna.system.map((b) => b.cache)).toEqual(['1h']);
    expect(drobna.system[0].tekst).toBe(seria.system[0].tekst);
    expect(blokiSystemuMarki('pelny')[1].tekst).toBe(blokM2Marki());
    expect(drobna.klasaModelu).toBe('tani');
    expect(seria.klasaModelu).toBe('glowny');
  });

  it('prefiksu nie współdzieli z kreatorem stron (osobny wpis cache, zmiana jednego nie unieważnia drugiego)', () => {
    expect(blokM1Marki().slice(0, 40)).not.toBe(blokMasterPromptu().slice(0, 40));
  });

  it('M1 nie zależy od katalogu (zmiana biblioteki zmienia tylko M2)', () => {
    for (const r of KATALOG_SYGNETOW) expect(blokM1Marki()).not.toContain(`${r.id} –`);
    const inny: RodzinaSygnetu[] = [{ ...KATALOG_SYGNETOW[0], id: 'testowa', parametry: [] }];
    expect(tekstM2(inny)).not.toBe(blokM2Marki());
    expect(tekstM2(inny)).toContain('- testowa – ');
  });

  it('M2 zawiera cały katalog: każdą rodzinę z każdym parametrem i zakresem, każdy krój, każdy charakter palety', () => {
    const m2 = blokM2Marki();
    for (const r of KATALOG_SYGNETOW) {
      expect(m2).toContain(`- ${r.id} – ${r.nazwa}: `);
      for (const p of r.parametry) expect(m2).toContain(`${p.klucz} ${p.min}–${p.max} (${p.domyslna})`);
      if (r.monogram) expect(m2).toMatch(new RegExp(`- ${r.id} – [^\\n]*monogram – wymaga "l"`));
    }
    for (const f of KATALOG_FONTOW) expect(m2).toContain(`- ${f.rodzina} (${f.wagi.join('/')})`);
    for (const c of CHARAKTERY_PALET) expect(m2).toContain(`- ${c}: `);
  });

  it('każdy krój z KATALOG_FONTOW ma opis charakteru (nowy krój = nowy opis)', () => {
    for (const f of KATALOG_FONTOW) expect(CHARAKTER_KROJOW[f.rodzina], f.rodzina).toBeTruthy();
  });

  it('typografia: pauza „—” występuje tylko w zasadzie, która jej zakazuje', () => {
    const [m1, m2] = zbudujBlokiMarki();
    expect(m1.match(/—/g)).toHaveLength(1);
    expect(m1).toContain('nigdy pauza „—”');
    expect(m2).not.toContain('—');
  });

  it('zasady prawne i formaty wszystkich operacji są w M1', () => {
    const m1 = blokM1Marki();
    for (const fraza of ['unikalny', 'zastrzeżony', 'gotowy do rejestracji', '<brief>', 'półpauza', 'Słabo:', 'Dobrze:']) expect(m1).toContain(fraza);
    for (const zad of ['zadanie SERIA', 'zadanie ODSWIEZENIE', 'zadanie ANALIZA', 'zadanie KV', 'HASLO', 'PODPIS', 'OPIS', 'KOLORY']) expect(m1).toContain(zad);
  });
});

/**
 * Szacunek tokenów i kosztu (Sonnet 5.5: 2 / 10 USD za 1 mln, zapis cache 1 h ×2, odczyt ×0,05) – rozdz. 8.3.
 * Wartości z tego testu (znaki / 3,5) przy obecnym katalogu (paczka 134): M1 ≈ 3,7 tys., M2 ≈ 5,7 tys. tokenów.
 *
 * | Operacja                                   | Wejście (cache + wiad.) | Wyjście | Koszt (ciepły cache) |
 * |--------------------------------------------|-------------------------|---------|----------------------|
 * | Seria 6 – do paczki 133 (4 bibl. + 2 AI)   | ~7,8 tys. + ~0,5 tys.   | ~1 050  | ≈ 0,012 USD          |
 * | Seria 6 – paczka 134 (4 AI + 2 bibl.)      | ~9,3 tys. + ~0,55 tys.  | ~1 420  | ≈ 0,016 USD          |
 * | + ponowienie 2 slotów (gdy > 1 odrzucony)  | ~9,3 tys. + ~0,3 tys.   | ~540    | ≈ +0,007 USD         |
 * | + samoocena wizją (tani model, 768×512)    | ~1,3 tys. (bez cache)   | ~150    | ≈ +0,004 USD         |
 * | Odświeżenie (3 kierunki)                   | ~7,8 tys. + ~0,6 tys.   | ~390    | ≈ 0,006 USD          |
 * | Analiza logo (obraz 512 px)                | ~7,8 tys. + ~0,5 tys.   | ~180    | ≈ 0,004 USD          |
 * | Key Visual                                 | ~7,8 tys. + ~0,3 tys.   | ~70     | ≈ 0,002 USD          |
 * | Drobna zmiana (samo M1; tańszy model)      | ~3,0 tys. + ~0,2 tys.   | ~45     | ≤ 0,001 USD          |
 * | Zapis M1+M2 do cache (raz na godzinę)      | ~7,8 tys. × 2           | –       | ≈ 0,031 USD          |
 *
 * Marka w cenie hostingu (3 serie, 10 drobnych zmian, z ~30% napraw serii): ≈ 0,06 USD bez zapisu cache.
 */
describe('szacunek tokenów i kosztu', () => {
  const m1 = szacujTokenyMarki(blokM1Marki());
  const m2 = szacujTokenyMarki(blokM2Marki());

  it('prefiks M1 ≥ 1024 tokenów (cache na Sonnet 4.5+ / Haiku 5.5), M1+M2 > 4096 (cache na każdym modelu)', () => {
    expect(m1).toBeGreaterThan(1024);
    expect(m1 + m2).toBeGreaterThan(4096);
    // Górna granica – pilnuje, żeby stała część nie puchła bez potrzeby.
    expect(m1 + m2).toBeLessThan(14_000);
  });

  it('wiadomość serii jest krótka (< 900 tokenów), a max_tokens ≈ 2–3 × realnego wyjścia', () => {
    const z = budujZapytanieSerii(brief, preselekcjaSerii(brief, [], 7));
    expect(szacujTokenyMarki(z.wiadomosci[0].content)).toBeLessThan(900);
    // Paczka 134: 2 × realne wyjście + zapas na myślenie modelu (tokeny myślenia liczą się do max_tokens).
    for (const [op, max] of Object.entries(MAX_TOKENS_MARKI)) {
      const wyj = WYJSCIE_SZACUNEK[op as keyof typeof WYJSCIE_SZACUNEK];
      expect(max, op).toBeGreaterThanOrEqual(2 * wyj + ZAPAS_NA_MYSLENIE);
      expect(max, op).toBeLessThan(2 * wyj + ZAPAS_NA_MYSLENIE + 500);
    }
  });

  it('koszt serii przy ciepłym cache < 0,02 USD, drobnej zmiany < 0,002 USD, zapis cache < 0,05 USD', () => {
    const wiad = szacujTokenyMarki(budujZapytanieSerii(brief, preselekcjaSerii(brief, [], 7)).wiadomosci[0].content);
    const seria = kosztUsd({ odczytCache: m1 + m2, wejscie: wiad, wyjscie: WYJSCIE_SZACUNEK.seria });
    const drobna = kosztUsd({ odczytCache: m1, wejscie: 250, wyjscie: WYJSCIE_SZACUNEK.drobna });
    const zapis = kosztUsd({ odczytCache: 0, zapisCache: m1 + m2, wejscie: 0, wyjscie: 0 });
    const analiza = kosztUsd({ odczytCache: m1 + m2, wejscie: 300 + tokenyObrazu(1200, 600), wyjscie: WYJSCIE_SZACUNEK.analizaLogo });
    expect(seria).toBeLessThan(0.02);
    expect(drobna).toBeLessThan(0.002);
    expect(zapis).toBeLessThan(0.05);
    expect(analiza).toBeLessThan(0.006);
    // Wyjście to większość kosztu serii – dlatego zapis kompaktowy.
    expect((WYJSCIE_SZACUNEK.seria * 10) / 1e6 / seria).toBeGreaterThan(0.7);
  });
});
