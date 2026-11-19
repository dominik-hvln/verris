import type { StronaWejscie } from '../model.ts';
import { PRZYKLAD_MIGAWKI_MARKI as MIG } from '../marka-strony/przyklad.ts';
import { zastosujMarke } from '../marka-strony/zastosuj.ts';
import { zlozPodglad } from './podglad-jeden-plik.ts';
import { PLIKI_MARKI } from './marka.ts';
import { model, plik, PRZYKLADY, render, znaczniki } from './testy.pomoc.ts';

/** Paczka 130 – logo, favicon, theme-color i obraz OG z migawki marki; bez marki – dotychczasowy inicjał. */
const zMarka = (w: StronaWejscie = PRZYKLADY.salon!, opcje = { logo: true, paleta: false, fonty: false, favicon: true }) =>
  zastosujMarke(model(w), MIG, opcje).strona as StronaWejscie;

const naglowek = (html: string) => html.slice(html.indexOf('<header class="naglowek'), html.indexOf('</header>') + 9);
const stopka = (html: string) => html.slice(html.indexOf('<footer'), html.indexOf('</footer>') + 9);

describe('Render: marka na stronie', () => {
  it('bez marki – inicjał w nagłówku i stopce, favicon z inicjału, bez plików marki (bez regresji)', () => {
    const w = render(PRZYKLADY.salon!, 'hosting');
    const html = plik(w, 'index.html');
    expect(naglowek(html)).toContain('<span class="logo-znak" aria-hidden="true">P</span>');
    expect(html).not.toContain('logo-marka');
    expect(html).toMatch(/<link rel="icon" href="data:image\/svg\+xml,/);
    expect(w.pliki.some((p) => p.sciezka.startsWith('assets/marka/'))).toBe(false);
    expect(plik(w, 'assets/styl.css')).not.toContain('.logo-marka');
  });

  it('nagłówek: logo poziome + sygnet na wąski ekran, nazwa dla czytników, SVG aria-hidden, bez inicjału', () => {
    const html = plik(render(zMarka(), 'hosting'), 'index.html');
    const n = naglowek(html);
    expect(n).toContain('<a class="logo logo-marka z-sygnetem" href="./">');
    expect(n).toContain('<span class="sr">Pracownia Fal</span>');
    expect(n).not.toContain('logo-znak');
    expect(n).toContain('<clipPath id="mkn-k">');
    expect((n.match(/<svg /g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(znaczniki(n).filter((t) => t.nazwa === 'svg').every((t) => t.atr['aria-hidden'] === 'true')).toBe(true);
    // metadane i tytuł z pliku nie trafiają na stronę
    expect(html).not.toMatch(/<metadata|rdf:|<title>Łódka/);
  });

  it('stopka (ciemne tło): negatyw z marki, osobne identyfikatory niż w nagłówku', () => {
    const html = plik(render(zMarka(), 'hosting'), 'index.html');
    const s = stopka(html);
    expect(s).toContain('<a class="logo logo-marka negatyw"');
    expect(s).toContain('fill="#FFFFFF"');
    const ids = [...html.matchAll(/ id="(mk[^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stopka bez negatywu: logo poziome w kolorze tekstu na ciemnym (akcent jak tekst)', () => {
    const w = zMarka();
    delete (w.marka as { logoNegatyw?: string }).logoNegatyw;
    const r = render(w, 'hosting');
    expect(stopka(plik(r, 'index.html'))).toContain('<a class="logo logo-marka"');
    const css = plik(r, 'assets/styl.css');
    expect(css).toContain('.stopka .logo-marka{color:var(--s-tekst);--akcent:currentColor}');
    expect(css).toContain('.naglowek .logo-marka{color:#1F3A5F}');
    expect(r.pliki.some((p) => p.sciezka === PLIKI_MARKI.logoNegatyw)).toBe(false);
  });

  it('ciemny nagłówek: negatyw także w nagłówku', () => {
    const w = zMarka();
    w.motyw.paleta = { ...w.motyw.paleta, tlo: '#101418', tekst: '#F2F2F2', tekstPrzygaszony: '#C8C8C8' };
    const n = naglowek(plik(render(w, 'hosting'), 'index.html'));
    expect(n).toContain('logo-marka z-sygnetem negatyw');
  });

  it('głowa: favicon marki z pliku (+ PNG i apple-touch-icon) w publikacji, inline w podglądzie; theme-color i OG z marki', () => {
    const pub = render(zMarka(), 'hosting');
    const html = plik(pub, 'index.html');
    expect(html).toContain('<link rel="icon" href="assets/marka/favicon-192.png" type="image/png">');
    expect(html).toContain('<link rel="apple-touch-icon" href="assets/marka/favicon-192.png">');
    expect(html).toContain('<link rel="icon" href="assets/marka/favicon.svg" type="image/svg+xml">');
    expect(html).toContain('<meta name="theme-color" content="#1F3A5F">');
    expect(html).toContain('<meta property="og:image" content="https://cdn.przyklad.pl/marka/og.png">');
    // podstrona – ścieżka od korzenia strony
    const podstrona = render(zMarka(PRZYKLADY.studio!), 'pro').pliki.find((p) => p.sciezka.endsWith('/index.html'))!;
    expect(podstrona.tresc).toMatch(/<link rel="icon" href="(\.\.\/)+assets\/marka\/favicon\.svg"/);
    expect(plik(pub, '404.html')).toContain('<link rel="icon" href="/assets/marka/favicon.svg"');

    const podglad = render(zMarka(), 'hosting', { tryb: 'podglad' });
    const h = zlozPodglad(podglad.pliki, '')!;
    expect(h).toMatch(/<link rel="icon" href="data:image\/svg\+xml,%3Csvg/);
    expect(h).not.toContain('favicon-192.png');
  });

  it('własny obraz OG strony ma pierwszeństwo przed obrazem z marki', () => {
    const w = zMarka();
    w.seo.obrazOg = { alt: 'Salon', url: 'https://cdn.przyklad.pl/wlasny.jpg' };
    expect(plik(render(w, 'hosting'), 'index.html')).toContain('content="https://cdn.przyklad.pl/wlasny.jpg"');
  });

  it('pliki marki do publikacji/ZIP: logo, negatyw i favicon z kolorami na stałe', () => {
    const r = render(zMarka(), 'hosting');
    const logo = plik(r, PLIKI_MARKI.logo);
    expect(logo).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(logo).toContain('fill="#1F3A5F"');
    expect(logo).toContain('stroke="#E07A3F"');
    expect(logo).not.toMatch(/currentColor|var\(|aria-hidden/);
    expect(plik(r, PLIKI_MARKI.favicon)).toContain('fill="#E07A3F"');
    expect(plik(r, PLIKI_MARKI.logoNegatyw)).toContain('#FFFFFF');
  });

  it('logo wyłączone w migawce (tylko kolory marki) – inicjał i favicon z inicjału', () => {
    const w = zMarka(PRZYKLADY.salon!, { logo: false, paleta: true, fonty: false, favicon: false });
    const r = render(w, 'hosting');
    const html = plik(r, 'index.html');
    expect(html).toContain('logo-znak');
    expect(html).not.toContain('logo-marka');
    expect(r.pliki.some((p) => p.sciezka.startsWith('assets/marka/'))).toBe(false);
  });

  it('edycja na stronie: logo marki bez atrybutów edycji (SVG nie jest tekstem do edycji)', () => {
    const html = plik(render(zMarka(), 'hosting', { tryb: 'podglad', edycja: true }), 'index.html');
    const n = naglowek(html);
    const logo = n.slice(n.indexOf('<a class="logo'), n.indexOf('</a>', n.indexOf('<a class="logo')) + 4);
    expect(logo).not.toMatch(/data-k/);
    expect(logo).not.toContain('contenteditable');
  });
});
