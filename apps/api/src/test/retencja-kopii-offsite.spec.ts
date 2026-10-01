import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * H-03 — retencja kopii poza serwerem per konto (ops/scripts/node-offsite-backup.sh, tryb `retencja`).
 * Uruchamiamy prawdziwy skrypt; rclone działa na katalogu lokalnym (atrapa lsf/purge/rmdirs), verris-fetch
 * zwraca listę `<login> <dni>` jak GET /agent/tasks/backup-retention albo kod błędu.
 * Dawniej węzeł kasował CAŁE dni starsze niż RETENTION_DAYS floty — wybór klienta nie miał znaczenia.
 */
const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-offsite-backup.sh');

const dzien = (dniTemu: number) => {
  const d = new Date(Date.now() - dniTemu * 86_400_000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
};

function przygotuj(retencjaFloty: string, lista: string | null) {
  const DIR = mkdtempSync(join(tmpdir(), 'retencja-'));
  const zdalny = join(DIR, 'zdalny');
  const wersje = join(zdalny, 'nodes', 'n1-versions');
  const bin = join(DIR, 'bin');
  mkdirSync(bin);
  mkdirSync(wersje, { recursive: true });
  writeFileSync(join(DIR, 'verris.conf'), 'VERRIS_SERVER_ID=s1\nVERRIS_IDENTITY_TOKEN=t\nVERRIS_API_URL=http://127.0.0.1:9\n');
  writeFileSync(
    join(DIR, 'verris-backup.conf'),
    `RCLONE_REMOTE="verris-crypt:"\nBACKUP_PREFIX="nodes/n1"\nRETENTION_DAYS=${retencjaFloty}\nDA_BACKUP=1\n`,
  );
  const atrapy: Record<string, string> = {
    rclone: `#!/bin/bash
p() { echo "${zdalny}/\${1#verris-crypt:}"; }
case "$1" in
  lsf) [ "$2" = "--dirs-only" ] || exit 9; d="$(p "$3")"; [ -d "$d" ] || exit 3
       for f in "$d"/*; do [ -d "$f" ] && echo "$(basename "$f")/"; done; exit 0 ;;
  purge) rm -rf "$(p "$2")" ;;
  rmdirs) find "$(p "$2")" -depth -type d -empty -delete ;;
  *) exit 9 ;;
esac
`,
    'verris-fetch':
      lista === null
        ? '#!/bin/bash\nexit 1\n'
        : `#!/bin/bash\n[ "$1" = /agent/tasks/backup-retention ] || exit 9\ncat > "$2" <<'L'\n${lista}L\n`,
  };
  for (const [n, t] of Object.entries(atrapy)) {
    writeFileSync(join(bin, n), t);
    chmodSync(join(bin, n), 0o755);
  }
  const wersja = (dniTemu: number, konto: string) => {
    const d = join(wersje, dzien(dniTemu), konto, 'backups');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, `user.admin.${konto}.tar.zst`), 'x');
  };
  const uruchom = () =>
    spawnSync('bash', [SKRYPT, 'retencja'], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        VERRIS_CONF: join(DIR, 'verris.conf'),
        VERRIS_BACKUP_CONF: join(DIR, 'verris-backup.conf'),
      },
      encoding: 'utf8',
    });
  const jest = (dniTemu: number, konto?: string) =>
    existsSync(konto ? join(wersje, dzien(dniTemu), konto) : join(wersje, dzien(dniTemu)));
  return { DIR, wersja, uruchom, jest, dni: () => readdirSync(wersje).sort() };
}

describe('retencja kopii poza serwerem per konto (H-03)', () => {
  const sprzatnij: string[] = [];
  afterAll(() => sprzatnij.forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('każde konto traci wersje dopiero po swojej retencji; konto spoza listy — retencja floty', () => {
    const t = przygotuj('30', 'a1 30\nb1 60\n');
    sprzatnij.push(t.DIR);
    for (const k of ['a1', 'b1', 'c1']) {
      t.wersja(29, k);
      t.wersja(31, k);
      t.wersja(59, k);
      t.wersja(61, k);
    }
    const r = t.uruchom();
    expect(r.status).toBe(0);
    // a1: 30 dni
    expect(t.jest(29, 'a1')).toBe(true);
    expect(t.jest(31, 'a1')).toBe(false);
    // b1: 60 dni
    expect(t.jest(31, 'b1')).toBe(true);
    expect(t.jest(59, 'b1')).toBe(true);
    expect(t.jest(61, 'b1')).toBe(false);
    // c1 (np. konto usunięte) — RETENTION_DAYS floty
    expect(t.jest(29, 'c1')).toBe(true);
    expect(t.jest(31, 'c1')).toBe(false);
    // dzień, z którego nic nie zostało, znika w całości
    expect(t.jest(61)).toBe(false);
  });

  it('wartości spoza granic: konto i flota nie schodzą poniżej 30 dni, nic nie leży dłużej niż 90', () => {
    const t = przygotuj('14', 'a1 7\nb1 365\nzly-login 60\n');
    sprzatnij.push(t.DIR);
    for (const k of ['a1', 'b1', 'c1']) {
      t.wersja(20, k);
      t.wersja(89, k);
      t.wersja(91, k);
    }
    const r = t.uruchom();
    expect(r.status).toBe(0);
    expect(t.jest(20, 'a1')).toBe(true);
    expect(t.jest(20, 'c1')).toBe(true);
    expect(t.jest(89, 'a1')).toBe(false);
    expect(t.jest(89, 'b1')).toBe(true);
    expect(t.jest(91)).toBe(false);
  });

  it('bez listy z panelu nie skraca niczego poniżej 90 dni (nie wiemy, ile opłacił klient)', () => {
    const t = przygotuj('30', null);
    sprzatnij.push(t.DIR);
    t.wersja(45, 'a1');
    t.wersja(91, 'a1');
    const r = t.uruchom();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('brak retencji kont z control-plane');
    expect(t.jest(45, 'a1')).toBe(true);
    expect(t.jest(91)).toBe(false);
  });

  it('pierwszy przebieg: brak katalogu wersji nie przerywa skryptu', () => {
    const t = przygotuj('30', 'a1 30\n');
    sprzatnij.push(t.DIR);
    rmSync(join(t.DIR, 'zdalny', 'nodes', 'n1-versions'), { recursive: true });
    expect(t.uruchom().status).toBe(0);
  });
});
