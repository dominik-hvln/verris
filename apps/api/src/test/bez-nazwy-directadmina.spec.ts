import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * White label (decyzja właściciela 2026-09-24): klient nie widzi nazwy DirectAdmina — ani na verris.pl,
 * ani w panelu, mailach czy dokumentach prawnych. Mówimy „panel Verris” / „panel hostingowy”.
 * Nie twierdzimy przy tym, że silnik hostingu jest nasz (docs/VERRIS.md, Decyzje).
 *
 * Komentarze w kodzie się nie liczą. Wyjątek: kreator migracji, gdzie DirectAdmin to panel
 * u POPRZEDNIEGO dostawcy klienta (cyberFolks, Seohost) — to informacja dla klienta, nie o nas.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const WYJATKI = new Set(['apps/client-panel/src/app/dashboard/migrations/migration-wizard.tsx']);

function pliki(katalog: string, rozszerzenia: RegExp): string[] {
  return readdirSync(katalog).flatMap((n) => {
    const p = join(katalog, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : pliki(p, rozszerzenia);
    return rozszerzenia.test(n) && !n.includes('.spec.') && !n.startsWith('.fuse') ? [p] : [];
  });
}

const ZRODLA = [
  ...pliki(join(KORZEN, 'apps/www/src'), /\.(ts|tsx)$/),
  ...pliki(join(KORZEN, 'apps/client-panel/src'), /\.tsx$/),
  ...pliki(join(KORZEN, 'apps/api/src/mail/templates'), /\.ts$/),
  join(KORZEN, 'apps/api/src/abuse/abuse.templates.ts'),
  join(KORZEN, 'apps/api/src/leads/leads.templates.ts'),
  ...['terms', 'privacy', 'cookies', 'dpa', 'subprocessors'].map((d) => join(KORZEN, `docs/legal/drafts/${d}.md`)),
  join(KORZEN, 'docs/legal/consumer-info.md'),
];

describe('White label — nazwa DirectAdmina nie trafia do klienta', () => {
  it('teksty dla klienta nie zawierają „DirectAdmin”', () => {
    const trafienia = ZRODLA.filter((p) => !WYJATKI.has(relative(KORZEN, p))).flatMap((p) =>
      readFileSync(p, 'utf8')
        .split('\n')
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => l.includes('DirectAdmin') && !/^\s*(\/\/|\*|\/\*)/.test(l))
        .map(({ i }) => `${relative(KORZEN, p)}:${i + 1}`),
    );
    expect(trafienia).toEqual([]);
  });
});

/**
 * Komunikaty błędów API, które trafiają do panelu klienta (np. „Narzędzia WWW” pokazywały „Brak zapisanych
 * danych logowania DirectAdmin…”). Wyjątki: kreator migracji (DirectAdmin u poprzedniego dostawcy)
 * i komunikaty wyłącznie dla administratora (ustawienia i audyt węzła).
 */
describe('White label — błędy API dla klienta bez nazwy DirectAdmina', () => {
  const WYJATKI_API = new Set([
    'apps/api/src/subscriptions/migration-discovery.service.ts',
    'apps/api/src/servers/servers.service.ts',
    'apps/api/src/servers/node-audit.service.ts',
    'apps/api/src/servers/stos-wezla.service.ts', // PB-33 — tylko admin (wersje stosu floty)
  ]);
  const KOMUNIKAT = /new \w+Exception\(\s*([`'"])((?:(?!\1).)*?(DirectAdmin|\bDA\b)(?:(?!\1).)*)\1/gs;

  it('wyjątki w serwisach klienta nie mówią „DirectAdmin” ani „DA”', () => {
    const katalogi = ['subscriptions', 'servers', 'diagnostics', 'domains', 'users', 'files', 'autoscaling', 'reseller', 'vps'].map((k) => join(KORZEN, 'apps/api/src', k));
    const trafienia = katalogi
      .flatMap((k) => pliki(k, /\.ts$/))
      .filter((p) => !WYJATKI_API.has(relative(KORZEN, p)))
      .flatMap((p) => [...readFileSync(p, 'utf8').matchAll(KOMUNIKAT)].map((m) => `${relative(KORZEN, p)}: ${m[2].slice(0, 80)}`));
    expect(trafienia).toEqual([]);
  });
});

/**
 * Stałe napisy w odpowiedziach dla klienta. Poprzedni test łapie tylko `new XException('…DirectAdmin…')`;
 * umykały mu pola zwracane w JSON-ie (`fetchError`, `notice`, `blad`) i napisy po `??` — a filtr wyjątków
 * pól JSON nie czyści. Pomijamy wpisy do logów (`this.logger.*`) i podpowiedzi tylko dla administratora.
 */
describe('White label — stałe napisy w odpowiedziach API dla klienta', () => {
  const PLIKI = [
    'apps/api/src/servers/directadmin.service.ts',
    'apps/api/src/subscriptions/services.controller.ts',
    'apps/api/src/subscriptions/hosting-restore.service.ts',
    'apps/api/src/domains/domain-registrar.service.ts',
    'apps/api/src/addons/addon.service.ts',
    'apps/api/src/billing/wallet-auto-topup.service.ts',
  ];
  const NAPIS = /(['"`])(?:(?!\1).)*(?:DirectAdmin|\bDA\b|CustomBuild)(?:(?!\1).)*\1/;
  // testConnection — test połączenia z węzłem, tylko panel administratora (servers.service).
  const TYLKO_ADMIN = /DirectAdmin przyjmuje tylko HTTPS/;

  it('napisy (poza logami i komentarzami) nie zawierają „DirectAdmin” ani „DA”', () => {
    const trafienia = PLIKI.flatMap((p) => {
      const linie = readFileSync(join(KORZEN, p), 'utf8').split('\n');
      return linie.flatMap((l, i) => {
        if (/^\s*(\/\/|\*|\/\*|import )/.test(l) || !NAPIS.test(l) || TYLKO_ADMIN.test(l)) return [];
        if (linie.slice(Math.max(0, i - 3), i + 1).some((x) => /logger\.\w+\(/.test(x))) return [];
        return [`${p}:${i + 1}: ${l.trim().slice(0, 80)}`];
      });
    });
    expect(trafienia).toEqual([]);
  });

  it('baza wiedzy dla klientów (seed-knowledge-base.ts, audience ALL) nie zawiera „DirectAdmin”', () => {
    const zrodlo = readFileSync(join(KORZEN, 'apps/api/src/cli/seed-knowledge-base.ts'), 'utf8');
    // Artykuły STAFF mogą mówić o DirectAdminie — obsługa wie, na czym stoi hosting.
    const artykuly = [...zrodlo.matchAll(/title: '([^']*)',\s*audience: AiKnowledgeAudience\.(\w+),\s*content: `([^`]*)`/g)];
    expect(artykuly.length).toBeGreaterThan(20);
    const trafienia = artykuly
      .filter(([, , odbiorca]) => odbiorca === 'ALL')
      .filter(([, tytul, , tresc]) => /DirectAdmin|\bDA\b|CustomBuild|:2222/.test(`${tytul}\n${tresc}`))
      .map(([, tytul]) => tytul);
    expect(trafienia).toEqual([]);
  });
});
