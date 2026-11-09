import { describe, expect, it } from 'vitest';
import { JEZYKI } from '../jezyki.ts';
import type { StronaWejscie } from '../model.ts';
import { PRZYKLAD_SALON_EN } from '../przyklady/salon-en.ts';
import { ADRES, plik, render, tekst, znaczniki } from './testy.pomoc.ts';
import { dataWJezyku, kwota, TEKSTY } from './teksty.ts';

/** Salon z wersją angielską i podstroną „cennik” bez tłumaczenia. */
function zCennikiem(): StronaWejscie {
  const w = structuredClone(PRZYKLAD_SALON_EN);
  w.strony.splice(1, 0, { ...structuredClone(w.strony[0]!), slug: 'cennik', tytul: 'Cennik' });
  return w;
}

const alternatywy = (html: string) =>
  znaczniki(html)
    .filter((t) => t.nazwa === 'link' && t.atr.rel === 'alternate')
    .map((t) => `${t.atr.hreflang} ${t.atr.href}`);

describe('wersje językowe – renderer', () => {
  it('pliki wersji pod /en/, <html lang> w języku podstrony', () => {
    const w = render(PRZYKLAD_SALON_EN, 'pro');
    expect(w.pliki.map((p) => p.sciezka)).toContain('en/index.html');
    expect(plik(w, 'index.html')).toContain('<html lang="pl"');
    expect(plik(w, 'en/index.html')).toContain('<html lang="en"');
    expect(plik(w, '404.html')).toContain('<html lang="pl"');
  });

  it('hreflang między wersjami tej samej podstrony + x-default = język główny; bez linku do nieistniejącego tłumaczenia', () => {
    const w = render(zCennikiem(), 'pro');
    const oczekiwane = [`pl ${ADRES}/`, `en ${ADRES}/en/`, `x-default ${ADRES}/`];
    expect(alternatywy(plik(w, 'index.html'))).toEqual(oczekiwane);
    expect(alternatywy(plik(w, 'en/index.html'))).toEqual(oczekiwane);
    // „cennik” nie ma wersji angielskiej – bez hreflang (nie linkujemy do 404).
    expect(alternatywy(plik(w, 'cennik/index.html'))).toEqual([]);
  });

  it('x-default wskazuje wersję w języku głównym także z podstrony angielskiej z przetłumaczonym adresem', () => {
    const m = zCennikiem();
    m.strony.push({ ...structuredClone(m.strony[2]!), slug: 'en/prices', klucz: 'cennik', tytul: 'Prices' });
    const w = render(m, 'pro');
    const oczekiwane = [`pl ${ADRES}/cennik/`, `en ${ADRES}/en/prices/`, `x-default ${ADRES}/cennik/`];
    expect(alternatywy(plik(w, 'en/prices/index.html'))).toEqual(oczekiwane);
    expect(alternatywy(plik(w, 'cennik/index.html'))).toEqual(oczekiwane);
  });

  it('przełącznik języka: linki z lang i hreflang, nazwy w swoim języku, bieżący język oznaczony; na telefonie w menu', () => {
    const html = plik(render(zCennikiem(), 'pro'), 'en/index.html');
    const nag = html.slice(html.indexOf('<header class="naglowek'), html.indexOf('</header>'));
    const linki = znaczniki(nag).filter((t) => t.nazwa === 'a' && t.atr.hreflang);
    // Skróty w nagłówku + pełne nazwy w menu telefonu: po dwa linki na język.
    expect(linki.map((t) => `${t.atr.lang}:${t.atr.hreflang}:${t.atr.href}`)).toEqual(['pl:pl:../', 'en:en:../en/', 'pl:pl:../', 'en:en:../en/']);
    expect(linki.filter((t) => 'aria-current' in t.atr).map((t) => t.atr.lang)).toEqual(['en', 'en']);
    expect(nag).toContain('<ul class="jez-nag" aria-label="Language">');
    expect(nag).toMatch(/<nav class="nav"[^>]*>.*<ul class="jez-menu" aria-label="Language">.*Polski.*English/);
    expect(nag).toContain('class="naglowek przyklejony z-menu"');
    // Z podstrony bez tłumaczenia przełącznik prowadzi do strony głównej wersji angielskiej.
    const cennik = plik(render(zCennikiem(), 'pro'), 'cennik/index.html');
    expect(znaczniki(cennik).find((t) => t.nazwa === 'a' && t.atr.hreflang === 'en')?.atr.href).toBe('../en/');
  });

  it('strona jednojęzyczna: bez przełącznika i bez modułu CSS przełącznika', () => {
    const w = render({ ...structuredClone(PRZYKLAD_SALON_EN), jezykiDodatkowe: [], strony: structuredClone(PRZYKLAD_SALON_EN.strony.slice(0, 1)) }, 'pro');
    expect(plik(w, 'index.html')).not.toContain('jez-nag');
    expect(plik(w, 'assets/styl.css')).not.toContain('.jez-nag');
    expect(plik(render(PRZYKLAD_SALON_EN, 'pro'), 'assets/styl.css')).toContain('.jez-nag');
  });

  it('nawigacja i stopka w języku podstrony; teksty systemowe po angielsku', () => {
    const html = plik(render(PRZYKLAD_SALON_EN, 'pro', { adresFormularza: 'https://api.verris.test/kreator/formularz/x' }), 'en/index.html');
    const t = tekst(html);
    expect(t).toContain('Skip to content');
    expect(t).toContain('Services and prices');
    expect(t).not.toContain('Usługi i ceny');
    expect(t).toContain('An intimate hair salon in Jezyce');
    expect(t).toContain('Opening hours');
    expect(t).toContain('Monday–Friday');
    expect(t).toContain('Made with');
    expect(t).toContain('I agree to the processing of the data');
    expect(t).toContain('Privacy policy');
    expect(t).not.toMatch(/Przejdź do treści|Wyrażam zgodę|Godziny otwarcia|Stworzone w|Zadzwoń/);
    // Komunikaty po wysyłce w języku podstrony (skrypt czyta je z atrybutów formularza) i pole języka dla API.
    const form = znaczniki(html).find((x) => x.nazwa === 'form')!;
    expect(form.atr['data-ok']).toBe(TEKSTY.en.formOk);
    expect(form.atr['data-blad']).toBe(TEKSTY.en.formBlad);
    expect(znaczniki(html).find((x) => x.atr.name === 'jezyk')?.atr.value).toBe('en');
    // Logo i kotwice menu prowadzą do angielskiej strony głównej.
    expect(znaczniki(html).find((x) => x.nazwa === 'a' && x.atr.class === 'logo')?.atr.href).toBe('../en/');
  });

  it('kotwica z podstrony w wersji językowej prowadzi do strony głównej tej wersji', () => {
    const m = zCennikiem();
    const sekcja = { id: 'o-cenach', typ: 'onas', wariant: 'onas-manifest', dane: { naglowek: 'About our prices', akapity: ['Prices include a consultation.'] } };
    m.strony.splice(1, 1, { slug: 'cennik', tytul: 'Cennik', sekcje: [{ ...sekcja, dane: { naglowek: 'O cenach', akapity: ['Ceny obejmują konsultację.'] } }] } as never);
    m.strony.push({ slug: 'en/prices', klucz: 'cennik', jezyk: 'en', tytul: 'Prices', sekcje: [sekcja] } as never);
    const html = plik(render(m, 'pro'), 'en/prices/index.html');
    const menu = znaczniki(html.slice(html.indexOf('<nav class="nav"'), html.indexOf('</nav>'))).filter((x) => x.nazwa === 'a' && !x.atr.hreflang);
    expect(menu.map((x) => `${x.atr.href}`)).toEqual(['../../en/#uslugi', '../../en/#galeria', '../../en/#kontakt', '../../en/prices/']);
    // Okruszki: strona główna wersji angielskiej.
    expect(html).toContain('<nav class="okruszki" aria-label="Breadcrumbs"><ol><li><a href="../../en/">Home</a>');
  });

  it('skrypt strony nie ma tekstów po polsku – komunikaty i etykiety z atrybutów strony', () => {
    const js = plik(render(PRZYKLAD_SALON_EN, 'pro', { adresFormularza: 'https://api.verris.test/kreator/formularz/x' }), 'assets/kreator.js');
    expect(js).not.toMatch(/Dziękujemy|Nie udało się|Powiększone|Zamknij/);
    expect(js).toContain("getAttribute(ok ? 'data-ok' : 'data-blad')");
  });

  it('sitemap: xhtml:link alternates do istniejących wersji + x-default', () => {
    const sm = plik(render(zCennikiem(), 'pro'), 'sitemap.xml');
    expect(sm).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    const glowna = sm.slice(sm.indexOf(`<loc>${ADRES}/</loc>`));
    expect(glowna.slice(0, glowna.indexOf('</url>'))).toContain(
      `<xhtml:link rel="alternate" hreflang="pl" href="${ADRES}/"/><xhtml:link rel="alternate" hreflang="en" href="${ADRES}/en/"/><xhtml:link rel="alternate" hreflang="x-default" href="${ADRES}/"/>`,
    );
    const cennik = sm.slice(sm.indexOf(`<loc>${ADRES}/cennik/</loc>`));
    expect(cennik.slice(0, cennik.indexOf('</url>'))).not.toContain('xhtml:link');
  });

  it('JSON-LD: WebSite z językami witryny, WebPage z inLanguage podstrony', () => {
    const html = plik(render(PRZYKLAD_SALON_EN, 'pro'), 'en/index.html');
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1]!) as { '@graph': Record<string, unknown>[] };
    expect(ld['@graph'].find((x) => x['@type'] === 'WebSite')?.inLanguage).toEqual(['pl', 'en']);
    expect(ld['@graph'].find((x) => x['@type'] === 'WebPage')?.inLanguage).toBe('en');
    expect(html).toContain('<meta property="og:locale" content="en_GB">');
  });

  it('bez Pro wersja angielska nie jest publikowana (brak plików, przełącznika i hreflang)', () => {
    const w = render(PRZYKLAD_SALON_EN, 'hosting');
    expect(w.pliki.map((p) => p.sciezka)).not.toContain('en/index.html');
    expect(plik(w, 'index.html')).not.toContain('hreflang');
    expect(w.ostrzezenia).toContain('Wersje językowe nieopublikowane (Kreator Pro)');
  });
});

