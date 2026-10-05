import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * PB-23 — każdy widok ma wejście. Zasada właściciela (2026-09-23): w panelu
 * klienta, admina i staff nic nie może wymagać szukania po adresach.
 *
 * Trasa (page.tsx) przechodzi, jeśli:
 *  - stoi w konfiguracji menu panelu (`href: '/…'`), albo
 *  - prowadzi do niej odnośnik z INNEGO pliku panelu (zakładka, przycisk
 *    w logicznym rodzicu), który sam jest osiągalny: plik spoza `app/`
 *    (komponent, layout) liczy się zawsze, plik strony albo leżący obok niej
 *    — tylko gdy ta strona ma wejście. Dwie sieroty linkujące się nawzajem
 *    nadal są sierotami. Trasa dynamiczna wymaga odnośnika o tym samym
 *    kształcie (`/services/${id}/plan` → `/services/[id]/plan`), albo
 *  - strona jest tylko przekierowaniem (stary adres → zakładka usługi), albo
 *  - jest na liście WYJATKI z powodem (wejście z maila, krok przepływu).
 *
 * Nowa strona bez żadnego z powyższych = czerwony test. Tak ma być.
 */

const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');

const PANELE: Record<string, { menu: string[]; wyjatki: Record<string, string> }> = {
  'client-panel': {
    menu: ['src/app/dashboard/layout.tsx', 'src/app/dashboard/components/hosting-tabs.tsx'],
    wyjatki: {
      '/accept-invite': 'wejście z maila z zaproszeniem do subkonta',
      '/confirm-email-change': 'wejście z maila potwierdzającego zmianę adresu',
      '/verify-email': 'wejście z maila weryfikacyjnego',
      '/reset-password': 'wejście z maila resetu hasła',
      '/register/check-email': 'krok po rejestracji (przekierowanie z formularza)',
      '/legal': 'strona zbiorcza; dokumenty mają wejścia w stopce (/legal/[kind])',
    },
  },
  'admin-panel': { menu: ['src/components/admin-shell.tsx'], wyjatki: { '/login': 'logowanie' } },
  'staff-panel': { menu: ['src/components/staff-shell.tsx'], wyjatki: { '/login': 'logowanie' } },
};

function pliki(kat: string, out: string[] = []): string[] {
  for (const w of readdirSync(kat)) {
    if (w === 'node_modules' || w === '.next') continue;
    const s = join(kat, w);
    if (statSync(s).isDirectory()) pliki(s, out);
    else if (/\.tsx?$/.test(w) && !/\.spec\.tsx?$/.test(w)) out.push(s);
  }
  return out;
}

/** Adres strony z ścieżki pliku: bez grup „(x)”, z segmentami dynamicznymi. */
function trasa(appDir: string, plik: string): string {
  const r = relative(appDir, plik).split(sep).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s));
  return '/' + r.join('/');
}

