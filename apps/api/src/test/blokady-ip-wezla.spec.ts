import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * F3.2 (D5) — prawdziwy ops/scripts/node-ip-blocks.sh (zadanie IP_BLOCKS) na atrapie fail2ban-client: lista blokad
 * z czasem (get <jail> banip --with-time), odblokowanie (unban <IP>), biała lista (set <jail> addignoreip/delignoreip
 * + plik jail.d), walidacja adresu i brak interpolacji danych wejściowych do powłoki.
 */
const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-ip-blocks.sh');

// Atrapa w Pythonie (bez powłoki dla argumentów) — zachowanie i formaty wg fail2ban/client/beautifier.py i banmanager.py.
const ATRAPA = `#!/usr/bin/env python3
import os, sys
d = os.environ["FAKE_DIR"]
a = sys.argv[1:]
open(os.path.join(d, "wywolania"), "a").write(" ".join(a) + "\\n")
if os.environ.get("FAKE_PADA") == "1":
    print("ERROR  Failed to access socket path: /var/run/fail2ban/fail2ban.sock. Is fail2ban running?", file=sys.stderr); sys.exit(255)
jaile = open(os.path.join(d, "jaile")).read().split()
def bany(j):
    p = os.path.join(d, "bany-" + j)
    return [l for l in open(p).read().splitlines() if l] if os.path.exists(p) else []
if a == ["status"]:
    print("Status\\n|- Number of jail:\\t%d\\n\`- Jail list:\\t%s" % (len(jaile), ", ".join(jaile)))
elif len(a) == 4 and a[0] == "get" and a[2:] == ["banip", "--with-time"]:
    if a[1] not in jaile:
        print("Sorry but the jail '%s' does not exist" % a[1], file=sys.stderr); sys.exit(255)
    print("\\n".join("%s \\t%s + %s = %s" % tuple(l.split("|")) for l in bany(a[1])))
elif len(a) == 2 and a[0] == "unban":
    n = 0
    for j in jaile:
        z = bany(j); zost = [l for l in z if l.split("|")[0] != a[1]]; n += len(z) - len(zost)
        open(os.path.join(d, "bany-" + j), "w").write("\\n".join(zost) + "\\n")
    print(n)
elif len(a) == 4 and a[0] == "set" and a[2] in ("addignoreip", "delignoreip"):
    open(os.path.join(d, "ignore-" + a[1]), "a").write(a[2] + " " + a[3] + "\\n")
    print("These IP addresses/networks are ignored:\\n\`- " + a[3])
else:
    print("nieoczekiwane: " + " ".join(a), file=sys.stderr); sys.exit(2)
`;

function srodowisko() {
  const dir = mkdtempSync(join(tmpdir(), 'blokady-ip-'));
  const bin = join(dir, 'fail2ban-client');
  writeFileSync(bin, ATRAPA);
  chmodSync(bin, 0o755);
  const jailD = join(dir, 'fail2ban', 'jail.d');
  mkdirSync(jailD, { recursive: true });
  writeFileSync(join(jailD, 'verris.local'), '[DEFAULT]\nbantime = 1h\n\n[sshd]\nenabled = true\n');
  writeFileSync(join(dir, 'jaile'), 'sshd exim dovecot');
  writeFileSync(join(dir, 'bany-sshd'), '203.0.113.7|2026-10-10 10:00:00|3600|2026-10-10 11:00:00\n198.51.100.9|2026-10-10 10:05:00|3600|2026-10-10 11:05:00\n');
  writeFileSync(join(dir, 'bany-exim'), '203.0.113.7|2026-10-10 10:02:00|3600|2026-10-10 11:02:00\n');
  writeFileSync(join(dir, 'bany-dovecot'), '2001:db8::5|2026-10-10 09:00:00|-1|2026-10-10 09:00:00\n');
  const uruchom = (env: Record<string, string>) => {
    const r = spawnSync('bash', [SKRYPT], {
      env: { PATH: process.env.PATH, TZ: 'UTC', FAKE_DIR: dir, F2B_BIN: bin, IPB_JAIL_D: jailD, ...env },
      encoding: 'utf8',
    });
    return { rc: r.status, out: r.stdout, err: r.stderr, bany: r.stdout.split('\n').filter((l) => l.startsWith('VERRIS_IPB ')) };
  };
  const wywolania = () => (existsSync(join(dir, 'wywolania')) ? readFileSync(join(dir, 'wywolania'), 'utf8').trim().split('\n') : []);
  const plik = join(jailD, 'zz-verris-biala-lista.local');
  return { dir, jailD, plik, uruchom, wywolania };
}

