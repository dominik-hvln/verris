import { KATALOG_WARIANTOW } from '../katalog.ts';
import type { StronaWejscie, TypSekcji } from '../model.ts';
import { PRZYKLAD_SALON } from '../przyklady/salon.ts';
import { DATA, model, wszystkieWarianty } from '../render/testy.pomoc.ts';
import { przestrzenNazwCss, przeksztalcSelektory } from './css.ts';
import { parsujHtml, htmlWezlow } from './html.ts';
import { celeCms, eksportujDoCms, fontyEksportu, FUNCTIONS_PHP, parsujBloki, splaszcz, TOKEN_MEDIUM, TOKEN_STRONY, type EksportCms } from './index.ts';
import { skryptFormularza } from './wordpress/motyw.ts';

const FORMULARZ = 'https://api.verris.pl/kreator/formularz/token-testowy';

function eksport(w: StronaWejscie, wersja: 'hosting' | 'pro' = 'pro', brakujace: string[] = []): EksportCms {
  return eksportujDoCms(model(w), 'wordpress', { wersja, adresFormularza: FORMULARZ, dataGeneracji: DATA, brakujaceFonty: brakujace });
}

/** Każdy obraz modelu jako zdjęcie z biblioteki (zasobId) – eksport ma je zaimportować do mediów. */
function zZasobami(w: StronaWejscie): StronaWejscie {
  const kopia = structuredClone(w);
  let n = 0;
  const odwiedz = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(odwiedz);
    if (!x || typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    if (typeof o.alt === 'string' && ('podpis' in o || 'proporcje' in o || 'opisDoWyszukania' in o || Object.keys(o).length === 1)) {
      o.zrodlo = 'wlasne';
      o.zasobId = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
      o.szerokosc = 2400;
      o.wysokosc = 1600;
    }
    Object.values(o).forEach(odwiedz);
  };
  odwiedz(kopia);
  return kopia;
}

const plikMotywu = (e: EksportCms, sciezka: string) => {
  const p = e.motyw.pliki.find((x) => x.sciezka === sciezka);
  if (!p) throw new Error(`brak ${sciezka}`);
  return p.tresc;
};

/** Wszystkie zapisy bloków eksportu: treść stron, części i szablony motywu. */
function zapisyBlokow(e: EksportCms): { gdzie: string; zapis: string }[] {
  return [
    ...e.strony.map((s) => ({ gdzie: `strona ${s.slug || '/'}`, zapis: s.tresc })),
    ...e.motyw.pliki.filter((p) => p.sciezka.endsWith('.html')).map((p) => ({ gdzie: p.sciezka, zapis: p.tresc })),
  ];
}

