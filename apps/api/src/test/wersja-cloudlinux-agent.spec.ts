import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { release, tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Weryfikacja 11.10 (t1) — karta węzła: „CloudLinux 2.1-76.el102.1-78.el10”. Po aktualizacji z nowym jądrem, przed
 * rebootem, są zainstalowane dwie wersje kmod-lve, a agent pytał `rpm -q --qf "%{VERSION}-%{RELEASE}"` (bez „\n”),
 * więc sklejał obie. Agent verris-lve (Python z heredoca, uruchomiony naprawdę na atrapie `rpm`) raportuje jedną:
 * tę z modułem dla działającego jądra, a gdy żadna nie pasuje — najpóźniej zainstalowaną.
 */
const SKRYPT = readFileSync(join(import.meta.dirname, '../../../../ops/scripts/verris-lve.sh'), 'utf8');
const PYTHON = (() => {
  const m = /python3 - <<'PYEOF'\n([\s\S]*?)\nPYEOF/.exec(SKRYPT);
  if (!m) throw new Error('brak heredoca PYEOF w verris-lve.sh');
  return m[1].replace(/\nmain\(\)\s*$/, '\n');
})();

type Pakiet = { v: string; r: string; t: number; pliki: string[] };

/** Atrapa `rpm -q --qf FORMAT NAZWA[-V-R]` — minimalny queryformat: pola skalarne i tablica [%{FILENAMES}…]. */
function wersjaAgenta(pakiety: Pakiet[]): string | null {
  const kat = mkdtempSync(join(tmpdir(), 'verris-lve-cl-'));
  writeFileSync(
    join(kat, 'rpm'),
    `#!/usr/bin/env python3
import re, sys
P = ${JSON.stringify(pakiety)}
a = sys.argv[1:]
fmt, nazwa = a[a.index("--qf") + 1].replace("\\\\n", "\\n"), a[-1]
pas = [p for p in P if nazwa == "kmod-lve" or nazwa == "kmod-lve-%s-%s" % (p["v"], p["r"])]
if not pas:
    print("package %s is not installed" % nazwa)
    sys.exit(1)
out = ""
for p in pas:
    pola = {"VERSION": p["v"], "RELEASE": p["r"], "INSTALLTIME": str(p["t"])}
    f = re.sub(r"\\[%\\{FILENAMES\\}([^\\]]*)\\]", lambda m: "".join(x + m.group(1) for x in p["pliki"]), fmt)
    out += re.sub(r"%\\{([A-Z]+)\\}", lambda m: pola[m.group(1)], f)
sys.stdout.write(out)
`,
  );
  chmodSync(join(kat, 'rpm'), 0o755);
  const kod = `${PYTHON}\nimport json as _j\nprint("WYNIK=" + _j.dumps(stack_versions().get("clVersion")))\n`;
  const out = execFileSync('python3', ['-I', '-c', kod], {
    env: { PATH: `${kat}:${process.env.PATH ?? ''}`, VERRIS_API_URL: 'http://127.0.0.1:9', VERRIS_SERVER_ID: 's', VERRIS_IDENTITY_TOKEN: 't', LOG: join(kat, 'log') },
    encoding: 'utf8',
  });
  return JSON.parse(out.split('\n').find((l) => l.startsWith('WYNIK='))!.slice('WYNIK='.length)) as string | null;
}

const STARY: Pakiet = { v: '2.1', r: '76.el10', t: 1_790_000_000, pliki: [`/lib/modules/${release()}/extra/kmodlve.ko`] };
const NOWY: Pakiet = { v: '2.1', r: '78.el10', t: 1_791_000_000, pliki: ['/lib/modules/6.12.0-99.el10.x86_64/extra/kmodlve.ko'] };

describe('Agent verris-lve — wersja CloudLinux (kmod-lve)', () => {
  it('dwie wersje przed rebootem: jedna, ta z modułem działającego jądra — bez sklejania', () => {
    expect(wersjaAgenta([STARY, NOWY])).toBe('2.1-76.el10');
    expect(wersjaAgenta([NOWY, STARY])).toBe('2.1-76.el10');
  });

  it('żadna nie pasuje do działającego jądra (np. weak-updates) — najpóźniej zainstalowana', () => {
    expect(wersjaAgenta([{ ...NOWY }, { ...STARY, pliki: ['/lib/modules/6.12.0-1.el10.x86_64/extra/kmodlve.ko'] }])).toBe('2.1-78.el10');
  });

  it('jedna wersja — ta; brak pakietu — brak pola', () => {
    expect(wersjaAgenta([NOWY])).toBe('2.1-78.el10');
    expect(wersjaAgenta([])).toBeNull();
  });
});