/** Wszystkie adresy-cele w pliku: href, router.push/replace, redirect, Link. */
function cele(tresc: string): string[] {
  const out: string[] = [];
  const re = /(?:href\s*[:=]\s*\{?\s*|push\(\s*|replace\(\s*|redirect\(\s*)([`'"])(\/[^`'"]*)\1?/g;
  for (const m of tresc.matchAll(re)) out.push(m[2].split(/[?#]/)[0]);
  return out;
}

/** `/services/[id]/plan` → wzorzec, który łapie `/services/${id}/plan`. */
const wzor = (t: string) => new RegExp('^' + t.replace(/\[[^\]]+\]/g, '[^/]+') + '$');
const PLIKI_RAMY = /^(layout|template|error|not-found|loading)\.tsx?$/;

describe('PB-23 — każdy widok osiągalny z menu albo zakładki', () => {
  for (const [panel, cfg] of Object.entries(PANELE)) {
    it(panel, () => {
      const src = join(KORZEN, 'apps', panel, 'src');
      const appDir = join(src, 'app');
      const wszystkie = pliki(src);
      const menu = new Set(cfg.menu.flatMap((m) => cele(readFileSync(join(KORZEN, 'apps', panel, m), 'utf8'))));
      const strony = new Map(
        wszystkie.filter((p) => p.endsWith(`${sep}page.tsx`)).map((p) => [trasa(appDir, p), p] as const),
      );
      /** Strona, do której należy plik (najbliższy page.tsx w górę); null = rama/komponent, zawsze widoczny. */
      const wlasciciel = (p: string): string | null => {
        if (!p.startsWith(appDir + sep) || PLIKI_RAMY.test(p.slice(p.lastIndexOf(sep) + 1))) return null;
        for (let d = p.slice(0, p.lastIndexOf(sep)); d.startsWith(appDir); d = d.slice(0, d.lastIndexOf(sep))) {
          const t = trasa(appDir, join(d, 'page.tsx'));
          if (strony.get(t) === join(d, 'page.tsx')) return t;
        }
        return null;
      };
      const zrodla = wszystkie.map((p) => ({
        p,
        wl: wlasciciel(p),
        cele: cele(readFileSync(p, 'utf8')).map((c) => c.replace(/\$\{[^}]*\}/g, 'x')),
      }));
      const osiagalne = new Set<string>();
      const pominiete = new Set<string>();
      for (const [t, plik] of strony) {
        const tresc = readFileSync(plik, 'utf8');
        if (cfg.wyjatki[t] || menu.has(t)) osiagalne.add(t);
        // Stary adres = krótkie przekierowanie; nie jest wejściem dla innych.
        else if (/\bredirect\(/.test(tresc) && tresc.split('\n').length < 40) pominiete.add(t);
      }
      for (let zmiana = true; zmiana; ) {
        zmiana = false;
        for (const [t, plik] of strony) {
          if (osiagalne.has(t) || pominiete.has(t)) continue;
          const w = wzor(t);
          const ok = zrodla.some(
            (z) => z.p !== plik && z.wl !== t && (z.wl === null || osiagalne.has(z.wl)) && z.cele.some((c) => w.test(c)),
          );
          if (ok) zmiana = Boolean(osiagalne.add(t));
        }
      }
      expect([...strony.keys()].filter((t) => !osiagalne.has(t) && !pominiete.has(t))).toEqual([]);
    });
  }

  it('klient: każdy kafelek do wyboru ma też stałe wejście w menu', () => {
    // Kafelki (4 z SIDEBAR_TILE_OPTIONS) wybiera klient w Ustawieniach. Trasa,
    // której nie przypnie, musi zostać w sekcji „Więcej” (secondaryItems) —
    // inaczej np. „Usługi” znikają z menu po zmianie skrótów.
    const opcje = readFileSync(join(KORZEN, 'libs/contracts/src/panel-preferences.ts'), 'utf8');
    const kafelki = [...opcje.slice(opcje.indexOf('SIDEBAR_TILE_OPTIONS')).matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
    const layout = readFileSync(join(KORZEN, 'apps/client-panel/src/app/dashboard/layout.tsx'), 'utf8');
    const wiecej = layout.slice(layout.indexOf('const secondaryItems'), layout.indexOf('\n];', layout.indexOf('const secondaryItems')));
    const zawsze: Record<string, string> = {
      '/dashboard': 'logo w nagłówku menu',
      '/dashboard/support': 'osobny wiersz „Centrum pomocy” pod kafelkami',
    };
    expect(kafelki.length).toBeGreaterThan(4);
    expect(kafelki.filter((h) => !zawsze[h] && !cele(wiecej).includes(h))).toEqual([]);
    for (const h of Object.keys(zawsze)) expect(cele(layout)).toContain(h);
  });

  it('wyjątki nie wiszą w próżni (każdy nadal jest stroną)', () => {
    for (const [panel, cfg] of Object.entries(PANELE)) {
      const appDir = join(KORZEN, 'apps', panel, 'src', 'app');
      const trasy = new Set(pliki(appDir).filter((p) => p.endsWith(`${sep}page.tsx`)).map((p) => trasa(appDir, p)));
      for (const w of Object.keys(cfg.wyjatki)) expect([panel, w, trasy.has(w)]).toEqual([panel, w, true]);
    }
  });
});