describe('F3.2 — node-ip-blocks.sh (fail2ban)', () => {
  it('lista: jaile, blokady z czasem w UTC, stała blokada bez końca, podsumowanie', () => {
    const s = srodowisko();
    const r = s.uruchom({ IPB_MODE: 'list' });
    expect(r.rc).toBe(0);
    expect(r.out).toContain('VERRIS_IPB_JAIL sshd');
    expect(r.out).toContain('VERRIS_IPB_JAIL dovecot');
    expect(r.bany).toEqual([
      'VERRIS_IPB 203.0.113.7|sshd|2026-10-10T10:00:00Z|2026-10-10T11:00:00Z|3600',
      'VERRIS_IPB 198.51.100.9|sshd|2026-10-10T10:05:00Z|2026-10-10T11:05:00Z|3600',
      'VERRIS_IPB 203.0.113.7|exim|2026-10-10T10:02:00Z|2026-10-10T11:02:00Z|3600',
      'VERRIS_IPB 2001:db8::5|dovecot|2026-10-10T09:00:00Z|-|-1',
    ]);
    expect(r.out).toContain('VERRIS_IPB_RAZEM 4 4');
    expect(s.wywolania()).toEqual(['status', 'get sshd banip --with-time', 'get exim banip --with-time', 'get dovecot banip --with-time']);
  });

  it('sprawdzenie jednego IP: tylko jego blokady (wszystkie jaile)', () => {
    const r = srodowisko().uruchom({ IPB_MODE: 'list', IPB_IP: '203.0.113.7' });
    expect(r.rc).toBe(0);
    expect(r.bany.map((l) => l.split('|')[1])).toEqual(['sshd', 'exim']);
    expect(r.out).toContain('VERRIS_IPB_RAZEM 2 2');
  });

  it('odblokowanie: unban <IP> we wszystkich jailach, liczba odblokowań, pełna lista po', () => {
    const s = srodowisko();
    const r = s.uruchom({ IPB_MODE: 'unban', IPB_IP: '203.0.113.7' });
    expect(r.rc).toBe(0);
    expect(r.out).toContain('VERRIS_IPB_ODBLOKOWANO 2');
    // po operacji — pełna lista węzła (bez odblokowanego adresu)
    expect(r.bany.map((l) => l.split('|')[0])).toEqual(['VERRIS_IPB 198.51.100.9', 'VERRIS_IPB 2001:db8::5']);
    expect(r.out).toContain('VERRIS_IPB_RAZEM 2 2');
    expect(s.wywolania()).toContain('unban 203.0.113.7');
  });

  it('biała lista: plik jail.d z domyślnym 127.0.0.1/8 ::1, addignoreip w każdym jailu, odblokowanie; usunięcie', () => {
    const s = srodowisko();
    const r = s.uruchom({ IPB_MODE: 'allow', IPB_IP: '198.51.100.9' });
    expect(r.rc).toBe(0);
    expect(readFileSync(s.plik, 'utf8')).toContain('[DEFAULT]\nignoreip = 127.0.0.1/8 ::1 198.51.100.9\n');
    expect(s.wywolania()).toEqual(expect.arrayContaining(['set sshd addignoreip 198.51.100.9', 'set exim addignoreip 198.51.100.9', 'set dovecot addignoreip 198.51.100.9', 'unban 198.51.100.9']));
    expect(r.out).toContain('VERRIS_IPB_ALLOW 198.51.100.9');
    expect(r.out).toContain('VERRIS_IPB_ODBLOKOWANO 1');
    // drugi raz — bez duplikatu
    s.uruchom({ IPB_MODE: 'allow', IPB_IP: '198.51.100.9' });
    expect(readFileSync(s.plik, 'utf8').match(/198\.51\.100\.9/g)).toHaveLength(1);
    const d = s.uruchom({ IPB_MODE: 'disallow', IPB_IP: '198.51.100.9' });
    expect(d.rc).toBe(0);
    expect(readFileSync(s.plik, 'utf8')).toContain('ignoreip = 127.0.0.1/8 ::1\n');
    expect(d.out).not.toContain('VERRIS_IPB_ALLOW');
    expect(s.wywolania()).toContain('set exim delignoreip 198.51.100.9');
  });

  it('ignoreip ustawione w innym pliku — odmowa, nic nie zmienione (nie nadpisujemy cudzej listy)', () => {
    const s = srodowisko();
    writeFileSync(join(s.jailD, 'wlasne.local'), '[DEFAULT]\nignoreip = 127.0.0.1/8 10.1.1.1\n');
    const r = s.uruchom({ IPB_MODE: 'allow', IPB_IP: '198.51.100.9' });
    expect(r.rc).not.toBe(0);
    expect(r.err).toContain('ignoreip ustawione poza panelem');
    expect(existsSync(s.plik)).toBe(false);
    expect(s.wywolania().filter((w) => w.startsWith('set') || w.startsWith('unban'))).toEqual([]);
  });

  it.each([
    ['203.0.113.7; rm -rf /'],
    ['$(id)'],
    ['203.0.113.07'],
    ['--all'],
    ['1.2.3.4 5.6.7.8'],
    ['2001:DB8::5'],
    ['fe80::1%eth0'],
  ])('adres %j — odmowa przed fail2ban-client', (ip) => {
    const s = srodowisko();
    const r = s.uruchom({ IPB_MODE: 'unban', IPB_IP: ip });
    expect(r.rc).not.toBe(0);
    expect(s.wywolania()).toEqual([]);
  });

  it('biała lista nie przyjmuje adresów specjalnych (0.0.0.0, pętla, multicast)', () => {
    for (const ip of ['0.0.0.0', '127.0.0.1', '224.0.0.1', '::1']) {
      const s = srodowisko();
      expect(s.uruchom({ IPB_MODE: 'allow', IPB_IP: ip }).rc).not.toBe(0);
      expect(s.wywolania()).toEqual([]);
    }
  });

  it('przegląd: usunięcie z białej listy tylko adresu dodanego przez panel (nie ::1 z wartości domyślnej, nie spoza listy)', () => {
    for (const ip of ['::1', '198.51.100.9']) {
      const s = srodowisko();
      const r = s.uruchom({ IPB_MODE: 'disallow', IPB_IP: ip });
      expect(r.rc).not.toBe(0);
      expect(r.err).toContain('nie ma na białej liście');
      expect(s.wywolania().filter((w) => w.startsWith('set') || w.startsWith('unban'))).toEqual([]);
      expect(existsSync(s.plik)).toBe(false);
    }
  });

  it('unban bez adresu i nieznany tryb — odmowa', () => {
    expect(srodowisko().uruchom({ IPB_MODE: 'unban' }).rc).not.toBe(0);
    expect(srodowisko().uruchom({ IPB_MODE: 'restart' }).rc).not.toBe(0);
  });

  it('błąd fail2ban = błąd zadania (nie „brak blokad”)', () => {
    const r = srodowisko().uruchom({ IPB_MODE: 'list', FAKE_PADA: '1' });
    expect(r.rc).not.toBe(0);
    expect(r.err).toContain('[ip-blocks] BŁĄD: fail2ban-client status');
    expect(r.out).not.toContain('VERRIS_IPB_RAZEM');
  });
});
