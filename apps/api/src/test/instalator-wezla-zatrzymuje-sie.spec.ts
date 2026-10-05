import { spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * NODE-02 — etap instalatora węzła, który zgłosił [FAIL], zatrzymuje
 * instalację, zanim ruszy następny.
 *
 * `set -e` w skryptach węzła działa na `return 1`, ale nie widzi `log_fail`,
 * które ustawia FAIL=1 i leci dalej: brak python3/curl w preflighcie kończył
 * się instalacją agenta zadań, który bez nich nie działa, a nieudana
 * rejestracja IP w DirectAdminie była tylko ostrzeżeniem.
 */

const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const SKRYPTY = join(KORZEN, 'ops', 'scripts');
const BIBLIOTEKA = join(SKRYPTY, 'lib', 'przerwij-po-etapie.sh');

function etap(fail: string | null) {
  const ustaw = fail === null ? '' : `FAIL=${fail};`;
  return spawnSync(
    'bash',
    ['-c', `set -Eeuo pipefail; . "${BIBLIOTEKA}"; ${ustaw} przerwij_po_etapie "test"; echo DALEJ`],
    { encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin' } },
  );
}

describe('NODE-02 — biblioteka przerwij_po_etapie', () => {
  it('etap bez [FAIL] przepuszcza do następnego', () => {
    const r = etap('0');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('DALEJ');
  });

  it('etap z [FAIL] zatrzymuje instalację i mówi dlaczego', () => {
    const r = etap('1');
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain('DALEJ');
    expect(r.stderr).toContain('[STOP]');
    expect(r.stderr).toContain('test');
  });

  it('nieustawione FAIL pod `set -u` nie wywraca skryptu', () => {
    expect(etap(null).status).toBe(0);
  });
});

/** Ciało funkcji main() bez komentarzy i pustych linii. */
function mainSkryptu(plik: string): string[] {
  const tresc = readFileSync(join(SKRYPTY, plik), 'utf8');
  const start = tresc.indexOf('\nmain() {');
  const koniec = tresc.indexOf('\n}', start);
  return tresc
    .slice(start, koniec)
    .split('\n')
    .map((l) => l.replace(/^\s*#.*$/, '').trim())
    .filter(Boolean);
}

function poEtapie(linie: string[], etapFunkcja: string): string | undefined {
  const i = linie.indexOf(etapFunkcja);
  return i >= 0 ? linie[i + 1] : undefined;
}

describe('NODE-02 — skrypty wołają bramkę po etapach-bramkach', () => {
  it.each([
    ['node-onboard-live.sh', ['preflight_stack', 'run_security_hardening', 'ensure_da_ip']],
    ['node-live-readiness.sh', ['preflight_stack', 'pobierz_manifest_stosu']],
  ])('%s', (plik, etapy) => {
    const linie = mainSkryptu(plik);
    const zrodlo = linie.findIndex((l) => l === '. "$SCRIPT_DIR/lib/przerwij-po-etapie.sh"');
    expect(zrodlo).toBeGreaterThanOrEqual(0);
    for (const e of etapy) {
      expect(linie.indexOf(e)).toBeGreaterThan(zrodlo);
      expect(poEtapie(linie, e)).toMatch(/^przerwij_po_etapie "/);
    }
  });

  it('nieudana rejestracja IP w DirectAdminie to [FAIL], nie ostrzeżenie', () => {
    const tresc = readFileSync(join(SKRYPTY, 'node-onboard-live.sh'), 'utf8');
    const linia = tresc.split('\n').find((l) => l.includes('nie jest zarejestrowane w DirectAdmin'));
    expect(linia).toBeDefined();
    expect(linia!.trim()).toMatch(/^log_fail /);
    // Polecenia spoza dokumentacji DA (brak podkomendy „ip”; „directadmin c” = wypisanie konfiguracji) nie wracają.
    expect(tresc).not.toMatch(/directadmin ip add|\| *\/usr\/local\/directadmin\/directadmin c\b/);
  });

  it.each(['node-onboard-live.sh', 'node-live-readiness.sh'])(
    '%s wymaga biblioteki w pakiecie skryptów',
    (plik) => {
      expect(readFileSync(join(SKRYPTY, plik), 'utf8')).toMatch(
        /if \[ ! -f "\$SCRIPT_DIR\/lib\/przerwij-po-etapie\.sh" \]/,
      );
    },
  );
});

/** Definicja funkcji bashowej wycięta ze skryptu (od `nazwa() {` do pierwszego `}` w kolumnie 0). */
function funkcja(plik: string, nazwa: string): string {
  const t = readFileSync(join(SKRYPTY, plik), 'utf8');
  const start = t.indexOf(`\n${nazwa}() {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return t.slice(start, t.indexOf('\n}\n', start) + 3);
}

describe('NODE-02 — node-live-readiness.sh: błąd bez [FAIL] nie przechodzi po cichu', () => {
  const dir = mkdtempSync(join(tmpdir(), 'node02-'));

  it('manifest stosu pobierany po instalacji agenta (verris-fetch) i z bramką — profil bez manifestu nie rusza', () => {
    const linie = mainSkryptu('node-live-readiness.sh');
    expect(linie.indexOf('install_task_agent')).toBeLessThan(linie.indexOf('pobierz_manifest_stosu'));
    expect(linie.indexOf('pobierz_manifest_stosu')).toBeLessThan(linie.indexOf('run_hosting_profile'));
  });

  it('nieudana instalacja agenta zadań to [FAIL] z powodem i kod ≠ 0 (nie goły `bash`, który kończy skrypt bez słowa)', () => {
    writeFileSync(join(dir, 'node-verris-tasks-install.sh'), 'exit 7\n');
    const r = spawnSync(
      'bash',
      ['-c', `set -Eeuo pipefail; FAIL=0; SKIP_AGENT=0; DRY_RUN=0; SCRIPT_DIR="${dir}"
log_ok() { echo "[OK] $*"; }; log_info() { :; }; log_step() { :; }; log_fail() { echo "[FAIL] $*" >&2; FAIL=1; }
${funkcja('node-live-readiness.sh', 'install_task_agent')}
install_task_agent; echo DALEJ`],
      { encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin' } },
    );
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('DALEJ');
    expect(r.stderr).toMatch(/\[FAIL\] Instalacja agenta zadań nie powiodła się.*rc=7/);
  });

  it('przerwanie przez `set -e` bez log_fail wysyła do control-plane CZERWONY raport, nie zielony', () => {
    const curl = join(dir, 'curl');
    const body = join(dir, 'body.json');
    writeFileSync(curl, `#!/bin/sh\nwhile [ $# -gt 0 ]; do [ "$1" = --data ] && printf '%s' "$2" > "${body}"; shift; done\n`);
    chmodSync(curl, 0o755);
    const r = spawnSync(
      'bash',
      ['-c', `set -Eeuo pipefail; FAIL=0; WARN_N=0; PROBLEMY=(); DRY_RUN=0; LOG=/dev/null
VERRIS_SERVER_ID=s VERRIS_IDENTITY_TOKEN=t VERRIS_API_URL=http://127.0.0.1:9
${funkcja('node-live-readiness.sh', 'wyslij_raport_onboardu')}
trap wyslij_raport_onboardu EXIT
false`],
      { encoding: 'utf8', env: { PATH: `${dir}:${process.env.PATH ?? '/usr/bin:/bin'}` } },
    );
    expect(r.status).toBe(1);
    const raport = JSON.parse(readFileSync(body, 'utf8')) as { ok: boolean; fail: number; podsumowanie: string };
    expect(raport.ok).toBe(false);
    expect(raport.fail).toBe(1);
    expect(raport.podsumowanie).toContain('przerwany');
  });
});

describe('NODE-02 — node-hosting-profile.sh mówi, który krok go przerwał', () => {
  const surowy = readFileSync(join(SKRYPTY, 'node-hosting-profile.sh'), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'node02-profil-'));
  writeFileSync(join(dir, 'fn.sh'), surowy.slice(0, surowy.indexOf('\nrequire_root\n')));
  const uruchom = (kod: string) =>
    spawnSync('bash', ['-c', `. "${dir}/fn.sh"; ${kod}`], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin' } });

  it('nieobsłużony błąd: [STOP] z poleceniem i kod ≠ 0', () => {
    const r = uruchom('krok() { ls /nie/ma/takiego/katalogu >/dev/null 2>&1; }; krok; echo DALEJ');
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('DALEJ');
    expect(r.stderr).toMatch(/\[STOP\] Profil przerwany na poleceniu: ls \/nie\/ma\/takiego\/katalogu.*funkcja krok/);
  });

  it('błąd tolerowany w $(…) i w warunku nie daje fałszywego [STOP]', () => {
    const r = uruchom('x="$(grep -q nic /dev/null; echo ok)"; if grep -q nic /dev/null; then :; fi; echo "$x"');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('ok');
    expect(r.stderr).not.toContain('[STOP]');
  });
});
