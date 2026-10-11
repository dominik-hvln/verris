import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { HARMONOGRAM_OFFSITE } from '../servers/kopie-kont.js';

/**
 * F3.3 — raport przebiegu kopii poza serwerem niesie wynik KAŻDEGO konta (ops/scripts/node-offsite-backup.sh, tryb run).
 * Prawdziwy skrypt; DirectAdmin, rclone, verris-fetch i curl to atrapy, curl zapisuje wysłane ciało do pliku.
 * Wcześniej panel znał tylko przebieg węzła — konto, którego kopia się nie udała, wyglądało na chronione.
 */
const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-offsite-backup.sh');

function przygotuj(o: { nieudaneDa?: string[]; rcloneRc?: number }) {
  const DIR = mkdtempSync(join(tmpdir(), 'kopie-kont-'));
  const bin = join(DIR, 'bin');
  const da = join(DIR, 'da');
  const home = join(DIR, 'home');
  mkdirSync(bin);
  mkdirSync(join(home, 'admin', 'admin_backups'), { recursive: true });
  for (const [u, typ] of [['ala', 'user'], ['bob', 'user'], ['cyd', 'user'], ['admin', 'admin']] as const) {
    mkdirSync(join(da, 'data', 'users', u), { recursive: true });
    writeFileSync(join(da, 'data', 'users', u, 'user.conf'), `usertype=${typ}\ncreator=admin\n`);
  }
  const nieudane = (o.nieudaneDa ?? []).join(' ');
  writeFileSync(
    join(da, 'directadmin'),
    `#!/bin/bash
[ "$1" = admin-backup ] || exit 9
dest="\${2#--destination=}"; user="\${3#--user=}"
for n in ${nieudane}; do [ "$n" = "$user" ] && exit 1; done
head -c $(( \${#user} * 1000 )) /dev/zero > "$dest/user.admin.$user.tar.zst"
`,
  );
  chmodSync(join(da, 'directadmin'), 0o755);
  writeFileSync(join(DIR, 'verris.conf'), 'VERRIS_SERVER_ID=s1\nVERRIS_IDENTITY_TOKEN=t\nVERRIS_API_URL=http://127.0.0.1:9\n');
  writeFileSync(join(DIR, 'verris-backup.conf'), 'RCLONE_REMOTE="verris-crypt:"\nBACKUP_PREFIX="nodes/n1"\nRETENTION_DAYS=30\nDA_BACKUP=1\n');
  const cialo = join(DIR, 'cialo.json');
  const atrapy: Record<string, string> = {
    rclone: `#!/bin/bash\ncase "$1" in sync) exit ${o.rcloneRc ?? 0} ;; lsf) exit 3 ;; *) exit 0 ;; esac\n`,
    'verris-fetch': '#!/bin/bash\nexit 1\n',
    curl: `#!/bin/bash\nfor a in "$@"; do case "$a" in @*) cp "\${a#@}" "${cialo}" ;; esac; done\nexit 0\n`,
  };
  for (const [n, t] of Object.entries(atrapy)) {
    writeFileSync(join(bin, n), t);
    chmodSync(join(bin, n), 0o755);
  }
  const uruchom = () =>
    spawnSync('bash', [SKRYPT, 'run'], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        VERRIS_CONF: join(DIR, 'verris.conf'),
        VERRIS_BACKUP_CONF: join(DIR, 'verris-backup.conf'),
        VERRIS_DA_DIR: da,
        VERRIS_HOME: home,
      },
      encoding: 'utf8',
    });
  const raport = () => JSON.parse(readFileSync(cialo, 'utf8')) as { ok: boolean; accounts: number; konta?: Array<{ u: string; ok: boolean; b: number }> };
  return { DIR, uruchom, raport, home };
}

