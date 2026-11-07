import type { StronaWejscie } from '../model.ts';
import { WERSJE_KREATORA } from '../plany.ts';
import { plikFontu, ZAKRESY_FONTOW } from './fonty.ts';
import { bezRedukcjiRuchu, plik, PRZYKLADY, render, wszystkieWarianty, znaczniki } from './testy.pomoc.ts';

const MODELE: Record<string, StronaWejscie> = { ...PRZYKLADY, 'wszystkie warianty': wszystkieWarianty() };
const PARY = Object.keys(MODELE).flatMap((n) => WERSJE_KREATORA.map((w) => [n, w] as const));

interface RegulaFontu {
  rodzina: string;
  styl: string;
  waga: number;
  src: string;
  zakres: string;
}

function regulyFontow(css: string): RegulaFontu[] {
  return [...css.matchAll(/@font-face\{([^}]*)\}/g)].map((m) => {
    const d = m[1]!;
    return {
      rodzina: /font-family:'([^']+)'/.exec(d)![1]!,
      styl: /font-style:(\w+)/.exec(d)![1]!,
      waga: Number(/font-weight:(\d+)/.exec(d)![1]),
      src: /src:url\("([^"]+)"\) format\("woff2"\)/.exec(d)![1]!,
      zakres: /unicode-range:([^;}]+)/.exec(d)![1]!,
    };
  });
}

describe('fonty', () => {
  it.each(PARY)('%s / %s: @font-face tylko dla rodzin motywu, oba zakresy, ścieżki zgodne z plikFontu i wynik.fonty', (nazwa, wersja) => {
    const wynik = render(MODELE[nazwa]!, wersja);
    const css = plik(wynik, 'assets/styl.css');
    const reguly = regulyFontow(css);
    const motyw = MODELE[nazwa]!.motyw.fonty;
    const rodziny = new Set([motyw.naglowki, motyw.tekst, motyw.akcent].filter(Boolean));
    expect(new Set(reguly.map((r) => r.rodzina))).toEqual(rodziny);
    expect(new Set(wynik.fonty.map((f) => f.rodzina))).toEqual(rodziny);

    // każda reguła ↔ dokładnie jedna odmiana z wynik.fonty × zakres
    const oczekiwane = wynik.fonty.flatMap((f) =>
      f.wagi.flatMap((w) =>
        (f.kursywa ? [false, true] : [false]).flatMap((k) =>
          (Object.keys(ZAKRESY_FONTOW) as (keyof typeof ZAKRESY_FONTOW)[]).map((z) => `${f.rodzina}|${k ? 'italic' : 'normal'}|${w}|../assets/fonty/${plikFontu(f.rodzina, w, k, z)}|${ZAKRESY_FONTOW[z]}`),
        ),
      ),
    );
    expect(reguly.map((r) => `${r.rodzina}|${r.styl}|${r.waga}|${r.src}|${r.zakres}`).sort()).toEqual(oczekiwane.sort());
    for (const r of reguly) expect(r.src).toMatch(/-(latin|latin-ext)\.woff2$/);
    expect(css).toContain('font-display:swap');

    // preload nagłówków wskazuje plik, który ma regułę (latin), z prefiksem podstrony
    const html = plik(wynik, 'index.html');
    const preload = znaczniki(html).find((t) => t.atr.rel === 'preload')!;
    expect(preload.atr.as).toBe('font');
    expect(reguly.map((r) => r.src.replace('../', ''))).toContain(preload.atr.href);
    expect(preload.atr.href).toMatch(/-latin\.woff2$/);
  });

  it('wagi i kursywa pochodzą z KATALOG_FONTOW, a style używają tylko wag z wynik.fonty', () => {
    const ksiegowa = render(PRZYKLADY.ksiegowa!, 'pro');
    expect(ksiegowa.fonty).toEqual([
      { rodzina: 'Space Grotesk', wagi: [500], kursywa: false },
      { rodzina: 'Inter', wagi: [400, 600], kursywa: false },
    ]);
    const ceramika = render(PRZYKLADY.ceramika!, 'pro');
    expect(ceramika.fonty).toEqual([
      { rodzina: 'DM Serif Display', wagi: [400], kursywa: true },
      { rodzina: 'DM Sans', wagi: [400, 500], kursywa: false },
    ]);
    // pogrubienia przez zmienną --w-b (500 w DM Sans), nie na sztywno 700 – bez sztucznego pogrubiania
    const css = plik(ceramika, 'assets/styl.css');
    expect(css).toContain('--w-b:500');
    expect(css.replace(/@font-face\{[^}]*\}/g, '')).not.toMatch(/font-weight:\s*(700|800|900|bold)/);
  });

  it('podstrona i 404 ładują fonty i arkusz ze ścieżek względnych do korzenia', () => {
    const wynik = render(PRZYKLADY.studio!, 'pro');
    const wpis = plik(wynik, 'blog/mala-kuchnia-bez-kompromisow/index.html');
    expect(wpis).toContain('<link rel="preload" href="../../assets/fonty/instrument-serif-400-latin.woff2"');
    expect(wpis).toContain('<link rel="stylesheet" href="../../assets/styl.css">');
    expect(wpis).toContain('<script src="../../assets/kreator.js" defer></script>');
    const blad = plik(wynik, '404.html');
    expect(blad).toContain('href="/assets/fonty/instrument-serif-400-latin.woff2"');
    expect(blad).toContain('<link rel="stylesheet" href="/assets/styl.css">');
  });

  it('podgląd z bezwzględną bazą fontów (proxy) wstawia pełne adresy', () => {
    const baza = 'https://panel.verris.pl/api/fonty/';
    const wynik = render(PRZYKLADY.studio!, 'pro', { tryb: 'podglad', bazaFontow: baza });
    const reguly = regulyFontow(plik(wynik, 'assets/styl.css'));
    expect(reguly.every((r) => r.src.startsWith('https://panel.verris.pl/api/fonty/') && !r.src.includes('fonty//'))).toBe(true);
    expect(plik(wynik, 'index.html')).toContain('href="https://panel.verris.pl/api/fonty/instrument-serif-400-latin.woff2"');
  });
});

