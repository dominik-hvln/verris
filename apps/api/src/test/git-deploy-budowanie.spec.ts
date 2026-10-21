import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * 21.10 — repozytorium strony w public_html: .git był do pobrania z internetu (https://domena/.git/config,
 * obiekty → pełny kod z historią). Teraz po clone/pull .git ma 0700, zmienne z panelu idą do .env (0600,
 * poza „git status”), a po pobraniu kodu opcjonalnie budowanie (npm ci / npm run build / composer).
 * Funkcje skryptu wykonywane naprawdę; runuser i Node.js z CloudLinux zastąpione atrapami.
 */
const skrypt = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-git-deploy.sh'), 'utf8');
const funkcja = (nazwa: string) => {
  const start = skrypt.indexOf(`\n${nazwa}() {`) + 1;
  expect(start).toBeGreaterThan(0);
  const linia = skrypt.slice(start, skrypt.indexOf('\n', start) + 1);
  return linia.trimEnd().endsWith('}') ? linia : skrypt.slice(start, skrypt.indexOf('\n}\n', start) + 3);
};
const NAGLOWEK = /^NAGLOWEK_ENV="[^"]*"$/m.exec(skrypt)?.[0] ?? '';
const FUNKCJE = NAGLOWEK + '\n' + ['log', 'fail', 'zabezpiecz_repo', 'zapisz_env', 'fail_build', 'buduj_jako_klient', 'zbuduj'].map(funkcja).join('');
const ATRAPY = `jako_klient() { "$@"; }\nrunuser() { while [ "$1" != "--" ]; do shift; done; shift; "$@"; }\n`;

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'gd-'));
  const cel = join(dir, 'public_html');
  mkdirSync(cel);
  spawnSync('git', ['init', '-q', cel]);
  return { dir, cel };
}
const bash = (env: Record<string, string>, kod: string) =>
  spawnSync('bash', ['-c', `set -Eeuo pipefail\n${ATRAPY}${FUNKCJE}\n${kod}`], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', GD_DA_USER: 'klient', GD_BUILD: '', GD_ENV_B64: '', GD_ENV_MODE: '', ...env },
  });
const b64 = (s: string) => Buffer.from(s).toString('base64');

