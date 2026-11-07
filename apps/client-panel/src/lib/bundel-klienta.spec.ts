import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';

/**
 * P5-01 — panel klienta nie wysyła przeglądarce kodu operatora. Do 3.11.2026 panel importował „beczkę”
 * `@verris/contracts`, więc w JS każdej strony panelu były: mapa regionów z miastami centrów danych, lista usług
 * i ścieżek logów węzła, ścieżka skryptu operatora i wzorzec white label, który sam wylicza ukrywane nazwy.
 *
 * Strażnik ma trzy części:
 *  1. kod panelu (bez testów) importuje kontrakty wyłącznie z `@verris/contracts/klient`; pełne wejście wolno tylko
 *     w module serwerowym (`'use server'` albo import `next/headers` — Next nie pozwoli dołączyć go do przeglądarki);
 *  2. całe drzewo modułów `libs/contracts/src/klient.ts` (z importami przechodnimi, bez komentarzy — build je
 *     usuwa) nie zawiera nazw oprogramowania serwera, dostawcy, miast centrów danych ani ścieżek węzła;
 *  3. moduły operatora nie są osiągalne z `klient.ts`.
 * Po `next build` to samo na gotowych plikach sprawdza `node scripts/sprawdz-bundel-klienta.mjs`.
 */
const KONTRAKTY = resolve(__dirname, '../../../../libs/contracts/src');
const SRC = resolve(__dirname, '..');

/** Słowa zaplecza, których nie może być w kodzie wysyłanym klientowi (wspólne ze skryptem po buildzie). */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { slowoZaplecza } = require('../../scripts/slowa-zaplecza.cjs') as { slowoZaplecza: (t: string) => string | null };

/** Bez komentarzy (build produkcyjny je usuwa); `//` w adresach (`https://`) zostaje. */
const bezKomentarzy = (kod: string) => kod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

const OPERATORSKIE = [
  'runbooki.ts', 'pomoc-admina.ts', 'uslugi-wezla.ts', 'dostep-wezla.ts', 'aktualizacje-wezla.ts', 'lokalizacja.ts',
  'komunikaty-hostingu.ts', 'komunikacja-operacyjna.ts', 'node-audit.dto.ts', 'node-stack-readiness.dto.ts',
  'node-task.dto.ts', 'server.dto.ts', 'grafana-sso.ts',
];

/** Moduły ładowane w czasie działania: `export *` / `import {…}` (bez `export type *` i `import type`). */
function drzewo(start: string): Map<string, string> {
  const wynik = new Map<string, string>();
  const kolejka = [start];
  while (kolejka.length) {
    const plik = kolejka.pop()!;
    if (wynik.has(plik)) continue;
    const kod = readFileSync(plik, 'utf8');
    wynik.set(plik, kod);
    const re = /^(?:import|export)\s+(?!type\b)[^;]*?from\s+['"](\.[^'"]+)['"]/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(kod))) {
      const cel = resolve(dirname(plik), m[1]!);
      if (existsSync(cel)) kolejka.push(cel);
    }
  }
  return wynik;
}

