import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * F2.6 — agent verris-lve: faulty kont z `cloudlinux-statistics --json` (LVE-Stats 2) uruchomione naprawdę (Python
 * z heredoca skryptu) na podstawionym narzędziu. Pilnuje: format z dokumentacji CloudLinux
 * (https://docs.cloudlinux.com/cloudlinuxos/command-line_tools/#cloudlinux-statistics), tylko konta Verris z faultami,
 * błąd narzędzia = `error`, nie zera.
 */
const SKRYPT = readFileSync(join(import.meta.dirname, '../../../../ops/scripts/verris-lve.sh'), 'utf8');
const PYTHON = (() => {
  const m = /python3 - <<'PYEOF'\n([\s\S]*?)\nPYEOF/.exec(SKRYPT);
  if (!m) throw new Error('brak heredoca PYEOF w verris-lve.sh');
  // Bez wywołania main() — testujemy funkcje faultów, nie cały cykl z API.
  return m[1].replace(/\nmain\(\)\s*$/, '\n');
})();

function uruchom(narzedzie: string, wywolanie: string): unknown {
  const kat = mkdtempSync(join(tmpdir(), 'verris-lve-'));
  const bin = join(kat, 'cloudlinux-statistics');
  writeFileSync(bin, narzedzie);
  chmodSync(bin, 0o755);
  const kod = `${PYTHON}\nFAULTS_STAT_BIN = ${JSON.stringify(bin)}\nimport json as _j\nprint("WYNIK=" + _j.dumps(${wywolanie}))\n`;
  const out = execFileSync('python3', ['-I', '-c', kod], {
    env: { PATH: process.env.PATH ?? '', VERRIS_API_URL: 'http://127.0.0.1:9', VERRIS_SERVER_ID: 's', VERRIS_IDENTITY_TOKEN: 't', LOG: join(kat, 'log') },
    encoding: 'utf8',
  });
  const linia = out.split('\n').find((l) => l.startsWith('WYNIK='));
  return JSON.parse(linia!.slice('WYNIK='.length));
}

/** Narzędzie-atrapa: zapisuje argumenty i oddaje JSON w formacie z dokumentacji (sekcja faults.<zasób>.lve). */
const atrapa = (json: object) => `#!/usr/bin/env python3
import sys, json
open(sys.argv[0] + ".args", "a").write(" ".join(sys.argv[1:]) + "\\n")
print(json.dumps(${JSON.stringify(json)}))
`;

const uzytkownik = (username: string, f: Record<string, number>) => ({
  username,
  domain: `${username}.pl`,
  usage: {},
  limits: {},
  faults: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, { lve: v }])),
});

describe('agent verris-lve — faulty limitów (F2.6)', () => {
  it('okna 24 h i 7 dni: tylko konta Verris z faultami, liczby z faults.<zasób>.lve', () => {
    const wynik = uruchom(
      atrapa({
        result: 'success',
        timestamp: 1,
        users: [
          uzytkownik('klient1', { cpu: 0, ep: 14, nproc: 2, pmem: 0, io: 0, iops: 0, vmem: 5 }),
          uzytkownik('obcy', { ep: 99 }),
          uzytkownik('klient2', { cpu: 0, ep: 0, nproc: 0 }),
        ],
      }),
      'faults_report({"klient1", "klient2"})',
    ) as { windows: { hours: number; accounts: unknown[]; truncated: boolean }[] };
    expect(wynik.windows.map((w) => w.hours)).toEqual([24, 168]);
    expect(wynik.windows[0].accounts).toEqual([{ username: 'klient1', cpu: 0, ep: 14, nproc: 2, pmem: 0, io: 0, iops: 0 }]);
    expect(wynik.windows[0].truncated).toBe(false);
  });

  it('wywołanie wg dokumentacji: --json, --period=1d|7d, --order-by=any_faults, --limit', () => {
    const kat = mkdtempSync(join(tmpdir(), 'verris-lve-args-'));
    const bin = join(kat, 'cloudlinux-statistics');
    writeFileSync(bin, atrapa({ result: 'success', users: [] }));
    chmodSync(bin, 0o755);
    execFileSync('python3', ['-I', '-c', `${PYTHON}\nFAULTS_STAT_BIN = ${JSON.stringify(bin)}\nfaults_report(set())\n`], {
      env: { PATH: process.env.PATH ?? '', VERRIS_API_URL: 'http://127.0.0.1:9', VERRIS_SERVER_ID: 's', VERRIS_IDENTITY_TOKEN: 't', LOG: join(kat, 'log') },
    });
    expect(readFileSync(`${bin}.args`, 'utf8').trim().split('\n')).toEqual([
      '--json --period=1d --order-by=any_faults --limit=200',
      '--json --period=7d --order-by=any_faults --limit=200',
    ]);
  });

  it('błąd narzędzia (result ≠ success) → error z komunikatem z context, bez okien z zerami', () => {
    const wynik = uruchom(
      atrapa({ result: 'An error occured: "%(error_text)s"', context: { error_text: 'database is locked' }, timestamp: 1 }),
      'faults_report({"klient1"})',
    );
    expect(wynik).toEqual({ error: 'cloudlinux-statistics --period=1d: An error occured: "database is locked"' });
  });

  it('brak narzędzia albo śmieci na wyjściu → error', () => {
    expect(uruchom('#!/bin/sh\necho "Traceback: boom" >&2\nexit 1\n', 'faults_report(set())')).toEqual({
      error: 'cloudlinux-statistics --period=1d: exit 1, Traceback: boom',
    });
    const brak = uruchom('#!/bin/sh\n', 'faults_window.__globals__.update(FAULTS_STAT_BIN="/nie/ma/cloudlinux-statistics") or faults_report(set())');
    expect(brak).toEqual({ error: 'brak cloudlinux-statistics (LVE-Stats 2)' });
  });

  it('pełna strona z faultami do końca → truncated', () => {
    const users = Array.from({ length: 200 }, (_, i) => uzytkownik(`u${i}`, { ep: 200 - i }));
    const wynik = uruchom(atrapa({ result: 'success', users }), 'faults_window("1d", {"u0"})') as [unknown[], boolean];
    expect(wynik[0]).toEqual([{ username: 'u0', ep: 200 }]);
    expect(wynik[1]).toBe(true);
  });

  it('raport co ~10 min: świeży stan pomija odczyt, stary albo brak stanu — odczyt', () => {
    const stan = join(mkdtempSync(join(tmpdir(), 'verris-lve-stan-')), 'faults.json');
    writeFileSync(stan, JSON.stringify({ ts: 1000 }));
    const ustaw = `faults_due.__globals__.update(FAULTS_STATE=${JSON.stringify(stan)})`;
    expect(uruchom(atrapa({}), `${ustaw} or [faults_due(1300.0), faults_due(1600.0), FAULTS_EVERY_S]`)).toEqual([false, true, 600]);
    expect(uruchom(atrapa({}), 'faults_due.__globals__.update(FAULTS_STATE="/nie/ma/stanu") or faults_due(5.0)')).toBe(true);
    expect(SKRYPT).toMatch(/report_faults\(desired\)/);
  });
});