describe('node-git-deploy.sh — ochrona .git, .env z panelu i budowanie', () => {
  it('.git dostaje 0700, a /.env trafia do .git/info/exclude raz (także przy kolejnych pull)', () => {
    const { cel } = repo();
    chmodSync(join(cel, '.git'), 0o755);
    const r = bash({ CEL: cel }, 'zabezpiecz_repo; zabezpiecz_repo');
    expect(r.status).toBe(0);
    expect(statSync(join(cel, '.git')).mode & 0o777).toBe(0o700);
    const exclude = readFileSync(join(cel, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude.split('\n').filter((l) => l === '/.env')).toHaveLength(1);
  });

  it('zmienne → .env z uprawnieniami 0600 i licznikiem; bez zmiennych .env nie jest ruszany', () => {
    const { cel } = repo();
    const r = bash({ CEL: cel, GD_ENV_B64: b64("APP_KEY='abc def'\nDB_HOST=localhost") }, 'zapisz_env');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('VERRIS_GIT_ENV=2');
    const naglowek = NAGLOWEK.slice('NAGLOWEK_ENV="'.length, -1);
    expect(readFileSync(join(cel, '.env'), 'utf8')).toBe(`${naglowek}\nAPP_KEY='abc def'\nDB_HOST=localhost\n`);
    expect(statSync(join(cel, '.env')).mode & 0o777).toBe(0o600);
    // panel: klient skasował wszystkie zmienne → .env z nagłówkiem panelu znika
    expect(bash({ CEL: cel, GD_ENV_MODE: 'panel' }, 'zapisz_env').stdout).toContain('VERRIS_GIT_ENV=0');
    expect(existsSync(join(cel, '.env'))).toBe(false);
    // własny .env klienta (bez nagłówka) zostaje nietknięty — także w trybie panelu
    writeFileSync(join(cel, '.env'), 'RECZNY=1\n');
    expect(bash({ CEL: cel }, 'zapisz_env').stdout).toContain('VERRIS_GIT_ENV=brak');
    expect(bash({ CEL: cel, GD_ENV_MODE: 'panel' }, 'zapisz_env').stdout).toContain('VERRIS_GIT_ENV=brak');
    expect(readFileSync(join(cel, '.env'), 'utf8')).toBe('RECZNY=1\n');
  });

  it('.env śledzony w repozytorium i zła linia → odmowa bez nadpisania', () => {
    const { cel } = repo();
    writeFileSync(join(cel, '.env'), 'Z_REPO=1\n');
    spawnSync('git', ['-C', cel, 'add', '.env']);
    const r = bash({ CEL: cel, GD_ENV_B64: b64('A=1') }, 'zapisz_env');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('plik .env jest w repozytorium');
    expect(readFileSync(join(cel, '.env'), 'utf8')).toBe('Z_REPO=1\n');
    const zla = bash({ CEL: repo().cel, GD_ENV_B64: b64('a-b=1') }, 'zapisz_env');
    expect(zla.status).toBe(1);
    expect(zla.stderr).toContain('nieprawidłowa zmienna');
  });

  it('npm-build: npm ci i npm run build z Node.js z CloudLinux; wynik ok i czas', () => {
    const { dir, cel } = repo();
    writeFileSync(join(cel, 'package.json'), '{}');
    writeFileSync(join(cel, 'package-lock.json'), '{}');
    const bin = join(dir, 'alt', 'alt-nodejs22', 'root', 'usr', 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'npm'), `#!/bin/bash\necho "npm $*" >> "${join(dir, 'wywolania')}"\n`);
    chmodSync(join(bin, 'npm'), 0o755);
    const r = bash({ CEL: cel, GD_BUILD: 'npm-build', VERRIS_ALT_ROOT: join(dir, 'alt'), HOME_DIR: dir }, 'zbuduj');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('VERRIS_GIT_BUILD=ok');
    expect(r.stdout).toMatch(/VERRIS_GIT_BUILD_S=\d+/);
    expect(readFileSync(join(dir, 'wywolania'), 'utf8')).toBe('npm ci --no-audit --no-fund\nnpm run build --if-present\n');
  });

  it('błąd budowania, przekroczony czas i brak package-lock → znacznik „blad” i jasny komunikat', () => {
    const { dir, cel } = repo();
    writeFileSync(join(cel, 'package.json'), '{}');
    const bez = bash({ CEL: cel, GD_BUILD: 'npm-ci', HOME_DIR: dir }, 'zbuduj');
    expect(bez.status).toBe(1);
    expect(bez.stdout).toContain('VERRIS_GIT_BUILD=blad');
    expect(bez.stderr).toContain('package-lock.json');

    writeFileSync(join(cel, 'package-lock.json'), '{}');
    const bin = join(dir, 'alt', 'alt-nodejs20', 'root', 'usr', 'bin');
    mkdirSync(bin, { recursive: true });
    for (const [kod, tekst] of [[2, 'nie powiodło się (kod 2)'], [124, 'przekroczyło 15 minut']] as const) {
      writeFileSync(join(bin, 'npm'), `#!/bin/bash\necho "ERR! build"\nexit ${kod}\n`);
      chmodSync(join(bin, 'npm'), 0o755);
      const r = bash({ CEL: cel, GD_BUILD: 'npm-ci', VERRIS_ALT_ROOT: join(dir, 'alt'), HOME_DIR: dir }, 'zbuduj');
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('ERR! build');
      expect(r.stdout).toContain('VERRIS_GIT_BUILD=blad');
      expect(r.stderr).toContain(tekst);
    }
  });

  it('bez budowania → „brak”; skrypt odrzuca nieznany sposób i chroni .git przy clone i pull', () => {
    expect(bash({ CEL: repo().cel }, 'zbuduj').stdout).toContain('VERRIS_GIT_BUILD=brak');
    expect(skrypt).toContain('[[ "$GD_BUILD" =~ ^(|npm-build|npm-ci|composer)$ ]] || fail');
    expect(skrypt).toMatch(/utrwal_repo\n\s+zabezpiecz_repo\n\s+zapisz_env\n\s+zbuduj\n\s+;;/);
    expect(skrypt).toMatch(/pull\)\n[^\n]*\n\s+utrwal_repo\n\s+zabezpiecz_repo/);
  });
});