describe('eksport do WordPressa – zapis bloków', () => {
  it('parser bloków odrzuca niesparowany komentarz, zły JSON i komentarz wp: w złym formacie', () => {
    expect(() => parsujBloki('<!-- wp:group --><div></div>')).toThrow(/niezamknięty/);
    expect(() => parsujBloki('<!-- wp:group {"a":} --><div></div><!-- /wp:group -->')).toThrow(/JSON/);
    expect(() => parsujBloki('<!-- /wp:group -->')).toThrow(/zamknięcie/);
    expect(() => parsujBloki('<!--wp:group--><div></div>')).toThrow(/formacie/);
    expect(parsujBloki('<!-- wp:paragraph {"className":"x"} --><p class="x">a</p><!-- /wp:paragraph -->')[0]!.atrybuty).toEqual({ className: 'x' });
  });

  it('wszystkie warianty wszystkich sekcji: bloki sparowane, atrybuty to poprawny JSON, tylko bloki core', () => {
    const e = eksport(zZasobami(wszystkieWarianty()));
    for (const { gdzie, zapis } of zapisyBlokow(e)) {
      let bloki;
      try {
        bloki = splaszcz(parsujBloki(zapis));
      } catch (err) {
        throw new Error(`${gdzie}: ${(err as Error).message}`, { cause: err });
      }
      for (const b of bloki) expect(b.nazwa, gdzie).toMatch(/^[a-z-]+$/);
    }
  });

  it('pokrycie katalogu: każdy typ i wariant sekcji ma grupę z klasami sekcji i wariantu (bez sekcji pominiętej po cichu)', () => {
    const w = zZasobami(wszystkieWarianty());
    const e = eksport(w);
    const bloki = splaszcz(e.strony.flatMap((s) => parsujBloki(s.tresc)));
    const sekcje = bloki.filter((b) => b.nazwa === 'group' && b.atrybuty.tagName === 'section');
    for (const [typ, warianty] of Object.entries(KATALOG_WARIANTOW) as [TypSekcji, { id: string }[]][]) {
      for (const wariant of warianty) {
        const s = sekcje.find((b) => String(b.atrybuty.className).split(' ').includes(`vk-${wariant.id}`));
        expect(s, `${typ}/${wariant.id}`).toBeDefined();
        expect(String(s!.atrybuty.className).split(' ')).toEqual(expect.arrayContaining(['vk', 'vk-sek', `vk-sek-${typ}`]));
        expect(s!.atrybuty.anchor).toBe(wariant.id);
      }
    }
  });

  it('mapowanie na bloki core: hero → nagłówek h1, FAQ → szczegóły, cennik → kolumny, galeria → galeria, formularz → HTML z adresem Verris', () => {
    const e = eksport(zZasobami(wszystkieWarianty()));
    const glowna = splaszcz(parsujBloki(e.strony.find((s) => s.glowna)!.tresc));
    const wiecej = splaszcz(parsujBloki(e.strony.find((s) => s.slug === 'wiecej')!.tresc));
    expect(glowna.filter((b) => b.nazwa === 'heading' && b.atrybuty.level === 1)).toHaveLength(1);
    const faq = glowna.filter((b) => b.nazwa === 'details');
    expect(faq.length).toBeGreaterThanOrEqual(2);
    expect(faq[0]!.html).toContain('<summary>Pytanie 1?</summary>');
    expect(faq[0]!.atrybuty.showContent).toBe(true);
    const kolumny = glowna.find((b) => b.nazwa === 'columns' && String(b.atrybuty.className).includes('vk-pakiety'));
    expect(kolumny?.dzieci.filter((d) => d.nazwa === 'column')).toHaveLength(3);
    const galerie = wiecej.filter((b) => b.nazwa === 'gallery');
    expect(galerie.length).toBeGreaterThan(0);
    for (const g of galerie) expect(g.dzieci.every((d) => d.nazwa === 'image')).toBe(true);
    const formularze = glowna.filter((b) => b.nazwa === 'html' && b.html.includes('<form'));
    expect(formularze.length).toBeGreaterThan(0);
    for (const f of formularze) {
      expect(f.html).toContain(`action="${FORMULARZ}"`);
      expect(f.html).toContain('method="post"');
      expect(f.html).toContain('class="vk-formularz');
    }
    expect(glowna.some((b) => b.nazwa === 'buttons' && b.dzieci.some((d) => d.nazwa === 'button'))).toBe(true);
    expect(glowna.some((b) => b.nazwa === 'paragraph')).toBe(true);
    // Bez formularza ze strony (brak adresu) – formularz wyłączony jak w podglądzie, bez akcji.
    const bez = eksportujDoCms(model(wszystkieWarianty()), 'wordpress', { wersja: 'pro', dataGeneracji: DATA });
    expect(bez.strony.map((s) => s.tresc).join('')).not.toContain('action=');
    expect(bez.motyw.pliki.some((p) => p.sciezka === 'assets/js/kreator.js')).toBe(false);
  });

  it('zdjęcia z biblioteki → tokeny mediów w core/image i lista mediów z wariantem jpg do 1600 px', () => {
    const e = eksport(zZasobami(PRZYKLAD_SALON));
    const tresc = e.strony.map((s) => s.tresc).join('');
    const tokeny = new Set([...tresc.matchAll(/verris-kreator:\/\/media\/([0-9a-f-]{36})/g)].map((m) => m[1]));
    expect(tokeny.size).toBeGreaterThan(0);
    expect(new Set(e.media.map((m) => m.zasobId))).toEqual(tokeny);
    for (const m of e.media) {
      expect(m.plikPublikacji).toBe(`assets/img/${m.zasobId}-1600.jpg`);
      expect(m.nazwaPliku).toBe(`${m.zasobId}.jpg`);
    }
    const obrazy = splaszcz(parsujBloki(tresc)).filter((b) => b.nazwa === 'image');
    for (const o of obrazy) expect(o.html).toMatch(new RegExp(`<img src="${TOKEN_MEDIUM}[0-9a-f-]{36}" alt="`));
    // Bez warstw <picture>/srcset strony statycznej – WordPress robi własne rozmiary.
    expect(tresc).not.toContain('<picture');
  });

  it('linki do podstron i kotwic → tokeny stron; części motywu prowadzą do strony głównej', () => {
    const w = structuredClone(PRZYKLAD_SALON) as StronaWejscie;
    w.strony = [...w.strony, { slug: 'o-nas', tytul: 'O nas', sekcje: [{ id: 'cta', typ: 'cta', wariant: 'cta-pasek', dane: { naglowek: 'Zapraszamy', przyciski: [{ etykieta: 'Kontakt', cel: '/#kontakt' }] } }] }];
    const e = eksport(w, 'hosting');
    const onas = e.strony.find((s) => s.slug === 'o-nas')!;
    expect(onas.klucz).toBe('p-o-nas');
    expect(onas.tresc).toContain(`href="${TOKEN_STRONY}glowna#kontakt"`);
    // okruszki na podstronie: link do strony głównej
    expect(onas.tresc).toContain(`href="${TOKEN_STRONY}glowna"`);
    expect(e.menu.find((m) => m.etykieta === 'O nas')).toEqual({ etykieta: 'O nas', adres: `${TOKEN_STRONY}p-o-nas`, strona: 'p-o-nas' });
    expect(e.menu.find((m) => m.etykieta === 'Kontakt')?.adres).toBe(`${TOKEN_STRONY}glowna#kontakt`);
    const naglowek = plikMotywu(e, 'parts/header.html');
    expect(naglowek).toContain('<!-- wp:navigation ');
    expect(naglowek).toContain(`${TOKEN_STRONY}glowna#kontakt`);
    expect(naglowek).not.toContain('vk-menu-btn');
    expect(plikMotywu(e, 'parts/footer.html')).toContain('Stworzone w Verris Kreator');
  });

  it('wersja hosting: elementy Pro zastąpione jak przy publikacji (dopasujDoPlanu), wpisy bloga i sklep poza eksportem', () => {
    const e = eksport(zZasobami(wszystkieWarianty()), 'hosting');
    const tresc = e.strony.map((s) => s.tresc).join('');
    expect(tresc).not.toContain('vk-hero-mozaika');
    expect(tresc).not.toContain('vk-sek-produkty');
    expect(e.strony.some((s) => s.typ === 'wpis')).toBe(false);
    const pro = eksport(zZasobami(wszystkieWarianty()), 'pro');
    const wpis = pro.strony.find((s) => s.typ === 'wpis')!;
    expect(wpis).toMatchObject({ slug: 'blog/wpis', nazwa: 'wpis', rodzic: null, wpis: { data: '2026-11-01', lead: 'Lead wpisu' } });
  });

  it('strony: strona główna, SEO jak na stronie statycznej, szablon bez tytułu nad treścią', () => {
    const e = eksport(PRZYKLAD_SALON, 'hosting');
    const g = e.strony.find((s) => s.glowna)!;
    const m = model(PRZYKLAD_SALON);
    expect(g).toMatchObject({ klucz: 'glowna', typ: 'strona', jezyk: 'pl', szablon: 'strona-kreatora', seo: { tytul: m.seo.tytul, opis: m.seo.opis } });
    expect(e).toMatchObject({ nazwa: m.firma.nazwa, opis: m.seo.opis, jezyk: 'pl', jezyki: ['pl'], cel: 'wordpress', wersjaFormatu: 1 });
  });
});

