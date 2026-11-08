import { naglowkiPodgladu, rozwiazSciezke, zlozPodglad } from './podglad.js';
import { kontoTestowe, miesiacUtc, odczytajKonfiguracjeKreatora } from './konfiguracja.js';

describe('podgląd kreatora – składanie HTML', () => {
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

  it('CSP: sandbox bez allow-same-origin, fonty tylko z originu proxy, bez połączeń sieciowych', () => {
    const csp = naglowkiPodgladu('https://api.verris.pl/fonts')['Content-Security-Policy'];
    expect(csp).toContain('sandbox allow-scripts;');
    expect(csp).not.toContain('allow-same-origin');
    expect(csp).toContain("style-src 'unsafe-inline' https://api.verris.pl");
    expect(csp).toContain('font-src data: https://api.verris.pl');
    expect(csp).toContain("connect-src 'none'");
  });
});

describe('konfiguracja kreatora', () => {
  it('domyślnie wyłączony, Sonnet 5.5; tylko modele Anthropic; konta testowe małymi literami bez duplikatów', () => {
    expect(odczytajKonfiguracjeKreatora(null)).toEqual({
      modelGeneracji: 'claude-sonnet-5-5',
      modelZmian: 'claude-sonnet-5-5',
      wlaczony: false,
      kontaTestowe: [],
      bibliotekiZdjec: ['pixabay', 'openverse', 'pexels'],
    });
    const k = odczytajKonfiguracjeKreatora(JSON.stringify({ modelGeneracji: 'gpt-6-luna', modelZmian: 'claude-opus-5-5', wlaczony: 'tak', kontaTestowe: ['A@b.pl', 'a@b.pl ', 7, ''] }));
    expect(k).toEqual({ modelGeneracji: 'claude-sonnet-5-5', modelZmian: 'claude-opus-5-5', wlaczony: false, kontaTestowe: ['a@b.pl'], bibliotekiZdjec: ['pixabay', 'openverse', 'pexels'] });
    // Paczka 122: biblioteki zdjęć – tylko znani dostawcy, bez powtórzeń, kolejność z konfiguracji; pusta lista = wyłączone.
    expect(odczytajKonfiguracjeKreatora(JSON.stringify({ bibliotekiZdjec: ['openverse', 'unsplash', 'openverse', 'pixabay'] })).bibliotekiZdjec).toEqual(['openverse', 'pixabay']);
    expect(odczytajKonfiguracjeKreatora(JSON.stringify({ bibliotekiZdjec: [] })).bibliotekiZdjec).toEqual([]);
    expect(odczytajKonfiguracjeKreatora('[1,2]')).toEqual(odczytajKonfiguracjeKreatora(null));
    expect(odczytajKonfiguracjeKreatora('{zepsute')).toEqual(odczytajKonfiguracjeKreatora(null));
  });

  it('konto testowe po e-mailu albo ID; miesiąc UTC', () => {
    const k = odczytajKonfiguracjeKreatora(JSON.stringify({ kontaTestowe: ['jan@verris.pl', 'abc-123'] }));
    expect(kontoTestowe(k, { id: 'x', email: 'Jan@Verris.pl' })).toBe(true);
    expect(kontoTestowe(k, { id: 'ABC-123' })).toBe(true);
    expect(kontoTestowe(k, { id: 'y', email: 'obcy@verris.pl' })).toBe(false);
    expect(miesiacUtc(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12');
    expect(miesiacUtc(new Date('2027-01-01T00:30:00+02:00'))).toBe('2026-12');
  });
});