describe('słownik tekstów systemowych', () => {
  it('każdy język ma komplet niepustych tekstów, bez pauzy „—”', () => {
    const klucze = Object.keys(TEKSTY.pl).sort();
    for (const j of JEZYKI) {
      expect(Object.keys(TEKSTY[j]).sort(), j).toEqual(klucze);
      for (const [k, v] of Object.entries(TEKSTY[j])) {
        const wartosci = Array.isArray(v) ? v : [v];
        for (const x of wartosci) {
          expect(typeof x === 'string' && x.trim().length > 0, `${j}.${k}`).toBe(true);
          expect(x, `${j}.${k}`).not.toContain('—');
        }
        if (Array.isArray(v)) expect(v.length, `${j}.${k}`).toBe((TEKSTY.pl as unknown as Record<string, unknown[]>)[k]!.length);
      }
      expect(TEKSTY[j].zgoda, j).toContain('{firma}');
      expect(TEKSTY[j].szczegolyPolityki, j).toContain('{link}');
    }
  });

  it('kwoty i daty w formacie języka', () => {
    expect(kwota(1299.5, 'pl')).toBe('1 299,50 zł');
    expect(kwota(1299.5, 'en')).toBe('1,299.50 PLN');
    expect(kwota(1299, 'de')).toBe('1.299 PLN');
    expect(kwota(110, 'uk')).toBe('110 PLN');
    expect(dataWJezyku('2026-11-01', 'pl')).toBe('1 listopada 2026');
    expect(dataWJezyku('2026-11-01', 'en')).toBe('1 November 2026');
    expect(dataWJezyku('2026-11-01', 'de')).toBe('1. November 2026');
    expect(dataWJezyku('2026-11-01', 'uk')).toBe('1 листопада 2026');
  });
});