describe('eksport do WordPressa – motyw', () => {
  it('theme.json v3: paleta z motywu, fonty z plikami w motywie (latin i latin-ext), układ, części szablonu', () => {
    const e = eksport(PRZYKLAD_SALON, 'hosting');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kształt theme.json sprawdzany polami niżej
    const t = JSON.parse(plikMotywu(e, 'theme.json')) as Record<string, any>;
    expect(t.version).toBe(3);
    expect(t.$schema).toMatch(/schemas\.wp\.org/);
    const paleta = t.settings.color.palette as { slug: string; name: string; color: string }[];
    expect(paleta.map((p) => p.slug)).toEqual(['tlo', 'powierzchnia', 'tekst', 'tekst-przygaszony', 'akcent', 'na-akcencie', 'akcent-tekst', 'linia', 'ciemne', 'na-ciemnym']);
    for (const p of paleta) expect(p.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(t.settings.color.defaultPalette).toBe(false);
    const rodziny = t.settings.typography.fontFamilies as { slug: string; fontFamily: string; fontFace: { src: string[]; unicodeRange: string; fontWeight: string; fontStyle: string }[] }[];
    expect(rodziny.length).toBeGreaterThan(0);
    const pliki = rodziny.flatMap((r) => r.fontFace.map((f) => f.src[0]!));
    for (const src of pliki) expect(src).toMatch(/^file:\.\/assets\/fonts\/[a-z0-9-]+-(latin|latin-ext)\.woff2$/);
    expect(pliki.some((p) => p.endsWith('-latin-ext.woff2'))).toBe(true);
    expect(e.motyw.fonty.sort()).toEqual(pliki.map((p) => p.replace('file:./assets/fonts/', '')).sort());
    expect(e.motyw.fonty.sort()).toEqual(fontyEksportu(model(PRZYKLAD_SALON), { wersja: 'hosting' }).sort());
    expect(t.settings.layout).toEqual({ contentSize: '50rem', wideSize: '72rem' });
    expect(t.settings.spacing.spacingSizes.length).toBeGreaterThan(0);
    expect(t.settings.typography.fontSizes.length).toBeGreaterThan(0);
    expect(t.templateParts).toEqual([
      { name: 'header', title: 'Nagłówek', area: 'header' },
      { name: 'footer', title: 'Stopka', area: 'footer' },
    ]);
    expect(t.styles.typography.fontFamily).toMatch(/^var\(--wp--preset--font-family--[a-z0-9-]+\)$/);
  });

  it('brakujący zakres fontu (proxy go nie ma) nie trafia do theme.json ani listy plików', () => {
    const wszystkie = fontyEksportu(model(PRZYKLAD_SALON), { wersja: 'hosting' });
    const brak = wszystkie.find((f) => f.endsWith('-latin-ext.woff2'))!;
    const e = eksport(PRZYKLAD_SALON, 'hosting', [brak]);
    expect(e.motyw.fonty).not.toContain(brak);
    expect(plikMotywu(e, 'theme.json')).not.toContain(brak);
  });

  it('pliki motywu: nagłówek style.css z licencją GPL, szablony, części, arkusze, functions.php bez wywołań zewnętrznych', () => {
    const e = eksport(PRZYKLAD_SALON, 'hosting');
    const sciezki = e.motyw.pliki.map((p) => p.sciezka);
    expect(sciezki).toEqual(
      expect.arrayContaining([
        'style.css', 'theme.json', 'functions.php', 'templates/index.html', 'templates/page.html', 'templates/front-page.html', 'templates/404.html',
        'templates/strona-kreatora.html', 'parts/header.html', 'parts/footer.html', 'assets/css/sekcje.css', 'assets/css/wordpress.css', 'assets/ustawienia.json', 'assets/js/kreator.js',
      ]),
    );
    const styl = plikMotywu(e, 'style.css');
    expect(styl).toMatch(/^\/\*\nTheme Name: Verris Kreator\n/);
    expect(styl).toContain('License: GPL-2.0-or-later');
    expect(styl).toContain('Text Domain: verris-kreator');
    const php = plikMotywu(e, 'functions.php');
    expect(php).toBe(FUNCTIONS_PHP);
    expect(php).not.toMatch(/wp_remote_|curl_|file_get_contents\(\s*['"]https?:|fonts\.googleapis/);
    expect(php).toContain('_verris_opis');
    for (const s of ['templates/front-page.html', 'templates/page.html', 'templates/404.html']) {
      const t = plikMotywu(e, s);
      expect(t).toContain('<!-- wp:template-part {"slug":"header"');
      expect(t).toContain('<!-- wp:template-part {"slug":"footer"');
    }
    expect(plikMotywu(e, 'templates/front-page.html')).toContain('<!-- wp:post-content ');
    expect(plikMotywu(e, 'templates/404.html')).toContain(`${TOKEN_STRONY}glowna`);
    const ustawienia = JSON.parse(plikMotywu(e, 'assets/ustawienia.json')) as { klasyBody: string[]; jsonLd: { '@graph': { '@type': string }[] } };
    for (const k of ustawienia.klasyBody) expect(k).toMatch(/^vk-[a-z0-9-]+$/);
    expect(ustawienia.jsonLd['@graph'].map((x) => x['@type'])).toEqual(['WebSite', model(PRZYKLAD_SALON).firma.typSchema]);
    const css = plikMotywu(e, 'assets/css/sekcje.css');
    expect(css).not.toContain('@font-face');
    expect(css).toMatch(/\.vk-sek\{/);
  });

  it('ucieczka danych: nazwa firmy z HTML i PHP nie wychodzi surowo do bloków, motywu ani kodu', () => {
    const zla = `Zła"firma <script>alert(1)</script> '; ?><?php system('x'); /* */`;
    const w = structuredClone(PRZYKLAD_SALON) as StronaWejscie;
    w.firma = { ...w.firma, nazwa: zla.slice(0, 80) };
    w.seo = { ...w.seo, opis: 'Opis </script><script>alert(2)</script>' };
    const e = eksport(w, 'hosting');
    for (const { gdzie, zapis } of zapisyBlokow(e)) {
      expect(zapis, gdzie).not.toContain('<script>alert');
      expect(zapis, gdzie).not.toContain('<?php');
      expect(() => parsujBloki(zapis), gdzie).not.toThrow();
    }
    for (const p of e.motyw.pliki) {
      expect(p.tresc, p.sciezka).not.toContain('<script>alert');
      if (p.sciezka !== 'functions.php') expect(p.tresc, p.sciezka).not.toContain('<?php');
    }
    expect(plikMotywu(e, 'functions.php')).toBe(FUNCTIONS_PHP);
    expect(plikMotywu(e, 'style.css')).not.toContain('Zła');
    // Dane strukturalne: nazwa jako tekst JSON (motyw wypisuje ją przez wp_json_encode z JSON_HEX_TAG).
    const ld = JSON.parse(plikMotywu(e, 'assets/ustawienia.json')) as { jsonLd: { '@graph': { name?: string }[] } };
    expect(ld.jsonLd['@graph'][0]!.name).toBe(zla.slice(0, 80).trim());
    expect(e.nazwa).toBe(zla.slice(0, 80).trim());
  });

  it('bez długiej pauzy (—) w treści, motywie i ostrzeżeniach', () => {
    const e = eksport(zZasobami(wszystkieWarianty()), 'pro');
    const wszystko = [...e.strony.map((s) => s.tresc), ...e.motyw.pliki.map((p) => p.tresc), ...e.ostrzezenia, ...celeCms().flatMap((c) => [c.opis, ...c.kiedyWarto, ...c.coSieZmienia])].join('\n');
    expect(wszystko).not.toContain('—');
  });

  it('skrypt formularza: klasy z prefiksem, bez klasy .js (karuzele bez skryptu zostają ukryte)', () => {
    const js = skryptFormularza();
    expect(js).toContain('.vk-form-status');
    expect(js).toContain("'vk-form-ok'");
    expect(js).not.toMatch(/'form-ok'|'form-blad'|classList\.add\('js'\)/);
  });
});

describe('eksport do WordPressa – wersje językowe', () => {
  it('podstrony w innym języku: prefiks jako strona nadrzędna, meta języka, wspólna grupa tłumaczeń', () => {
    const w = structuredClone(PRZYKLAD_SALON) as StronaWejscie;
    const glowna = w.strony[0]!;
    w.jezykiDodatkowe = ['en'];
    w.strony = [
      glowna,
      { slug: 'o-nas', tytul: 'O nas', sekcje: [{ id: 'a', typ: 'cta', wariant: 'cta-pasek', dane: { naglowek: 'Zapraszamy', przyciski: [{ etykieta: 'Kontakt', cel: '/#kontakt' }] } }] },
      { ...structuredClone(glowna), slug: 'en', tytul: 'Home' },
      { slug: 'en/about', klucz: 'o-nas', tytul: 'About us', sekcje: [{ id: 'a', typ: 'cta', wariant: 'cta-pasek', dane: { naglowek: 'Welcome', przyciski: [{ etykieta: 'Contact', cel: '/en/#kontakt' }] } }] },
    ] as StronaWejscie['strony'];
    const e = eksport(w, 'pro');
    expect(e.jezyki).toEqual(['pl', 'en']);
    const en = e.strony.find((s) => s.slug === 'en')!;
    const about = e.strony.find((s) => s.slug === 'en/about')!;
    const onas = e.strony.find((s) => s.slug === 'o-nas')!;
    expect(en).toMatchObject({ jezyk: 'en', rodzic: null, nazwa: 'en', glowna: false, grupa: 'glowna' });
    expect(about).toMatchObject({ jezyk: 'en', rodzic: 'p-en', nazwa: 'about', klucz: 'p-en__about', grupa: 'o-nas' });
    expect(onas).toMatchObject({ jezyk: 'pl', grupa: 'o-nas' });
    expect(about.tresc).toContain(`${TOKEN_STRONY}p-en#kontakt`);
    expect(e.ostrzezenia.some((o) => o.includes('bez wtyczki wielojęzycznej'))).toBe(true);
  });
});

describe('przestrzeń nazw arkusza', () => {
  it('klasy z prefiksem, znaczniki w zakresie .vk, znaczniki zastępcze, @font-face usunięte, @media rekurencyjnie', () => {
    const css = przestrzenNazwCss(
      `@font-face{font-family:'X';src:url("a.woff2")}\n.karta h3{a:1}\nul,ol{list-style:none}\nbody{margin:0}\n.lista li+li{b:2}\n@media (min-width:960px){.nav a{c:3}}\nhtml:not(.js) .karuzela-nav{display:none}\n.a{content:"{"}`,
    );
    expect(css).not.toContain('@font-face');
    expect(css).toContain('.vk-karta h3{a:1}');
    expect(css).toContain(':where(.vk) :is(ul,.vke-ul),:where(.vk) :is(ol,.vke-ol){list-style:none}');
    expect(css).toContain('body{margin:0}');
    expect(css).toContain('.vk-lista :is(li,.vke-li)+:is(li,.vke-li){b:2}');
    expect(css).toContain('@media (min-width:960px){.vk-nav a{c:3}');
    expect(css).toContain('html:not(.js) .vk-karuzela-nav{display:none}');
    expect(css).toContain('.vk-a{content:"{"}');
  });

  it('przycisk: wygląd na linku bloku core/button, nie na opakowaniu', () => {
    expect(przeksztalcSelektory('.btn-1:hover')).toBe('.vk-btn-1:not(.wp-block-button):hover,.wp-block-button.vk-btn-1>.wp-block-button__link:hover');
    expect(przeksztalcSelektory('.formularz .btn')).toBe('.vk-formularz .vk-btn:not(.wp-block-button),.vk-formularz .wp-block-button.vk-btn>.wp-block-button__link');
    expect(przeksztalcSelektory('.karuzela-btn')).toBe('.vk-karuzela-btn');
  });
});

describe('parser HTML renderera', () => {
  it('zachowuje wielkość liter atrybutów SVG i zamyka elementy puste', () => {
    const w = parsujHtml('<div class="a"><svg viewBox="0 0 1 1"><path d="M0"/></svg><img src="x" alt="y"><br></div>');
    expect(htmlWezlow(w)).toBe('<div class="a"><svg viewBox="0 0 1 1"><path d="M0"/></svg><img src="x" alt="y"><br></div>');
    expect(() => parsujHtml('<div><p></div>')).toThrow();
  });
});

describe('cele CMS', () => {
  it('lista celów dla panelu: dziś WordPress z opisem, kiedy warto i co się zmienia', () => {
    const c = celeCms();
    expect(c.map((x) => x.id)).toEqual(['wordpress']);
    expect(c[0]!.kiedyWarto.join(' ')).toMatch(/WooCommerce/);
    expect(c[0]!.coSieZmienia.join(' ')).toMatch(/kreator przestaje publikować/);
  });
});
