import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * X-03 — wdrożenie z pominięciem bramki testów jest jawne i zapisane.
 *
 * Ścieżka automatyczna nie przepuszcza czerwonych testów od 2026-08-21, ale
 * trzy skrypty wdrożeniowe dało się odpalić na serwerze ręcznie — bez testów
 * i bez śladu. Te testy pilnują dwóch rzeczy: że biblioteka bramki naprawdę
 * odmawia (a nie tylko ma w komentarzu, że odmawia — X-17, X-21, X-23…) i że
 * każdy skrypt wdrożeniowy woła ją, ZANIM cokolwiek zmieni na serwerze.
 */

const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const BIBLIOTEKA = join(KORZEN, 'ops', 'scripts', 'lib', 'bramka-recznego-wdrozenia.sh');
const SKRYPTY = ['prod-deploy-ghcr.sh', 'prod-deploy-release.sh', 'prod-deploy-rolling.sh'];

function uruchom(env: Record<string, string>) {
  const kat = mkdtempSync(join(tmpdir(), 'x03-'));
  const dziennik = join(kat, 'log', 'wdrozenia.log');
  const r = spawnSync(
    'bash',
    ['-c', `set -Eeuo pipefail; . "${BIBLIOTEKA}"; bramka_recznego_wdrozenia test.sh abc123`],
    {
      cwd: kat,
      encoding: 'utf8',
      // Od zera, nie z process.env: w CI GITHUB_RUN_ID JEST ustawione, a test
      // ma sprawdzać bramkę, nie środowisko, w którym akurat biegnie.
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', WDROZENIE_DZIENNIK: dziennik, ...env },
    },
  );
  const wpisy = existsSync(dziennik)
    ? readFileSync(dziennik, 'utf8').split('\n').filter(Boolean)
    : [];
  return { kod: r.status, stderr: r.stderr, stdout: r.stdout, wpisy };
}

describe('X-03 — bramka ręcznego wdrożenia', () => {
  it('bez powodu odmawia i niczego nie zapisuje', () => {
    const r = uruchom({});
    expect(r.kod).toBe(2);
    expect(r.stderr).toContain('ODMOWA');
    expect(r.wpisy).toHaveLength(0);
  });

  it.each([
    ['za krótki', 'awaria'],
    ['same spacje', '                        '],
  ])('powód %s nie wystarcza', (_opis, powod) => {
    expect(uruchom({ WDROZENIE_RECZNE_POWOD: powod }).kod).toBe(2);
  });

  it('flaga Actions bez numeru przebiegu to nie przebieg Actions', () => {
    expect(uruchom({ VERRIS_WDROZENIE_Z_ACTIONS: '1' }).kod).toBe(2);
  });

  it('przebieg z GitHub Actions przechodzi bez pytań', () => {
    const r = uruchom({ VERRIS_WDROZENIE_Z_ACTIONS: '1', GITHUB_RUN_ID: '42' });
    expect(r.kod).toBe(0);
    expect(r.wpisy).toHaveLength(0);
  });

  it('wdrożenie ręczne z powodem przechodzi i zostawia jeden wpis w dzienniku', () => {
    const r = uruchom({ WDROZENIE_RECZNE_POWOD: 'rollback po awarii, tag abc123 był zielony' });
    expect(r.kod).toBe(0);
    expect(r.wpisy).toHaveLength(1);
    expect(r.wpisy[0]).toContain('skrypt=test.sh');
    expect(r.wpisy[0]).toContain('cel=abc123');
    expect(r.wpisy[0]).toContain('powod=rollback po awarii, tag abc123 był zielony');
  });

  it('nowa linia w powodzie nie podrobi drugiego wpisu', () => {
    const r = uruchom({
      WDROZENIE_RECZNE_POWOD: 'powód z nową linią\n2026-01-01T00:00:00Z skrypt=falszywy',
    });
    expect(r.kod).toBe(0);
    expect(r.wpisy).toHaveLength(1);
  });
});

/** Linie kodu bez komentarzy — strażnik nie może trafić na własne słowa. */
function kod(sciezka: string): string[] {
  return readFileSync(sciezka, 'utf8')
    .split('\n')
    .map((l) => l.replace(/^\s*#.*$/, ''))
    .map((l) => l.trim());
}

describe('X-03 — każdy skrypt wdrożeniowy woła bramkę przed zmianą na serwerze', () => {
  it.each(SKRYPTY)('%s', (skrypt) => {
    const linie = kod(join(KORZEN, 'ops', 'scripts', skrypt));
    const zrodlo = linie.findIndex((l) => /^\.\s+ops\/scripts\/lib\/bramka-recznego-wdrozenia\.sh$/.test(l));
    const wywolanie = linie.findIndex((l) => l.startsWith('bramka_recznego_wdrozenia '));
    const pierwszaZmiana = linie.findIndex((l) =>
      /^(git\b|git -c|docker\b|compose\s|"\$\{DC\[@\]\}"|REGISTRY_PREFIX=.*compose|bash ops\/)/.test(l),
    );

    expect(zrodlo).toBeGreaterThanOrEqual(0);
    expect(wywolanie).toBeGreaterThan(zrodlo);
    expect(pierwszaZmiana).toBeGreaterThan(wywolanie);
  });

  it('deploy.yml oznacza swój przebieg jako przeszły przez test-gate', () => {
    const linie = kod(join(KORZEN, '.github', 'workflows', 'deploy.yml'));
    const flaga = linie.findIndex((l) => l === 'export VERRIS_WDROZENIE_Z_ACTIONS=1');
    const run = linie.findIndex((l) => l.startsWith('export GITHUB_RUN_ID='));
    const deploy = linie.findIndex((l) => l.startsWith('bash ops/scripts/prod-deploy-ghcr.sh'));
    expect(flaga).toBeGreaterThanOrEqual(0);
    expect(run).toBeGreaterThanOrEqual(0);
    expect(deploy).toBeGreaterThan(Math.max(flaga, run));
  });
});
