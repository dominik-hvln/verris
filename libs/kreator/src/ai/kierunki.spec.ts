import { KATALOG_EFEKTOW, KATALOG_WARIANTOW } from '../katalog.ts';
import { walidujStrone } from '../model.ts';
import { PRZYKLAD_SALON } from '../przyklady/salon.ts';
import { KATALOG_STYLOW, stylPoId } from '../style/katalog-stylow.ts';
import type { BriefStrony } from './kontrakt.ts';
import { losZZiarna, odciskKierunku, odciskStrony, wagaStylu, wybierzKierunki } from './kierunki.ts';

const fryzjer: BriefStrony = { opis: 'Salon fryzjerski na Jeżycach.', typ: 'wizytowka', firma: { branza: 'salon fryzjerski' }, ton: 'ciepły' };
const prawnik: BriefStrony = { opis: 'Kancelaria adwokacka, prawo rodzinne.', typ: 'wizytowka', firma: { branza: 'kancelaria adwokacka' }, ton: 'ekspercki' };

const WARIANTY_PRO = new Set(Object.values(KATALOG_WARIANTOW).flat().filter((w) => w.pro).map((w) => w.id));
const EFEKTY_PRO = new Set(KATALOG_EFEKTOW.filter((e) => e.pro).map((e) => e.id));

describe('wybierzKierunki', () => {
  it('deterministyczne przy tym samym źródle losowości', () => {
    const a = wybierzKierunki(fryzjer, 3, [], losZZiarna(42), 'pro');
    const b = wybierzKierunki(fryzjer, 3, [], losZZiarna(42), 'pro');
    expect(a).toEqual(b);
    const c = wybierzKierunki(fryzjer, 3, [], losZZiarna(43), 'pro');
    expect(c).not.toEqual(a);
  });

  it('Pro: 3 kierunki z różnych stylów i różnych rodzin, z różnymi odciskami', () => {
    for (let z = 1; z <= 50; z++) {
      const k = wybierzKierunki(fryzjer, 3, [], losZZiarna(z), 'pro');
      expect(k).toHaveLength(3);
      expect(new Set(k.map((x) => x.styl)).size).toBe(3);
      expect(new Set(k.map((x) => stylPoId(x.styl)!.rodzina)).size).toBe(3);
      expect(new Set(k.map(odciskKierunku)).size).toBe(3);
    }
  });

  it('bez Pro nigdy nie wybiera stylu, wariantu ani sekcji Pro (1000 losowań, różne branże i wskazany styl Pro)', () => {
    const briefy: BriefStrony[] = [fryzjer, prawnik, { opis: 'Restauracja', typ: 'sklep', styl: 'luksusowy-ciemny' }, { opis: 'Blog o winie', typ: 'blog' }];
    const los = losZZiarna(7);
    for (let i = 0; i < 1000; i++) {
      for (const k of wybierzKierunki(briefy[i % briefy.length], 2, [], los, i % 2 ? 'hosting' : 'proba')) {
        const styl = stylPoId(k.styl)!;
        expect(styl.pro).toBe(false);
        for (const w of Object.values(k.warianty)) expect(WARIANTY_PRO.has(w!)).toBe(false);
        expect(k.warianty.produkty).toBeUndefined();
        expect(k.warianty.blog).toBeUndefined();
      }
    }
  });

  it('domyślnie (bez podanej wersji) traktuje wywołanie jak wersję bez Pro', () => {
    for (let z = 0; z < 100; z++) {
      expect(stylPoId(wybierzKierunki(fryzjer, 1, [], losZZiarna(z))[0].styl)!.pro).toBe(false);
    }
  });

  it('unika odcisków ostatnich stron tej branży', () => {
    // Zbierz wszystkie odciski, jakie losuje styl dominujący dla fryzjera, i oznacz je jako niedawne – poza jednym.
    const wszystkie = new Set<string>();
    for (let z = 0; z < 400; z++) for (const k of wybierzKierunki(fryzjer, 1, [], losZZiarna(z), 'hosting')) wszystkie.add(odciskKierunku(k));
    expect(wszystkie.size).toBeGreaterThan(3);
    const niedawne = [...wszystkie].slice(0, 3);
    for (let z = 0; z < 200; z++) {
      const [k] = wybierzKierunki(fryzjer, 1, niedawne, losZZiarna(z), 'hosting');
      expect(niedawne).not.toContain(odciskKierunku(k));
    }
  });

  it('dopasowanie do branży: kancelaria najczęściej dostaje styl klasyczny, fryzjer ciepły', () => {
    const licz = (b: BriefStrony) => {
      const m = new Map<string, number>();
      const los = losZZiarna(1);
      for (let i = 0; i < 300; i++) {
        const s = wybierzKierunki(b, 1, [], los, 'hosting')[0].styl;
        m.set(s, (m.get(s) ?? 0) + 1);
      }
      return [...m].sort((a, b) => b[1] - a[1])[0][0];
    };
    expect(licz(prawnik)).toBe('klasyczny-zaufanie');
    expect(licz(fryzjer)).toBe('cieply-nowoczesny');
  });

  it('styl wskazany w briefie wygrywa, a bez Pro styl Pro przechodzi na zastępczy', () => {
    const b: BriefStrony = { ...fryzjer, styl: 'luksusowy-ciemny' };
    expect(wagaStylu(stylPoId('luksusowy-ciemny')!, b, true)).toBeGreaterThan(25);
    expect(wagaStylu(stylPoId('klasyczny-zaufanie')!, b, false)).toBeGreaterThan(25);
  });

  it('kierunek ma fonty i warianty z katalogu stylu, a barwę z zakresów stylu', () => {
    const los = losZZiarna(5);
    for (let i = 0; i < 200; i++) {
      for (const k of wybierzKierunki(prawnik, 3, [], los, 'pro')) {
        const s = stylPoId(k.styl)!;
        expect(s.pary.some((p) => p.naglowki === k.fonty.naglowki && p.tekst === k.fonty.tekst)).toBe(true);
        expect(s.charaktery).toContain(k.charakterPalety);
        expect(k.barwa).toBeGreaterThanOrEqual(0);
        expect(k.barwa).toBeLessThan(360);
        for (const [typ, w] of Object.entries(k.warianty)) expect(s.warianty[typ as keyof typeof s.warianty]).toContain(w);
      }
    }
  });
});

