import { KATALOG_WARIANTOW } from '../katalog.ts';
import type { StronaWejscie } from '../model.ts';
import { WERSJE_KREATORA } from '../plany.ts';
import { ADRES, htmle, model, odEncji, PRZYKLADY, render, tekst, wszystkieWarianty, znaczniki, zeZdjeciami } from './testy.pomoc.ts';
import { opisStrony, tytulStrony } from './seo.ts';
import { sierotki } from './sekcje/wspolne.ts';
import type { KontekstStrony } from './kontekst.ts';

/** Hosty, do których wolno linkować (<a href>); zasoby (src, link, url()) – tylko lokalne albo adres strony. */
const HOST_STRONY = new URL(ADRES).host;
const HOSTY_LINKOW = new Set([HOST_STRONY, 'verris.pl', 'www.google.com']);

function hostZ(url: string): string | null {
  return /^(https?:)?\/\//i.test(url) ? new URL(url, ADRES).host : null;
}

const WARIANTY = Object.values(KATALOG_WARIANTOW).flatMap((l) => l.map((w) => w.id));
const MODELE: Record<string, StronaWejscie> = { ...PRZYKLADY, 'wszystkie warianty': wszystkieWarianty() };

describe.each(Object.keys(MODELE))('fikstura %s', (nazwa) => {
  const wejscia = { zwykla: MODELE[nazwa]!, 'ze zdjęciami': zeZdjeciami(MODELE[nazwa]!) };

  describe.each(WERSJE_KREATORA)('wersja %s', (wersja) => {
    it.each(Object.keys(wejscia))('renderuje się bez wyjątku i każdy plik spełnia zasady (%s)', (rodzaj) => {
      const wej = wejscia[rodzaj as keyof typeof wejscia];
      const wynik = render(wej, wersja);
      const strona = model(wej);
      const pliki = htmle(wynik);
      expect(pliki.map((p) => p.sciezka)).toContain('index.html');
      expect(pliki.map((p) => p.sciezka)).toContain('404.html');

      for (const p of wynik.pliki) {
        expect(p.tresc, `${p.sciezka}: pauza „—”`).not.toContain('—');
        expect(p.tresc.toLowerCase(), `${p.sciezka}: javascript:`).not.toContain('javascript:');
        expect(p.tresc, `${p.sciezka}: zewnętrzne fonty/CDN`).not.toMatch(/googleapis|gstatic|cdnjs|jsdelivr|unpkg|cdn\./i);
      }
      const css = wynik.pliki.find((p) => p.sciezka === 'assets/styl.css')!.tresc;
      for (const m of css.matchAll(/url\(\s*["']?([^"')]+)/g)) expect(hostZ(m[1]!), `CSS url(${m[1]})`).toBeNull();
      expect(css).not.toMatch(/@import/);

      const idGlownej = new Set(znaczniki(pliki.find((p) => p.sciezka === 'index.html')!.tresc).map((t) => t.atr.id));
      for (const { sciezka, tresc } of pliki) {
        const tagi = znaczniki(tresc);
        const idTutaj = new Set(tagi.map((t) => t.atr.id));
        // kotwice nie prowadzą donikąd (np. do sekcji Pro usuniętej w hosting)
        for (const a of tagi.filter((t) => t.nazwa === 'a')) {
          const m = /^(\.\/|(?:\.\.\/)+|\/)?#(.+)$/.exec(a.atr.href ?? '');
          if (!m) continue;
          const zbior = m[1] ? idGlownej : idTutaj;
          expect(zbior.has(m[2]), `${nazwa}/${wersja}/${sciezka}: martwa kotwica ${a.atr.href}`).toBe(true);
        }
        const kto = `${nazwa}/${wersja}/${sciezka}`;
        expect(tresc.match(/<h1[\s>]/g)?.length ?? 0, `${kto}: liczba h1`).toBe(1);
        expect(tresc, kto).toMatch(/^<!doctype html>\n<html lang="pl"/);
        expect(tresc, kto).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');

        // title i description z modelu (404 – własny tytuł, opis strony głównej)
        const tytul = odEncji(tresc.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
        const opis = odEncji(tagi.find((t) => t.nazwa === 'meta' && t.atr.name === 'description')?.atr.content ?? '');
        if (sciezka === '404.html') {
          expect(tytul).toBe(`Nie znaleziono strony – ${strona.firma.nazwa}`);
          expect(opis).toBe(strona.seo.opis);
        } else {
          const slug = sciezka.replace(/\/?index\.html$/, '');
          const p = strona.strony.find((x) => x.slug === slug)!;
          const s = { strona } as KontekstStrony;
          expect(tytul, kto).toBe(tytulStrony(s, p));
          expect(opis, kto).toBe(opisStrony(s, p));
          if (!slug) expect(tytul).toBe(strona.seo.tytul);
        }

        for (const t of tagi) {
          for (const [atr, wartosc] of Object.entries(t.atr)) {
            expect(atr.startsWith('on'), `${kto}: atrybut ${atr} w <${t.nazwa}>`).toBe(false);
            if (atr !== 'href' && atr !== 'src' && atr !== 'srcset' && atr !== 'action') continue;
            const host = hostZ(wartosc);
            if (!host) continue;
            if (t.nazwa === 'a') expect(HOSTY_LINKOW.has(host), `${kto}: link do ${wartosc}`).toBe(true);
            else expect(host, `${kto}: zasób z ${wartosc}`).toBe(HOST_STRONY);
          }
          if (t.nazwa === 'img') expect('alt' in t.atr, `${kto}: <img> bez alt: ${t.surowy}`).toBe(true);
          if (t.nazwa === 'script') expect(t.atr.type === 'application/ld+json' || /assets\/kreator\.js$/.test(t.atr.src ?? ''), `${kto}: ${t.surowy}`).toBe(true);
        }

        // każde pole formularza ma <label for>
        const etykiety = new Set(tagi.filter((t) => t.nazwa === 'label').map((t) => t.atr.for));
        const pola = tagi.filter((t) => ['input', 'select', 'textarea'].includes(t.nazwa) && t.atr.type !== 'hidden');
        for (const pole of pola) {
          expect(pole.atr.id, `${kto}: pole bez id ${pole.surowy}`).toBeTruthy();
          expect(etykiety.has(pole.atr.id), `${kto}: pole bez etykiety ${pole.surowy}`).toBe(true);
        }
        // klasa wariantu tylko na <section> – ta sama klasa na liście wewnątrz rozkładała całą sekcję
        for (const t of tagi) {
          const klasy = (t.atr.class ?? '').split(' ');
          if (t.nazwa !== 'section') for (const w of WARIANTY) expect(klasy, `${kto}: klasa wariantu ${w} na <${t.nazwa}>`).not.toContain(w);
        }
        const ids = tagi.map((t) => t.atr.id).filter(Boolean);
        expect(new Set(ids).size, `${kto}: powtórzone id`).toBe(ids.length);
      }
    });
  });
});

describe('typografia', () => {
  it('jednoliterowe słowa nie zostają na końcu wiersza (twarda spacja), także w animowanym nagłówku', () => {
    expect(sierotki('Księgowość, o której i w domu (z kotem) a „u nas”')).toBe('Księgowość, o\u00a0której i\u00a0w\u00a0domu (z\u00a0kotem) a\u00a0„u\u00a0nas”');
    expect(sierotki('Wizyta w')).toBe('Wizyta w');
    const ksiegowa = render(PRZYKLADY.ksiegowa!, 'pro').pliki.find((p) => p.sciezka === 'index.html')!.tresc;
    expect(ksiegowa).toContain('Księgowość, o\u00a0której <em class="wyr">nie musisz myśleć.</em>');
    expect(ksiegowa).toContain('Porozmawiajmy o\u00a0Twojej firmie.');
    const studio = render(PRZYKLADY.studio!, 'pro').pliki.find((p) => p.sciezka === 'index.html')!.tresc;
    expect(studio).toContain('<span class="sl d1">w\u00a0których</span>');
    // w meta i JSON-LD tekst zostaje bez zmian
    expect(ksiegowa).toContain('<meta property="og:title" content="Księgowa Pod Ręką – biuro rachunkowe dla JDG">');
  });
});

describe('karuzele', () => {
  it('przyciski karuzeli są obok nagłówka sekcji (własny wiersz), nie wewnątrz <header>', () => {
    const html = render(wszystkieWarianty(), 'pro').pliki.find((p) => p.sciezka === 'wiecej/index.html')!.tresc;
    const galeria = html.slice(html.indexOf('<section id="galeria-karuzela"'));
    expect(galeria).toMatch(/^<section[^>]*><div class="kontener[^"]*"><div class="karuzela-glowa"><header class="glowa">[\s\S]*?<\/header><div class="karuzela-nav">/);
    const glowna = render(wszystkieWarianty(), 'pro').pliki.find((p) => p.sciezka === 'index.html')!.tresc;
    const opinie = glowna.slice(glowna.indexOf('<section id="opinie-karuzela"'));
    expect(opinie).toMatch(/^<section[^>]*><div class="kontener[^"]*"><div class="karuzela-glowa"><header class="glowa">[\s\S]*?<\/header><div class="karuzela-nav">/);
  });
});

describe('obrazy i formularze', () => {
  it('fikstura ze zdjęciami renderuje <img> z alt z modelu, wymiarami i lazy (poza pierwszym w hero)', () => {
    const html = render(zeZdjeciami(PRZYKLADY.studio!), 'pro').pliki.find((p) => p.sciezka === 'index.html')!.tresc;
    const img = znaczniki(html).filter((t) => t.nazwa === 'img');
    expect(img.length).toBeGreaterThan(5);
    expect(img[0]!.atr.alt).toBe('Jasny salon z drewnianą podłogą i lnianą sofą');
    expect(img[0]!.atr.fetchpriority).toBe('high');
    expect(img.slice(1).every((t) => t.atr.loading === 'lazy' && t.atr.width && t.atr.height)).toBe(true);
    expect(tekst(html)).not.toContain('Zdjęcie: salon z realizacji');
  });

  it('formularz ma zgodę z linkiem do polityki, honeypot i wymagane pola', () => {
    const html = render(PRZYKLADY.ceramika!, 'pro').pliki.find((p) => p.sciezka === 'index.html')!.tresc;
    const tagi = znaczniki(html);
    const zgoda = tagi.find((t) => t.nazwa === 'input' && t.atr.name === 'zgoda')!;
    expect('required' in zgoda.atr).toBe(true);
    expect(html).toMatch(/Administratorem danych jest Glina i Ogień\. Szczegóły w <a href="polityka-prywatnosci">polityce prywatności<\/a>/);
    expect(tagi.find((t) => t.nazwa === 'input' && t.atr.name === 'strona_www')!.atr.tabindex).toBe('-1');
    expect('required' in tagi.find((t) => t.atr.id === 'kontakt-email')!.atr).toBe(true);
    expect('required' in tagi.find((t) => t.atr.id === 'kontakt-telefon')!.atr).toBe(false);
  });
});