function pliki(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) pliki(p, out);
    else if (/\.tsx?$/.test(n) && !/\.spec\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

it('kod panelu importuje kontrakty tylko z @verris/contracts/klient (pełne wejście – wyłącznie moduły serwerowe)', () => {
  const zle: string[] = [];
  for (const p of pliki(SRC)) {
    const kod = readFileSync(p, 'utf8');
    if (!/from\s+['"]@verris\/contracts['"]|import\(\s*['"]@verris\/contracts['"]/.test(kod)) continue;
    const serwerowy = /^\s*['"]use server['"]/m.test(kod) || /from\s+['"]next\/headers['"]/.test(kod);
    if (!serwerowy) zle.push(p.slice(SRC.length + 1));
  }
  expect(zle).toEqual([]);
});

it('drzewo wejścia klienckiego nie zawiera słów zaplecza (nazwy oprogramowania, dostawca, miasta, ścieżki węzła)', () => {
  const trafienia: string[] = [];
  for (const [plik, kod] of drzewo(join(KONTRAKTY, 'klient.ts'))) {
    const slowo = slowoZaplecza(bezKomentarzy(kod));
    if (slowo) trafienia.push(`${plik.slice(KONTRAKTY.length + 1)}: ${slowo}`);
  }
  expect(trafienia).toEqual([]);
});

it('moduły operatora nie są osiągalne z wejścia klienckiego', () => {
  const osiagalne = [...drzewo(join(KONTRAKTY, 'klient.ts')).keys()].map((p) => p.slice(KONTRAKTY.length + 1));
  expect(osiagalne.filter((p) => OPERATORSKIE.includes(p))).toEqual([]);
  // Typy też nie — `export type *` z modułu operatora wciągnąłby go do drzewa w trybie dev.
  const klient = readFileSync(join(KONTRAKTY, 'klient.ts'), 'utf8');
  expect(OPERATORSKIE.filter((m) => klient.includes(`'./${m}'`))).toEqual([]);
});

it('strażnik łapie to, co wyciekało przed poprawką (P5-01)', () => {
  // Dawne „beczka” → drzewo zawierało moduły operatora z tymi treściami.
  const dawne = drzewo(join(KONTRAKTY, 'index.ts'));
  const nazwy = [...dawne.keys()].map((p) => p.slice(KONTRAKTY.length + 1));
  expect(nazwy).toEqual(expect.arrayContaining(['lokalizacja.ts', 'uslugi-wezla.ts', 'dostep-wezla.ts', 'komunikaty-hostingu.ts']));
  const trafione = [...dawne.values()].some((kod) => slowoZaplecza(bezKomentarzy(kod)) !== null);
  expect(trafione).toBe(true);
  for (const t of ["'DE-FSN': 'Niemcy, Falkenstein'", "'/var/log/directadmin/error.log'", "'/opt/verris/ops/scripts/verris-node.sh'", '/Direct\\s*Admin|Cloud\\s*Linux/']) {
    expect(slowoZaplecza(t)).not.toBeNull();
  }
  // Polskie „nie da się”, wtyczka „LiteSpeed Cache” i „1 zł = 1 kredyt” nie są zapleczem.
  for (const t of ["'Tego nie da się cofnąć'", "'LiteSpeed Cache'", "'1 zł = 1 kredyt'", "'.cloud'"]) {
    expect(slowoZaplecza(t)).toBeNull();
  }
});

it('decyzja 24 – katalog wersji PHP węzła (/opt/alt/) bez wyjątku w kodzie przeglądarki; krótka nazwa /usr/local/bin/phpXY dozwolona', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { slowoZapleczaWBuildzie } = require('../../scripts/slowa-zaplecza.cjs') as { slowoZapleczaWBuildzie: (t: string) => string | null };
  // Do 4.11 skrypt po buildzie przepuszczał `/opt/alt/…` (podpowiedź crona) — teraz to wyciek.
  expect(slowoZapleczaWBuildzie('`/opt/alt/php${v}/usr/bin/php`')).toBe('/opt/alt');
  // Podpowiedź z zakładki Cron w postaci po minifikacji (szablon albo concat) przechodzi; inne /usr/local/ — nie.
  for (const t of ['`/usr/local/bin/php${v} -q $HOME/domains/`', '"/usr/local/bin/php".concat(v)']) expect(slowoZapleczaWBuildzie(t)).toBeNull();
  for (const t of ['/usr/local/directadmin/conf', '/usr/local/bin/phpmyadmin', '/usr/local/lsws/bin']) expect(slowoZapleczaWBuildzie(t)).not.toBeNull();
  // Wyjątek „DirectAdmin” (panel źródłowy w kreatorze migracji) zostaje tylko w kodzie panelu, nie w kontraktach.
  expect(slowoZapleczaWBuildzie('DirectAdmin')).toBeNull();
  expect(slowoZaplecza('DirectAdmin')).not.toBeNull();
  // Żaden plik źródłowy panelu (poza testami) nie podaje klientowi ścieżki alt-php.
  const zle = pliki(SRC).filter((p) => /\/opt\/alt\b/.test(bezKomentarzy(readFileSync(p, 'utf8'))));
  expect(zle).toEqual([]);
});

/**
 * Paczka 120 – Verris Kreator. Pełne wejście `@verris/kreator` niesie renderer (CSS/JS stron) i master prompt AI
 * (know-how kreatora, kilkadziesiąt KB tekstu) – nie mogą trafić do przeglądarki. Komponenty panelu biorą tylko
 * `@verris/kreator/klient` (model, katalogi, wersje, style); pełne wejście wolno w modułach serwerowych:
 * trasach `app/api/**` (route handlery nie trafiają do przeglądarki), `'use server'` i modułach z `next/headers`.
 */
const KREATOR = resolve(__dirname, '../../../../libs/kreator/src');

function serwerowyModul(sciezkaWzgledna: string, kod: string): boolean {
  return sciezkaWzgledna.startsWith('app/api/') || /^\s*['"]use server['"]/m.test(kod) || /from\s+['"]next\/headers['"]/.test(kod);
}

it('kreator: pełne wejście @verris/kreator tylko w modułach serwerowych, komponenty – @verris/kreator/klient', () => {
  const zle: string[] = [];
  for (const p of pliki(SRC)) {
    const kod = readFileSync(p, 'utf8');
    if (!/from\s+['"]@verris\/kreator['"]|import\(\s*['"]@verris\/kreator['"]/.test(kod)) continue;
    const wzgl = p.slice(SRC.length + 1);
    if (!serwerowyModul(wzgl, kod)) zle.push(wzgl);
  }
  expect(zle).toEqual([]);
  // Trasa podglądu renderuje po stronie serwera Next – to jedyne miejsce panelu z rendererem.
  expect(readFileSync(join(SRC, 'app/api/kreator/podglad/route.ts'), 'utf8')).toMatch(/from '@verris\/kreator'/);
});

it('kreator: drzewo wejścia klienckiego (klient.ts) nie sięga renderera ani master promptu', () => {
  const osiagalne = [...drzewo(join(KREATOR, 'klient.ts')).keys()].map((p) => p.slice(KREATOR.length + 1));
  expect(osiagalne.filter((p) => p.startsWith('render/') || (p.startsWith('ai/') && p !== 'ai/kontrakt.ts') || p.startsWith('przyklady/'))).toEqual([]);
  expect(osiagalne).toEqual(expect.arrayContaining(['model.ts', 'katalog.ts', 'plany.ts', 'style/katalog-stylow.ts']));
});

it('kreator: strażnik łapie pełne wejście (index.ts sięga renderera i master promptu)', () => {
  const pelne = [...drzewo(join(KREATOR, 'index.ts')).keys()].map((p) => p.slice(KREATOR.length + 1));
  expect(pelne).toEqual(expect.arrayContaining(['render/index.ts', 'ai/master-prompt.ts']));
  expect(serwerowyModul('app/dashboard/kreator/edytor/edytor.tsx', "'use client';\nimport { renderujStrone } from '@verris/kreator';")).toBe(false);
});
