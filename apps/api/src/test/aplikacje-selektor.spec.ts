import { execFileSync, spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * B-08/B-09 — node-app-selector.sh wykonany naprawdę, z atrapą `cloudlinux-selector`:
 * wartości klienta idą osobnymi argumentami (bez powłoki), odmowa selektora kończy zadanie
 * jego komunikatem, katalog w public_html jest odrzucany, a lista pokazuje tylko to konto.
 */
const SKRYPT = join(__dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-app-selector.sh');
const UZYTKOWNIK = execFileSync('id', ['-un'], { encoding: 'utf8' }).trim();
const itKonto = /^[a-z][a-z0-9]{0,15}$/.test(UZYTKOWNIK) ? it : it.skip;

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
  let wywolania: string[][] = [];
  try {
    wywolania = readFileSync(argsPlik, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\0').filter(Boolean));
  } catch {
    wywolania = [];
  }
  const m = /^VERRIS_APPS=(\S+)$/m.exec(r.stdout);
  const wynik = m ? (JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) as { apps: { root: string; status: string }[]; versions: Record<string, string[]> }) : null;
  return { ...r, wywolania, wynik };
}

describe('B-08/B-09 — node-app-selector.sh', () => {
  itKonto('lista: tylko aplikacje tego konta i tylko włączone wersje', () => {
    const r = uruchom({ AS_MODE: 'list' });
    expect(r.status).toBe(0);
    expect(r.wynik?.apps.map((a) => a.root)).toEqual(['apps/api']);
    expect(r.wynik?.versions).toEqual({ nodejs: ['22'], python: ['3.12'] });
  });

  itKonto('create: wartości klienta dosłownie w osobnych argumentach, bez powłoki', () => {
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

  itKonto('odmowa selektora kończy zadanie błędem z jego komunikatem', () => {
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
      AS_STARTUP: 'passenger_wsgi.py', AS_ENTRY: 'application', ...zle,
    });
    expect(r.status).not.toBe(0);
    if (/^[a-z][a-z0-9]{0,15}$/.test(UZYTKOWNIK)) expect(r.stderr).toContain(komunikat);
    expect(r.wywolania.filter((w) => w[0] !== 'get')).toEqual([]);
  });
});