describe('F3.3 — raport kopii poza serwerem z wynikiem każdego konta', () => {
  const sprzatnij: string[] = [];
  afterAll(() => sprzatnij.forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('udany przebieg: każde konto (bez kont administratora) z rozmiarem swojego archiwum', () => {
    const t = przygotuj({});
    sprzatnij.push(t.DIR);
    const r = t.uruchom();
    expect(r.status).toBe(0);
    const p = t.raport();
    expect(p.ok).toBe(true);
    const konta = [...(p.konta ?? [])].sort((a, b) => a.u.localeCompare(b.u));
    expect(konta.map((k) => [k.u, k.ok])).toEqual([['ala', true], ['bob', true], ['cyd', true]]);
    // archiwum atrapy ma długość loginu × 1000 bajtów
    expect(konta.every((k) => k.b === 3000)).toBe(true);
    expect(existsSync(join(t.home, '.verris-offsite'))).toBe(false);
  });

  it('konto, którego kopii DirectAdmin nie zrobił, jest w raporcie jako nieudane, reszta udana', () => {
    const t = przygotuj({ nieudaneDa: ['bob'] });
    sprzatnij.push(t.DIR);
    const r = t.uruchom();
    expect(r.status).not.toBe(0);
    const p = t.raport();
    expect(p.ok).toBe(false);
    const wg = Object.fromEntries((p.konta ?? []).map((k) => [k.u, k]));
    expect(wg.bob).toEqual({ u: 'bob', ok: false, b: 0 });
    expect(wg.ala.ok).toBe(true);
    expect(wg.cyd.ok).toBe(true);
  });

  it('błąd synchronizacji z magazynem: żadne konto nie jest potwierdzone poza serwerem', () => {
    const t = przygotuj({ rcloneRc: 5 });
    sprzatnij.push(t.DIR);
    t.uruchom();
    const p = t.raport();
    expect(p.ok).toBe(false);
    expect((p.konta ?? []).length).toBe(3);
    expect((p.konta ?? []).every((k) => !k.ok)).toBe(true);
  });

  it('audyt Fali 3: duży węzeł (lista kont ponad 128 KiB) — raport dochodzi z każdym kontem (jq czyta listę z pliku)', () => {
    // Funkcja report() wprost ze skryptu (pełny przebieg na 3000 kontach trwa minutę): ta sama treść, atrapa curl.
    const t = przygotuj({});
    sprzatnij.push(t.DIR);
    const report = /^report\(\) \{[\s\S]*?^\}$/m.exec(readFileSync(SKRYPT, 'utf8'))![0];
    const lista = join(t.DIR, 'konta.txt');
    writeFileSync(lista, Array.from({ length: 3000 }, (_, i) => `k${String(i).padStart(15, '0')} 1 1234567890`).join('\n') + '\n');
    const r = spawnSync('bash', ['-c', `set -euo pipefail\nlog() { echo "$*"; }\nVERRIS_SERVER_ID=s1 VERRIS_IDENTITY_TOKEN=t VERRIS_API_URL=http://127.0.0.1:9\nKONTA_WYNIK="$1"\n${report}\nreport 1 3000 5 7 "rclone sync ok"\necho KONIEC`, 'x', lista], {
      env: { ...process.env, PATH: `${join(t.DIR, 'bin')}:${process.env.PATH}` },
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('KONIEC');
    const p = t.raport();
    expect(JSON.stringify(p.konta).length).toBeGreaterThan(131072);
    expect(p).toMatchObject({ ok: true, accounts: 3000 });
    expect(p.konta).toHaveLength(3000);
    expect(p.konta?.at(-1)).toEqual({ u: 'k000000000002999', ok: true, b: 1234567890 });
  });

  it('raport bez listy kont (np. brak rclone) — bez pola konta', () => {
    const t = przygotuj({});
    sprzatnij.push(t.DIR);
    const report = /^report\(\) \{[\s\S]*?^\}$/m.exec(readFileSync(SKRYPT, 'utf8'))![0];
    const r = spawnSync('bash', ['-c', `set -euo pipefail\nlog() { echo "$*"; }\nVERRIS_SERVER_ID=s1 VERRIS_IDENTITY_TOKEN=t VERRIS_API_URL=http://127.0.0.1:9\nKONTA_WYNIK=""\n${report}\nreport 0 0 0 0 "rclone not installed"`], {
      env: { ...process.env, PATH: `${join(t.DIR, 'bin')}:${process.env.PATH}` },
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
    expect(t.raport()).toEqual({ ok: false, accounts: 0, bytes: 0, durationSec: 0, info: 'rclone not installed' });
  });

  it('harmonogram w panelu zgadza się z timerem skryptu', () => {
    const s = readFileSync(SKRYPT, 'utf8');
    expect(s).toContain(`OnCalendar=*-*-* ${HARMONOGRAM_OFFSITE.godzina}:00`);
    expect(s).toContain(`RandomizedDelaySec=${HARMONOGRAM_OFFSITE.rozrzutMin * 60}`);
  });
});
