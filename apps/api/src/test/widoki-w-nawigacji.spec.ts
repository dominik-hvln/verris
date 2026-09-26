import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * PB-23 — każdy widok ma wejście. Zasada właściciela (2026-09-23): w panelu
 * klienta, admina i staff nic nie może wymagać szukania po adresach.
 *
 * Trasa (page.tsx) przechodzi, jeśli:
 *  - stoi w konfiguracji menu panelu (`href: '/…'`), albo
 *  - prowadzi do niej odnośnik z INNEGO pliku panelu (zakładka, przycisk
 *    w logicznym rodzicu) — dla tras dynamicznych wystarczy odnośnik
 *    zaczynający się od stałej części adresu, albo
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

describe('PB-23 — każdy widok osiągalny z menu albo zakładki', () => {
  for (const [panel, cfg] of Object.entries(PANELE)) {
    it(panel, () => {
      const src = join(KORZEN, 'apps', panel, 'src');
      const appDir = join(src, 'app');
      const wszystkie = pliki(src);
      const menu = new Set(cfg.menu.flatMap((m) => cele(readFileSync(join(KORZEN, 'apps', panel, m), 'utf8'))));
      const strony = wszystkie.filter((p) => p.endsWith(`${sep}page.tsx`));
      const odnosniki = wszystkie.map((p) => ({ p, cele: cele(readFileSync(p, 'utf8')) }));
      const brak: string[] = [];
      for (const strona of strony) {
        const t = trasa(appDir, strona);
        if (cfg.wyjatki[t] || menu.has(t)) continue;
        const tresc = readFileSync(strona, 'utf8');
        if (/\bredirect\(/.test(tresc) && tresc.split('\n').length < 40) continue;
        const staly = t.includes('[') ? t.slice(0, t.indexOf('[')) : null;
        const ok = odnosniki.some(
          (o) => o.p !== strona && o.cele.some((c) => (staly ? c.startsWith(staly) && c.length > staly.length - 1 : c === t)),
        );
        if (!ok) brak.push(t);
      }
      expect(brak).toEqual([]);
    });
  }

  it('wyjątki nie wiszą w próżni (każdy nadal jest stroną)', () => {
    for (const [panel, cfg] of Object.entries(PANELE)) {
      const appDir = join(KORZEN, 'apps', panel, 'src', 'app');
      const trasy = new Set(pliki(appDir).filter((p) => p.endsWith(`${sep}page.tsx`)).map((p) => trasa(appDir, p)));
      for (const w of Object.keys(cfg.wyjatki)) expect([panel, w, trasy.has(w)]).toEqual([panel, w, true]);
    }
  });
});
