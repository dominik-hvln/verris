import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * 21.10 — weryfikator aktualizacji: krok AKTUALIZACJE agenta verris-lve uruchomiony naprawdę (Python z heredoca) na
 * atrapach `dnf`, `./build versions` (CustomBuild) i `rpm`. Pilnuje: format dnf 4 `updateinfo list` (z --with-cve),
 * błąd dnf = `blad` (nie pusta lista), brak CustomBuild = null, harmonogram 6 h i plik wymuszenia po instalacji poprawek.
 */
const SKRYPT = readFileSync(join(import.meta.dirname, '../../../../ops/scripts/verris-lve.sh'), 'utf8');
const PYTHON = (() => {
  const m = /python3 - <<'PYEOF'\n([\s\S]*?)\nPYEOF/.exec(SKRYPT);
  if (!m) throw new Error('brak heredoca PYEOF w verris-lve.sh');
  return m[1].replace(/\nmain\(\)\s*$/, '\n');
})();

const POPRAWKI = [
  'ALSA-2026:1001 Important/Sec. alt-php83-cli-8.3.12-1.el10.x86_64',
  'ALSA-2026:1001 Important/Sec. alt-php83-common-8.3.12-1.el10.x86_64',
  'ALSA-2026:0907 Critical/Sec.  openssl-libs-3.2.2-6.el10.x86_64',
  'ALSA-2026:0800 Sec.           tzdata-2026b-1.el10.noarch',
  'linia, której nie da się przeczytać',
].join('\n');
const CVE = [
  'CVE-2026-109618 Important/Sec. alt-php83-cli-8.3.12-1.el10.x86_64',
  'CVE-2026-109619 Important/Sec. alt-php83-cli-8.3.12-1.el10.x86_64',
  'CVE-2026-109618 Important/Sec. alt-php83-common-8.3.12-1.el10.x86_64',
  'CVE-2026-2001   Critical/Sec.  openssl-libs-3.2.2-6.el10.x86_64',
].join('\n');
const BUILD_VERSIONS = [
  'Latest version of PHP 8.3: 8.3.12',
  'Installed version of PHP 8.3: 8.3.11',
  '',
  'PHP 8.3 8.3.11 to 8.3.12 update is available.',
  'Exim 4.98 to 4.98.1 update is available.',
].join('\n');

function srodowisko(o: { dnf?: string; cb?: string | null; rpm?: string } = {}) {
  const kat = mkdtempSync(join(tmpdir(), 'verris-akt-'));
  const bin = (nazwa: string, tresc: string) => {
    const p = join(kat, nazwa);
    writeFileSync(p, tresc);
    chmodSync(p, 0o755);
    return p;
  };
  const dnf = bin(
    'dnf',
    o.dnf ??
      `#!/usr/bin/env bash\necho "$*" >> "${kat}/dnf.args"\nif [[ " $* " == *" --with-cve "* ]]; then cat <<'X'\n${CVE}\nX\nelse cat <<'X'\n${POPRAWKI}\nX\nfi\n`,
  );
  const rpm = bin('rpm', o.rpm ?? `#!/usr/bin/env bash\nprintf 'alt-php83-cli 8.3.11\\nalt-php74-cli 7.4.33\\nphp-cli 8.3.1\\n'\n`);
  const cbDir = join(kat, 'custombuild');
  if (o.cb !== null) {
    mkdirSync(cbDir);
    writeFileSync(join(cbDir, 'build'), o.cb ?? `#!/usr/bin/env bash\n[ "$1" = versions ] || exit 2\ncat <<'X'\n${BUILD_VERSIONS}\nX\n`);
    chmodSync(join(cbDir, 'build'), 0o755);
  }
  return { kat, dnf, rpm, cbDir };
}

function uruchom(s: ReturnType<typeof srodowisko>, wywolanie: string, przed = ''): unknown {
  const kod = `${PYTHON}
AKT_DNF_BIN = ${JSON.stringify(s.dnf)}
AKT_RPM_BIN = ${JSON.stringify(s.rpm)}
AKT_CB_DIR = ${JSON.stringify(s.cbDir)}
AKT_STATE = ${JSON.stringify(join(s.kat, 'stan.json'))}
AKT_WYMUS = ${JSON.stringify(join(s.kat, 'wymus'))}
WYSLANE = []
${przed}
import json as _j
print("WYNIK=" + _j.dumps(${wywolanie}))
`;
  const out = execFileSync('python3', ['-I', '-c', kod], {
    env: { PATH: process.env.PATH ?? '', VERRIS_API_URL: 'http://127.0.0.1:9', VERRIS_SERVER_ID: 's', VERRIS_IDENTITY_TOKEN: 't', LOG: join(s.kat, 'log') },
    encoding: 'utf8',
  });
  return JSON.parse(out.split('\n').find((l) => l.startsWith('WYNIK='))!.slice('WYNIK='.length));
}

type Raport = {
  sprawdzono: string;
  dnf: { poprawki: { advisory: string; waga: string; pakiet: string; cve: string[] }[]; blad?: string };
  custombuild: { aktualizacje: { nazwa: string; z: string; na: string }[]; blad?: string } | null;
  altPhp: Record<string, string>;
};

