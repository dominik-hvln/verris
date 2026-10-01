import { execFileSync, spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sprawdzDane } from '../subscriptions/app-selector.service.js';

/**
 * B-08/B-09 — node-app-selector.sh wykonany naprawdę, z atrapą `cloudlinux-selector`:
 * wartości klienta idą osobnymi argumentami (bez powłoki), odmowa selektora kończy zadanie
 * jego komunikatem, katalog w public_html jest odrzucany, a lista pokazuje tylko to konto.
 */
const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-app-selector.sh');
const UZYTKOWNIK = execFileSync('id', ['-un'], { encoding: 'utf8' }).trim();
// Skrypt działa na węzłach (AlmaLinux + CloudLinux): potrzebuje getent i loginu w formacie DirectAdmina.
// Na macOS (brak getent) zestaw jest pomijany — w CI (Linux) wykonuje się zawsze.
const NA_WEZLE_PODOBNYM = process.platform === 'linux' && /^[a-z][a-z0-9]{0,15}$/.test(UZYTKOWNIK);
const opisz = NA_WEZLE_PODOBNYM ? describe : describe.skip;

function uruchom(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'as-'));
  const argsPlik = join(dir, 'args');
  const atrapa = join(dir, 'sel');
  writeFileSync(
    atrapa,
    `#!/usr/bin/env bash
for a in "$@"; do printf '%s\\0' "$a" >> "${argsPlik}"; done; printf '\\n' >> "${argsPlik}"
case "$1" in
  get) if [ "$4" = nodejs ]; then echo '{"result":"success","available_versions":{"22":{"status":"enabled","users":{"${UZYTKOWNIK}":{"applications":{"apps/api":{"domain":"a.pl","app_uri":"","startup_file":"app.js","app_status":"started","env_vars":{"X":"1"}}}},"obcy":{"applications":{"apps/cudze":{}}}}},"18":{"status":"disabled"}}}'; else echo '{"result":"success","available_versions":{"3.12":{"status":"enabled"}}}'; fi ;;
  stop) echo '{"result":"No such application"}' ;;
  *) echo '{"result":"success"}' ;;
esac
`,
  );
  chmodSync(atrapa, 0o755);
  const r = spawnSync('bash', [SKRYPT], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', AS_SELECTOR_BIN: atrapa, AS_DA_USER: UZYTKOWNIK, ...env },
  });
  let wywolania: string[][];
  try {
    wywolania = readFileSync(argsPlik, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\0').filter(Boolean));
  } catch {
    wywolania = [];
  }
  const m = /^VERRIS_APPS=(\S+)$/m.exec(r.stdout);
  const wynik = m ? (JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) as { apps: { root: string; status: string }[]; versions: Record<string, string[]> }) : null;
  return { ...r, wywolania, wynik };
}