describe('odciskStrony', () => {
  it('styl|font nagłówków|wariant hero|wariant oferty', () => {
    const w = walidujStrone(PRZYKLAD_SALON);
    if (!w.ok) throw new Error();
    expect(odciskStrony(w.strona)).toBe('cieply-nowoczesny|fraunces|hero-podzielony|oferta-lista-cen');
  });
});

describe('katalog stylów', () => {
  it('ok. 16 stylów, ok. 6 bez Pro, identyfikatory kebab-case bez polskich znaków', () => {
    expect(KATALOG_STYLOW.length).toBeGreaterThanOrEqual(14);
    const darmowe = KATALOG_STYLOW.filter((s) => !s.pro);
    expect(darmowe.length).toBeGreaterThanOrEqual(5);
    expect(darmowe.length).toBeLessThanOrEqual(7);
    for (const s of KATALOG_STYLOW) expect(s.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(new Set(KATALOG_STYLOW.map((s) => s.id)).size).toBe(KATALOG_STYLOW.length);
  });

  it('style odwołują się wyłącznie do istniejących fontów, wariantów i efektów; style darmowe tylko do darmowych', async () => {
    const { czyFontWKatalogu } = await import('../style/katalog-stylow.ts');
    for (const s of KATALOG_STYLOW) {
      expect(s.pary.length).toBeGreaterThanOrEqual(2);
      expect(s.pary.length).toBeLessThanOrEqual(3);
      for (const p of s.pary) for (const f of [p.naglowki, p.tekst, p.akcent].filter(Boolean)) expect(czyFontWKatalogu(f!), `${s.id}: ${f}`).toBe(true);
      for (const [typ, lista] of Object.entries(s.warianty)) {
        for (const id of lista!) {
          const w = KATALOG_WARIANTOW[typ as keyof typeof KATALOG_WARIANTOW].find((x) => x.id === id);
          expect(w, `${s.id}: ${typ}/${id}`).toBeDefined();
          if (!s.pro) expect(w!.pro ?? false, `${s.id}: ${id}`).toBe(false);
        }
      }
      for (const e of s.efekty) {
        expect(KATALOG_EFEKTOW.some((x) => x.id === e), `${s.id}: ${e}`).toBe(true);
        if (!s.pro) expect(EFEKTY_PRO.has(e), `${s.id}: ${e}`).toBe(false);
      }
      if (s.pro) {
        expect(s.zastepczy).toBeDefined();
        expect(stylPoId(s.zastepczy!)?.pro).toBe(false);
      }
    }
  });
});
