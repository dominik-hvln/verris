import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { LOGI_WEZLA, USLUGI_WEZLA, maskujAdresy, maskujSekrety } from '@verris/contracts';

/**
 * F3.4 — prawdziwy ops/scripts/node-services.sh (zadanie NODE_SERVICES) na atrapach systemctl i journalctl: stan usług
 * z białej listy (pierwsza załadowana jednostka), restart z kontrolą stanu po, „tylko gdy stoi” dla usług wspólnych,
 * ogon logu z białej listy (maska adresów, sekrety, filtr bez wyrażeń regularnych), zero interpolacji wejścia.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const SKRYPT = join(KORZEN, 'ops', 'scripts', 'node-services.sh');

// Atrapa systemctl (Python, bez powłoki) — format `show --property=…` jak systemctl: wiersze Klucz=Wartość.
const ATRAPA_SYSTEMCTL = `#!/usr/bin/env python3
import json, os, sys
d = os.environ["FAKE_DIR"]
a = sys.argv[1:]
open(os.path.join(d, "wywolania"), "a").write(" ".join(a) + "\\n")
p = os.path.join(d, "jednostki.json")
j = json.load(open(p))
if len(a) == 3 and a[0] == "show" and a[2].startswith("--property="):
    u = j.get(a[1], {"LoadState": "not-found", "ActiveState": "inactive", "SubState": "dead"})
    for k in a[2].split("=", 1)[1].split(","):
        print("%s=%s" % (k, u.get(k, "")))
elif len(a) == 2 and a[0] == "restart":
    if os.environ.get("FAKE_RESTART_PADA") == "1":
        print("Job for %s failed because the control process exited with error code." % a[1], file=sys.stderr); sys.exit(1)
    j[a[1]]["ActiveState"] = os.environ.get("FAKE_PO_RESTARCIE", "active")
    j[a[1]]["SubState"] = "running" if j[a[1]]["ActiveState"] == "active" else "failed"
    j[a[1]]["ActiveEnterTimestampMonotonic"] = "999000000"
    json.dump(j, open(p, "w"))
else:
    print("nieoczekiwane: " + " ".join(a), file=sys.stderr); sys.exit(2)
`;

const ATRAPA_JOURNALCTL = `#!/usr/bin/env python3
import os, sys
d = os.environ["FAKE_DIR"]
open(os.path.join(d, "wywolania"), "a").write("journalctl " + " ".join(sys.argv[1:]) + "\\n")
print("2026-10-11T08:00:00+0000 t1 mariadbd[123]: [Note] Starting MariaDB")
print("2026-10-11T08:00:01+0000 t1 mariadbd[123]: [ERROR] Table './x/y' is marked as crashed")
`;

function srodowisko(jednostki: Record<string, Record<string, string>> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'uslugi-wezla-'));
  for (const [n, t] of [
    ['systemctl', ATRAPA_SYSTEMCTL],
    ['journalctl', ATRAPA_JOURNALCTL],
  ]) {
    writeFileSync(join(dir, n), t);
    chmodSync(join(dir, n), 0o755);
  }
  const domyslne: Record<string, Record<string, string>> = {
    'lsws.service': { LoadState: 'loaded', ActiveState: 'active', SubState: 'running', ActiveEnterTimestampMonotonic: '500000000', NRestarts: '0' },
    'exim.service': { LoadState: 'loaded', ActiveState: 'active', SubState: 'running', ActiveEnterTimestampMonotonic: '600000000', NRestarts: '2' },
    'dovecot.service': { LoadState: 'loaded', ActiveState: 'failed', SubState: 'failed', ActiveEnterTimestampMonotonic: '0', NRestarts: '5' },
    'mysqld.service': { LoadState: 'loaded', ActiveState: 'active', SubState: 'running', ActiveEnterTimestampMonotonic: '100000000', NRestarts: '0' },
    'fail2ban.service': { LoadState: 'loaded', ActiveState: 'active', SubState: 'running', ActiveEnterTimestampMonotonic: '700000000', NRestarts: '0' },
    'directadmin.service': { LoadState: 'loaded', ActiveState: 'inactive', SubState: 'dead', ActiveEnterTimestampMonotonic: '0' },
    'verris-tasks.timer': { LoadState: 'loaded', ActiveState: 'active', SubState: 'waiting', ActiveEnterTimestampMonotonic: '50000000' },
  };
  writeFileSync(join(dir, 'jednostki.json'), JSON.stringify({ ...domyslne, ...jednostki }));
  writeFileSync(join(dir, 'uptime'), '1000.00 3000.00\n');
  const root = join(dir, 'root');
  const plik = (sciezka: string, tresc: string) => {
    mkdirSync(dirname(join(root, sciezka)), { recursive: true });
    writeFileSync(join(root, sciezka), tresc);
  };
  const uruchom = (env: Record<string, string>) => {
    const r = spawnSync('bash', [SKRYPT], {
      env: {
        PATH: process.env.PATH,
        TZ: 'UTC',
        FAKE_DIR: dir,
        SYSTEMCTL_BIN: join(dir, 'systemctl'),
        JOURNALCTL_BIN: join(dir, 'journalctl'),
        SVC_ROOT: root,
        SVC_UPTIME: join(dir, 'uptime'),
        ...env,
      },
      encoding: 'utf8',
    });
    return {
      rc: r.status,
      out: r.stdout,
      err: r.stderr,
      svc: r.stdout.split('\n').filter((l) => l.startsWith('VERRIS_SVC ')),
      log: r.stdout.split('\n').filter((l) => l.startsWith('VERRIS_LOG ')).map((l) => l.slice('VERRIS_LOG '.length)),
    };
  };
  const wywolania = () => (existsSync(join(dir, 'wywolania')) ? readFileSync(join(dir, 'wywolania'), 'utf8').trim().split('\n') : []);
  return { dir, plik, uruchom, wywolania };
}

describe('F3.4 — node-services.sh: biała lista zgodna z panelem', () => {
  const t = readFileSync(SKRYPT, 'utf8');

  it('usługi: te same klucze, jednostki, „przerwa” i „restart” co libs/contracts (USLUGI_WEZLA)', () => {
    const zeSkryptu = [...t.matchAll(/^ {4}"([a-z0-9-]+)": \(\[([^\]]*)\], (True|False), (True|False)\),$/gm)].map((m) => ({
      klucz: m[1],
      jednostki: [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
      przerwa: m[3] === 'True',
      restart: m[4] === 'True',
    }));
    expect(zeSkryptu).toEqual(USLUGI_WEZLA.map((u) => ({ klucz: u.klucz, jednostki: [...u.jednostki], przerwa: u.przerwa, restart: u.restart })));
  });

  it('logi: te same klucze, pliki, dziennik usługi i flaga poczty co libs/contracts (LOGI_WEZLA)', () => {
    const zeSkryptu = [...t.matchAll(/^ {4}"([a-z0-9-]+)": \((None|"[^"]+"), (None|"[a-z0-9-]+"), (True|False)\),$/gm)].map((m) => ({
      klucz: m[1],
      plik: m[2] === 'None' ? undefined : m[2].slice(1, -1),
      journal: m[3] === 'None' ? undefined : m[3].slice(1, -1),
      poczta: m[4] === 'True',
    }));
    expect(zeSkryptu).toEqual(LOGI_WEZLA.map((l) => ({ klucz: l.klucz, plik: l.plik, journal: l.journal, poczta: l.poczta })));
    for (const l of LOGI_WEZLA) if (l.journal) expect(USLUGI_WEZLA.some((u) => u.klucz === l.journal)).toBe(true);
  });

  it('maski w skrypcie i w API dają to samo', () => {
    const linia = '2026-10-11 1abc <= jan.kowalski+x@firma.pl H=mx.example [203.0.113.7] password=tajne123 token=abc';
    const s = srodowisko();
    s.plik('/var/log/exim/mainlog', `${linia}\n`);
    const r = s.uruchom({ SVC_MODE: 'log', SVC_NAME: 'exim-main', SVC_MASK: '1' });
    expect(r.rc).toBe(0);
    expect(r.log).toEqual([maskujAdresy(maskujSekrety(linia))]);
    expect(r.log[0]).toContain('•••@firma.pl');
    expect(r.log[0]).not.toContain('tajne123');
  });
});

describe('F3.4 — node-services.sh: stan usług', () => {
  it('każda usługa z listy: pierwsza załadowana jednostka, stan, od kiedy (UTC), liczba restartów; brakująca — not-found', () => {
    const r = srodowisko().uruchom({ SVC_MODE: 'status' });
    expect(r.rc).toBe(0);
    const po = Object.fromEntries(r.svc.map((l) => [l.slice('VERRIS_SVC '.length).split('|')[0], l.slice('VERRIS_SVC '.length)]));
    expect(Object.keys(po)).toEqual(USLUGI_WEZLA.map((u) => u.klucz));
    expect(po.mariadb.split('|').slice(0, 5)).toEqual(['mariadb', 'mysqld.service', 'loaded', 'active', 'running']);
    expect(po.dovecot).toBe('dovecot|dovecot.service|loaded|failed|failed|-|5');
    expect(po.exim.split('|')[6]).toBe('2');
    expect(po.exim.split('|')[5]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(po.named).toBe('named|-|not-found|-|-|-|-');
  });
});

describe('F3.4 — node-services.sh: restart', () => {
  it('restart usługi z listy: systemctl restart jednostki, stan po, VERRIS_SVC_RESTART', () => {
    const s = srodowisko();
    const r = s.uruchom({ SVC_MODE: 'restart', SVC_NAME: 'fail2ban' });
    expect(r.rc).toBe(0);
    expect(r.out).toContain('VERRIS_SVC_RESTART fail2ban|fail2ban.service|active');
    expect(s.wywolania()).toContain('restart fail2ban.service');
  });

  it('usługa nie wstała po restarcie = błąd zadania (nie sukces)', () => {
    const r = srodowisko().uruchom({ SVC_MODE: 'restart', SVC_NAME: 'exim', FAKE_PO_RESTARCIE: 'failed' });
    expect(r.rc).not.toBe(0);
    expect(r.err).toContain('usługa nie działa po restarcie');
  });

  it('błąd systemctl restart = błąd zadania', () => {
    const r = srodowisko().uruchom({ SVC_MODE: 'restart', SVC_NAME: 'exim', FAKE_RESTART_PADA: '1' });
    expect(r.rc).not.toBe(0);
    expect(r.err).toContain('[services] BŁĄD: systemctl restart exim.service');
    expect(r.out).not.toContain('VERRIS_SVC_RESTART');
  });

  it('„tylko gdy stoi”: działającej usługi wspólnej nie restartuje (odmowa przed systemctl restart); stojącą uruchamia', () => {
    const s = srodowisko();
    const r = s.uruchom({ SVC_MODE: 'restart', SVC_NAME: 'mariadb', SVC_ONLY_DOWN: '1' });
    expect(r.rc).not.toBe(0);
    expect(r.err).toContain('usługa działa');
    expect(s.wywolania().some((w) => w.startsWith('restart'))).toBe(false);
    const d = s.uruchom({ SVC_MODE: 'restart', SVC_NAME: 'dovecot', SVC_ONLY_DOWN: '1' });
    expect(d.rc).toBe(0);
    expect(s.wywolania()).toContain('restart dovecot.service');
  });

  it.each([['sshd'], ['agent'], ['agent-lve']])('%s — tylko podgląd, restart odrzucony', (u) => {
    const s = srodowisko();
    const r = s.uruchom({ SVC_MODE: 'restart', SVC_NAME: u });
    expect(r.rc).not.toBe(0);
    expect(s.wywolania()).toEqual([]);
  });

  it.each([['exim; reboot'], ['$(id)'], ['exim.service'], ['../exim'], ['--all'], ['network']])('nazwa %j — odmowa przed systemctl', (n) => {
    const s = srodowisko();
    const r = s.uruchom({ SVC_MODE: 'restart', SVC_NAME: n });
    expect(r.rc).not.toBe(0);
    expect(s.wywolania()).toEqual([]);
  });

  it('nieznany tryb — odmowa', () => {
    expect(srodowisko().uruchom({ SVC_MODE: 'stop', SVC_NAME: 'exim' }).rc).not.toBe(0);
  });
});

describe('F3.4 — node-services.sh: logi', () => {
  const linie = Array.from({ length: 300 }, (_, i) => `2026-10-11 08:${String(i % 60).padStart(2, '0')} linia ${i}${i % 50 === 0 ? ' ERROR dysk' : ''}`).join('\n') + '\n';

  it('ogon N linii pliku z białej listy', () => {
    const s = srodowisko();
    s.plik('/usr/local/lsws/logs/error.log', linie);
    const r = s.uruchom({ SVC_MODE: 'log', SVC_NAME: 'www', SVC_LINES: '20' });
    expect(r.rc).toBe(0);
    expect(r.log).toHaveLength(20);
    expect(r.log[19]).toContain('linia 299');
    expect(r.out).toContain('VERRIS_LOG_ZRODLO www|/usr/local/lsws/logs/error.log|300|20|0');
  });

  it('filtr: fragment tekstu bez rozróżniania wielkości liter, nie wyrażenie regularne', () => {
    const s = srodowisko();
    s.plik('/usr/local/lsws/logs/error.log', `${linie}axyb\nliteralnie a.*b\n`);
    const r = s.uruchom({ SVC_MODE: 'log', SVC_NAME: 'www', SVC_FILTER: 'error dysk' });
    expect(r.log).toHaveLength(6);
    expect(s.uruchom({ SVC_MODE: 'log', SVC_NAME: 'www', SVC_FILTER: 'a.*b' }).log).toEqual(['literalnie a.*b']);
  });

  it('log poczty dla STAFF: adresy zamaskowane PRZED filtrem (szukanie po adresie nic nie zwraca)', () => {
    const s = srodowisko();
    s.plik('/var/log/exim/mainlog', '2026-10-11 08:00:00 1abc <= jan@firma.pl\n2026-10-11 08:00:01 1abc => ola@example.com\n');
    const r = s.uruchom({ SVC_MODE: 'log', SVC_NAME: 'exim-main', SVC_MASK: '1' });
    expect(r.log).toEqual(['2026-10-11 08:00:00 1abc <= •••@firma.pl', '2026-10-11 08:00:01 1abc => •••@example.com']);
    expect(s.uruchom({ SVC_MODE: 'log', SVC_NAME: 'exim-main', SVC_MASK: '1', SVC_FILTER: 'jan@' }).log).toEqual([]);
    // ADMIN (SVC_MASK=0) — adresy widoczne
    expect(s.uruchom({ SVC_MODE: 'log', SVC_NAME: 'exim-main', SVC_MASK: '0' }).log[0]).toContain('jan@firma.pl');
  });

  it('przegląd: log agenta — tylko wiersze agenta, bez stdout zadań (dziennik poczty kont, log poczty ADMIN-a bez maski)', () => {
    const s = srodowisko();
    s.plik(
      '/var/log/verris-tasks.log',
      [
        '[verris-tasks] Dispatching MAIL_LOG task t1 (instance=t1) at 2026-10-11T08:00:00Z',
        'VERRIS_ML 2026-10-11 07:59|1abc|<=|jan@firma.pl|H=mx.example',
        'VERRIS_LOG 2026-10-11 07:58 1abc => ola@example.com',
        '[verris-task-run] Starting task t2 (kind=NODE_SERVICES instance=t2)',
        'curl: (28) Operation timed out',
      ].join('\n') + '\n',
    );
    const r = s.uruchom({ SVC_MODE: 'log', SVC_NAME: 'agent' });
    expect(r.rc).toBe(0);
    expect(r.log).toEqual([
      '[verris-tasks] Dispatching MAIL_LOG task t1 (instance=t1) at 2026-10-11T08:00:00Z',
      '[verris-task-run] Starting task t2 (kind=NODE_SERVICES instance=t2)',
    ]);
    expect(r.out).not.toContain('jan@firma.pl');
    expect(r.out).not.toContain('ola@example.com');
  });

  it('dziennik usługi: journalctl -u <jednostka usługi> z listą argumentów', () => {
    const s = srodowisko();
    const r = s.uruchom({ SVC_MODE: 'log', SVC_NAME: 'mariadb' });
    expect(r.rc).toBe(0);
    expect(r.log).toHaveLength(2);
    expect(r.out).toContain('VERRIS_LOG_ZRODLO mariadb|journal:mysqld.service|2|2|0');
    expect(s.wywolania()).toContain('journalctl -u mysqld.service -n 2000 --no-pager -o short-iso -q');
  });

  it('znaki sterujące i sekwencje ANSI usunięte, długie linie ucięte', () => {
    const s = srodowisko();
    s.plik('/var/log/messages', `ok\x1b[31m czerwone\x07 ${'x'.repeat(1000)}\n`);
    const r = s.uruchom({ SVC_MODE: 'log', SVC_NAME: 'system' });
    expect(r.log[0].startsWith('ok czerwone ')).toBe(true);
    expect(r.log[0].length).toBe(400);
  });

  it.each([
    [{ SVC_NAME: '/etc/shadow' }],
    [{ SVC_NAME: '../../etc/shadow' }],
    [{ SVC_NAME: 'www', SVC_LINES: '5000' }],
    [{ SVC_NAME: 'www', SVC_LINES: '1; id' }],
    [{ SVC_NAME: 'www', SVC_FILTER: 'a\nb' }],
    [{ SVC_NAME: 'www', SVC_FILTER: 'x'.repeat(101) }],
  ])('wejście %j — odmowa', (env) => {
    const s = srodowisko();
    s.plik('/usr/local/lsws/logs/error.log', linie);
    const r = s.uruchom({ SVC_MODE: 'log', ...env });
    expect(r.rc).not.toBe(0);
    expect(r.log).toEqual([]);
  });

  it('brak pliku logu albo dowiązanie zamiast pliku — błąd, nie pusta lista', () => {
    const s = srodowisko();
    const r = s.uruchom({ SVC_MODE: 'log', SVC_NAME: 'fail2ban' });
    expect(r.rc).not.toBe(0);
    expect(r.err).toContain('tego logu nie ma na serwerze');
  });
});