describe('agent verris-lve — aktualizacje bezpieczeństwa (21.10)', () => {
  it('dnf: poprawki z wagą i CVE (złączone po pakiecie), najważniejsze pierwsze; bez wagi → Unknown; zła linia pomijana', () => {
    const s = srodowisko();
    const r = uruchom(s, 'aktualizacje_raport()') as Raport;
    expect(r.dnf.blad).toBeUndefined();
    expect(r.dnf.poprawki).toEqual([
      { advisory: 'ALSA-2026:0907', waga: 'Critical', pakiet: 'openssl-libs-3.2.2-6.el10.x86_64', cve: ['CVE-2026-2001'] },
      { advisory: 'ALSA-2026:1001', waga: 'Important', pakiet: 'alt-php83-cli-8.3.12-1.el10.x86_64', cve: ['CVE-2026-109618', 'CVE-2026-109619'] },
      { advisory: 'ALSA-2026:1001', waga: 'Important', pakiet: 'alt-php83-common-8.3.12-1.el10.x86_64', cve: ['CVE-2026-109618'] },
      { advisory: 'ALSA-2026:0800', waga: 'Unknown', pakiet: 'tzdata-2026b-1.el10.noarch', cve: [] },
    ]);
    expect(r.sprawdzono).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(readFileSync(join(s.kat, 'dnf.args'), 'utf8').trim().split('\n')).toEqual([
      '-q updateinfo list --security --available',
      '-q updateinfo list --security --available --with-cve',
    ]);
  });

  it('CustomBuild „X a to b update is available.” i pełne wersje alt-php', () => {
    const r = uruchom(srodowisko(), 'aktualizacje_raport()') as Raport;
    expect(r.custombuild).toEqual({
      aktualizacje: [
        { nazwa: 'PHP 8.3', z: '8.3.11', na: '8.3.12' },
        { nazwa: 'Exim', z: '4.98', na: '4.98.1' },
      ],
    });
    expect(r.altPhp).toEqual({ '8.3': '8.3.11', '7.4': '7.4.33' });
  });

  it('błąd dnf → `blad`, nie pusta lista; brak CustomBuild → null; błąd ./build → `blad`', () => {
    const r = uruchom(
      srodowisko({ dnf: '#!/usr/bin/env bash\necho "Error: Failed to download metadata for repo" >&2\nexit 1\n', cb: null }),
      'aktualizacje_raport()',
    ) as Raport;
    expect(r.dnf).toEqual({ poprawki: [], blad: 'dnf: exit 1, Error: Failed to download metadata for repo' });
    expect(r.custombuild).toBeNull();
    const zCb = uruchom(srodowisko({ cb: '#!/usr/bin/env bash\necho "nie mogę pobrać versions.txt" >&2\nexit 3\n' }), 'akt_custombuild()');
    expect(zCb).toEqual({ aktualizacje: [], blad: 'build: exit 3, nie mogę pobrać versions.txt' });
  });

  it('harmonogram: co 6 h; plik wymuszenia — od razu i znika po udanym wysłaniu; po błędzie API zostaje (próba za 5 min)', () => {
    const s = srodowisko();
    const atrapaApi = (ok: boolean) => `
def api_post(path, body):
    WYSLANE.append(sorted(body.keys()))
    if not ${ok ? 'True' : 'False'}:
        raise Exception("HTTP 500")
`;
    // pierwszy raz (brak stanu) — wysyła
    expect(uruchom(s, '(report_aktualizacje(), WYSLANE)[1]', atrapaApi(true))).toEqual([['accounts', 'agentVersion', 'aktualizacje']]);
    // zaraz potem — nie (6 h)
    expect(uruchom(s, '(report_aktualizacje(), WYSLANE)[1]', atrapaApi(true))).toEqual([]);
    // wymuszenie, ale stan sprzed chwili → czeka 5 min
    writeFileSync(join(s.kat, 'wymus'), '');
    expect(uruchom(s, '(report_aktualizacje(), WYSLANE)[1]', atrapaApi(true))).toEqual([]);
    // wymuszenie, stan sprzed 10 min → wysyła i usuwa plik
    writeFileSync(join(s.kat, 'stan.json'), JSON.stringify({ ts: Date.now() / 1000 - 600 }));
    expect(uruchom(s, '(report_aktualizacje(), WYSLANE)[1]', atrapaApi(true))).toHaveLength(1);
    expect(existsSync(join(s.kat, 'wymus'))).toBe(false);
    // wymuszenie i błąd API → plik zostaje
    writeFileSync(join(s.kat, 'wymus'), '');
    writeFileSync(join(s.kat, 'stan.json'), JSON.stringify({ ts: Date.now() / 1000 - 600 }));
    expect(uruchom(s, '(report_aktualizacje(), WYSLANE)[1]', atrapaApi(false))).toHaveLength(1);
    expect(existsSync(join(s.kat, 'wymus'))).toBe(true);
    // stan sprzed 7 h bez wymuszenia → wysyła
    const s2 = srodowisko();
    writeFileSync(join(s2.kat, 'stan.json'), JSON.stringify({ ts: Date.now() / 1000 - 7 * 3600 }));
    expect(uruchom(s2, '(report_aktualizacje(), WYSLANE)[1]', atrapaApi(true))).toHaveLength(1);
  });

  it('krok jest w cyklu agenta (po faultach), wersja agenta 1.4', () => {
    expect(SKRYPT).toMatch(/report_faults\(desired, desired_ok\)[\s\S]*report_aktualizacje\(\)[\s\S]*\nmain\(\)/);
    expect(SKRYPT).toContain('AGENT_VERSION = "lve-agent/1.4"');
  });
});
