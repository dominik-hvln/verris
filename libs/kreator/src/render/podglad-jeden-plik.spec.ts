import { walidujStrone } from '../model.ts';
import { PRZYKLAD_SALON } from '../przyklady/salon.ts';
import { renderujStrone } from './index.ts';
import { naglowkiPodgladu, rozwiazSciezke, zlozPodglad } from './podglad-jeden-plik.ts';

/**
 * Paczka 123 – jedno składanie podglądu dla API i panelu (testy przeniesione z apps/api/src/kreator/podglad-konfiguracja.spec.ts
 * i apps/client-panel/src/app/api/kreator/podglad/route.spec.ts).
 */
describe('podgląd kreatora – składanie HTML w jeden dokument', () => {
  const pliki = [
    { sciezka: 'index.html', tresc: '<head><link rel="stylesheet" href="assets/a.css"><link rel="stylesheet" href="https://api.verris.pl/fonts/css2?family=Inter"></head><body><script type="module" src="./assets/a.js"></script></body>' },
    { sciezka: 'o-nas/index.html', tresc: '<link href="../assets/a.css" rel="stylesheet"><script src="/assets/a.js"></script>' },
    { sciezka: 'assets/a.css', tresc: 'a::after{content:"</style><b>x</b>"}' },
    { sciezka: 'assets/a.js', tresc: 'const s = "</script><img src=x onerror=alert(1)>"; <!-- x' },
  ];

  it('osadza CSS i JS z renderu, zostawia odwołania zewnętrzne (fonty z proxy)', () => {
    const html = zlozPodglad(pliki, '')!;
    expect(html).toContain('<style>');
    expect(html).toContain('<script type="module">');
    expect(html).toContain('href="https://api.verris.pl/fonts/css2?family=Inter"');
    expect(html).not.toContain('assets/a.css');
  });

  it('treść CSS/JS nie zamknie elementu (</style>, </script>, <!--)', () => {
    const html = zlozPodglad(pliki, '')!;
    expect(html.match(/<\/style>/g)).toHaveLength(1);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).not.toContain('<!--');
  });

  it('podstrona w katalogu: ścieżki względne i od korzenia; brak podstrony → null', () => {
    const html = zlozPodglad(pliki, 'o-nas')!;
    expect(html.startsWith('<style>')).toBe(true);
    expect(html).toContain('<script>const s');
    expect(zlozPodglad(pliki, 'kontakt')).toBeNull();
    expect(zlozPodglad([], '')).toBeNull();
  });

  it('skrypt z defer (renderer: <script src defer> w <head>) czeka na DOMContentLoaded po osadzeniu', () => {
    const html = zlozPodglad([{ sciezka: 'index.html', tresc: '<head><script src="/assets/k.js" defer></script></head>' }, { sciezka: 'assets/k.js', tresc: 'init()' }], '')!;
    expect(html).toBe("<head><script>document.addEventListener('DOMContentLoaded',function(){\ninit()\n});</script></head>");
  });

  it('ścieżki: bez wyjścia ponad katalog strony i bez adresów zewnętrznych', () => {
    expect(rozwiazSciezke('o-nas', '../assets/a.css?v=1')).toBe('assets/a.css');
    expect(rozwiazSciezke('', '../../etc/passwd')).toBeNull();
    expect(rozwiazSciezke('', '//cdn.example.com/a.js')).toBeNull();
    expect(rozwiazSciezke('', 'data:text/css,a')).toBeNull();
  });

  it('prawdziwy render: każda podstrona z CSS inline, bez odwołań do plików strony', () => {
    const w = walidujStrone(PRZYKLAD_SALON);
    if (!w.ok) throw new Error(w.bledy.join('; '));
    const { pliki: render } = renderujStrone(w.strona, { tryb: 'podglad', wersja: 'hosting', podgladPro: true, bazaFontow: 'https://api.verris.pl/fonts' });
    for (const p of w.strona.strony) {
      const html = zlozPodglad(render, p.slug);
      expect(html, `podstrona „${p.slug}”`).not.toBeNull();
      expect(html).toContain('<style>');
      expect(html).not.toMatch(/href="[^"]*assets\/styl\.css"/);
      expect(html).not.toMatch(/<script[^>]*src="[^"]*assets\/kreator\.js"/);
    }
  });
});

describe('podgląd kreatora – nagłówki', () => {
  it('CSP: sandbox bez allow-same-origin, fonty i zdjęcia z originu API, bez połączeń sieciowych; noindex, no-store', () => {
    const n = naglowkiPodgladu('https://api.verris.pl/fonts/kreator');
    const csp = n['Content-Security-Policy']!;
    expect(csp).toContain('sandbox allow-scripts;');
    expect(csp).not.toContain('allow-same-origin');
    expect(csp).toContain("style-src 'unsafe-inline' https://api.verris.pl");
    expect(csp).toContain('font-src data: https://api.verris.pl');
    expect(csp).toContain('img-src data: https: https://api.verris.pl');
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toContain('frame-ancestors');
    expect(n['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(n['Cache-Control']).toBe('no-store');
  });

  it('ramka tylko z panelu: frame-ancestors self na życzenie (trasa panelu za Caddy z X-Frame-Options DENY)', () => {
    expect(naglowkiPodgladu('https://api.verris.pl/fonts', { ramkaTegoOriginu: true })['Content-Security-Policy']).toContain("frame-ancestors 'self'");
    // Bez poprawnego adresu proxy – bez dopisanych originów.
    expect(naglowkiPodgladu('zly adres')['Content-Security-Policy']).toContain('font-src data:;');
  });
});