describe('CSS', () => {
  it.each(PARY)('%s / %s: !important tylko w prefers-reduced-motion, media queries mobile-first', (nazwa, wersja) => {
    const css = plik(render(MODELE[nazwa]!, wersja), 'assets/styl.css');
    const { reszta, bloki } = bezRedukcjiRuchu(css);
    expect(bloki).toHaveLength(1);
    expect(reszta).not.toContain('!important');
    const warunki = [...reszta.matchAll(/@media([^{]+)\{/g)].map((m) => m[1]!.trim());
    expect(warunki.length).toBeGreaterThan(0);
    for (const w of warunki) expect(w, `@media ${w}`).toMatch(/^\(min-width:\s*\d+px\)$/);
    expect(reszta).not.toMatch(/max-width:\s*[\d.]+px\)/);
    for (const m of reszta.matchAll(/@container([^{]+)\{/g)) expect(m[1]!.trim()).toMatch(/^\(min-width:[\d.]+rem\)$/);
  });

  it('prefers-reduced-motion wyłącza animacje, przejścia, płynne przewijanie i każdą animację ciągłą', () => {
    const css = plik(render(wszystkieWarianty(), 'pro'), 'assets/styl.css');
    const { reszta, bloki } = bezRedukcjiRuchu(css);
    const ruch = bloki[0]!;
    expect(ruch).toContain('*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;animation-delay:0s!important;transition-duration:.01ms!important}');
    expect(ruch).toContain('html.plynnie{scroll-behavior:auto}');
    expect(ruch).toMatch(/\.js-anim \.pojaw\{opacity:1!important;transform:none!important\}/);
    expect(ruch).toContain('.postep{display:none}');

    const wylaczone = new Set(
      [...ruch.matchAll(/([^{}]+)\{[^}]*animation:none!important[^}]*\}/g)].flatMap((m) => m[1]!.split(',').map((x) => x.trim())),
    );
    // animacje nieskończone i sterowane przewijaniem (taśma, paralaksa) muszą mieć jawne wyłączenie
    const ciagle = [...reszta.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => /infinite|animation-timeline:view/.test(m[2]!));
    expect(ciagle.length).toBeGreaterThanOrEqual(2);
    for (const m of ciagle) {
      for (const sel of m[1]!.split(',').map((x) => x.trim().replace(/^\.ef-[a-z-]+ /, ''))) expect(wylaczone, sel).toContain(sel);
    }
  });

  it('pas produktów na telefonie (karuzela) przechodzi w siatkę od 640 px', () => {
    const css = plik(render(PRZYKLADY.ceramika!, 'pro'), 'assets/styl.css');
    expect(css).toContain('.produkty-kafle.mob-tor{display:flex;overflow-x:auto');
    expect(css).toMatch(/@media \(min-width:640px\)\{\.produkty-kafle\.mob-tor\{display:grid/);
    expect(plik(render(PRZYKLADY.ceramika!, 'pro'), 'index.html')).toContain('<ul class="produkty-kafle mob-tor">');
  });

  it('dołącza tylko moduły użytych wariantów i efektów', () => {
    const css = plik(render(PRZYKLADY.ksiegowa!, 'pro'), 'assets/styl.css');
    expect(css).toContain('.pakiety{');
    expect(css).not.toContain('.mozaika{');
    expect(css).not.toContain('.produkty-kafle{');
    expect(css).not.toContain('@keyframes tasma');
    expect(css).not.toContain('.lightbox{');
  });
});

describe('JS', () => {
  const MINIMALNY: StronaWejscie = {
    ...structuredClone(PRZYKLADY.ksiegowa!),
    motyw: { ...structuredClone(PRZYKLADY.ksiegowa!.motyw), efekty: [], animacje: 'brak' },
    strony: [{ slug: '', tytul: 'Start', sekcje: [{ id: 'start', typ: 'hero', wariant: 'hero-centralny', dane: { naglowek: 'Strona bez skryptów' } }] }],
  };

  it('strona bez menu i efektów nie dostaje skryptu', () => {
    const wynik = render(MINIMALNY, 'pro');
    expect(wynik.pliki.map((p) => p.sciezka)).not.toContain('assets/kreator.js');
    expect(plik(wynik, 'index.html')).not.toContain('<script src');
    expect(plik(wynik, '404.html')).not.toContain('<script src');
  });

  it('skrypt zawiera tylko moduły potrzebne stronie', () => {
    const ksiegowa = plik(render(PRZYKLADY.ksiegowa!, 'pro'), 'assets/kreator.js');
    expect(ksiegowa).toContain('// Menu mobilne');
    expect(ksiegowa).toContain('// Przyklejony nagłówek');
    expect(ksiegowa).toContain('// Płynne pojawianie');
    expect(ksiegowa).not.toContain('// Karuzele');
    expect(ksiegowa).not.toContain('// Powiększanie zdjęć');
    expect(ksiegowa).not.toContain('// Postęp czytania');

    // lightbox tylko przy prawdziwych zdjęciach (ramki zastępcze nie mają czego powiększać)
    const studio = plik(render(PRZYKLADY.studio!, 'pro'), 'assets/kreator.js');
    expect(studio).toContain('// Karuzele');
    expect(studio).toContain('// Postęp czytania');
    expect(studio).not.toContain('// Powiększanie zdjęć');
  });

  it.each(PARY)('%s / %s: bez eval, Function, innerHTML i danych z modelu w skrypcie', (nazwa, wersja) => {
    const wynik = render(MODELE[nazwa]!, wersja);
    const js = wynik.pliki.find((p) => p.sciezka === 'assets/kreator.js')?.tresc ?? '';
    expect(js).not.toMatch(/\beval\s*\(|new Function|\binnerHTML\b|outerHTML|insertAdjacentHTML|document\.write|setTimeout\(\s*['"]/);
    expect(js).not.toContain(MODELE[nazwa]!.firma.nazwa);
    if (js) {
      expect(js).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
      expect(() => new Function(js)).not.toThrow(); // poprawna składnia
    }
  });
});