opisz('B-08/B-09 — node-app-selector.sh', () => {
  it('lista: tylko aplikacje tego konta i tylko włączone wersje', () => {
    const r = uruchom({ AS_MODE: 'list' });
    expect(r.status).toBe(0);
    expect(r.wynik?.apps.map((a) => a.root)).toEqual(['apps/api']);
    expect(r.wynik?.versions).toEqual({ nodejs: ['22'], python: ['3.12'] });
  });

  it('create: wartości klienta dosłownie w osobnych argumentach, bez powłoki', () => {
    const env = { DB: 'x; rm -rf / $(id) `id`' };
    const r = uruchom({
      AS_MODE: 'create', AS_INTERPRETER: 'nodejs', AS_ROOT: 'apps/api', AS_DOMAIN: 'a.pl', AS_URI: '',
      AS_VERSION: '22', AS_STARTUP: 'app.js', AS_ENV_B64: Buffer.from(JSON.stringify(env)).toString('base64'),
    });
    expect(r.status).toBe(0);
    const create = r.wywolania.find((w) => w[0] === 'create')!;
    expect(create).toEqual(expect.arrayContaining(['--domain', 'a.pl', '--app-root', 'apps/api', '--version', '22', '--app-mode', 'production', '--json']));
    expect(JSON.parse(create[create.indexOf('--env-vars') + 1])).toEqual(env);
  });

  it('create: base64 zmiennych bez końcowego „=” (starszy agent go ucinał) — test D3 30.09', () => {
    const env = { VERRIS_TEST: 'ok' };
    const b64 = Buffer.from(JSON.stringify(env)).toString('base64');
    expect(b64.endsWith('=')).toBe(true);
    const r = uruchom({
      AS_MODE: 'create', AS_INTERPRETER: 'nodejs', AS_ROOT: 'apps/api', AS_DOMAIN: 'a.pl', AS_URI: '',
      AS_VERSION: '22', AS_STARTUP: 'app.js', AS_ENV_B64: b64.replace(/=+$/, ''),
    });
    expect(r.status).toBe(0);
    const create = r.wywolania.find((w) => w[0] === 'create')!;
    expect(JSON.parse(create[create.indexOf('--env-vars') + 1])).toEqual(env);
  });

  it('LiteSpeed: wersja Pythona bez lswsgi znika z listy i nie da się na niej utworzyć aplikacji — t1 01.10', () => {
    const alt = mkdtempSync(join(tmpdir(), 'alt-'));
    const lsws = join(alt, 'lswsctrl');
    writeFileSync(lsws, '#!/bin/sh\n');
    chmodSync(lsws, 0o755);
    for (const [d, lswsgi] of [['python312', false], ['python311', true]] as const) {
      mkdirSync(join(alt, d, 'bin'), { recursive: true });
      for (const plik of lswsgi ? ['python3', 'lswsgi'] : ['python3']) {
        writeFileSync(join(alt, d, 'bin', plik), '#!/bin/sh\n');
        chmodSync(join(alt, d, 'bin', plik), 0o755);
      }
    }
    const env = { AS_LSWS_BIN: lsws, AS_ALT_DIR: alt };
    expect(uruchom({ AS_MODE: 'list', ...env }).wynik?.versions).toEqual({ nodejs: ['22'], python: [] });
    const r = uruchom({
      AS_MODE: 'create', AS_INTERPRETER: 'python', AS_ROOT: 'apps/py', AS_DOMAIN: 'a.pl', AS_URI: '',
      AS_VERSION: '3.12', AS_STARTUP: 'app.py', AS_ENTRY: 'application', AS_ENV_B64: '', ...env,
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('Python 3.12 nie działa jeszcze na tym serwerze');
    expect(r.wywolania.find((w) => w[0] === 'create')).toBeUndefined();
    expect(uruchom({ ...{ AS_MODE: 'create', AS_INTERPRETER: 'python', AS_ROOT: 'apps/py', AS_DOMAIN: 'a.pl', AS_URI: '', AS_VERSION: '3.11', AS_STARTUP: 'app.py', AS_ENTRY: 'application', AS_ENV_B64: '' }, ...env }).status).toBe(0);
  });

  it('wersja do selektora jako główna (Node 24, Python 3.11) — t1 01.10: set odrzucał 24.21.0', () => {
    const u = uruchom({
      AS_MODE: 'update', AS_INTERPRETER: 'nodejs', AS_ROOT: 'apps/api', AS_DOMAIN: 'a.pl', AS_URI: '',
      AS_VERSION: '24.21.0', AS_STARTUP: 'app.js', AS_ENV_B64: '',
    });
    expect(u.status).toBe(0);
    const set = u.wywolania.find((w) => w[0] === 'set')!;
    expect(set[set.indexOf('--new-version') + 1]).toBe('24');
    const c = uruchom({
      AS_MODE: 'create', AS_INTERPRETER: 'python', AS_ROOT: 'apps/py', AS_DOMAIN: 'a.pl', AS_URI: '',
      AS_VERSION: '3.11.9', AS_STARTUP: 'app.py', AS_ENTRY: 'application', AS_ENV_B64: '',
    });
    const create = c.wywolania.find((w) => w[0] === 'create')!;
    expect(create[create.indexOf('--version') + 1]).toBe('3.11');
  });

  it('Python: plik startowy passenger_wsgi.py odrzucony (selektor zapisuje go sam — rekurencja, t1 01.10)', () => {
    const r = uruchom({
      AS_MODE: 'create', AS_INTERPRETER: 'python', AS_ROOT: 'apps/py', AS_DOMAIN: 'a.pl', AS_URI: '',
      AS_VERSION: '3.11', AS_STARTUP: 'passenger_wsgi.py', AS_ENTRY: 'application', AS_ENV_B64: '',
    });
    expect(r.status).not.toBe(0);
    expect(r.wywolania.find((w) => w[0] === 'create')).toBeUndefined();
    expect(() => sprawdzDane({ interpreter: 'python', root: 'apps/py', domain: 'a.pl', uri: '', version: '3.13', startup: 'passenger_wsgi.py' })).toThrow(/app\.py/);
    expect(sprawdzDane({ interpreter: 'nodejs', root: 'apps/n', domain: 'a.pl', uri: '', version: '24', startup: 'passenger_wsgi.py' }).startup).toBe('passenger_wsgi.py');
  });

  it('odmowa selektora kończy zadanie błędem z jego komunikatem', () => {
    const r = uruchom({ AS_MODE: 'stop', AS_INTERPRETER: 'nodejs', AS_ROOT: 'apps/api' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('BŁĄD: No such application');
  });

  it.each([
    [{ AS_ROOT: 'public_html/app' }, 'poza domains/'],
    [{ AS_ROOT: '../etc' }, 'katalog aplikacji'],
    [{ AS_VERSION: '22;id' }, 'wersja'],
    [{ AS_ENV_B64: Buffer.from('{"a b":"x"}').toString('base64') }, 'zmienne'],
    [{ AS_ENTRY: 'app()' }, 'obiekt aplikacji'],
  ])('odrzuca %o', (zle, komunikat) => {
    const r = uruchom({
      AS_MODE: 'create', AS_INTERPRETER: 'python', AS_ROOT: 'apps/api', AS_DOMAIN: 'a.pl', AS_VERSION: '3.12',
      AS_STARTUP: 'app.py', AS_ENTRY: 'application', ...zle,
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(komunikat);
    expect(r.wywolania.filter((w) => w[0] !== 'get')).toEqual([]);
  });
});
