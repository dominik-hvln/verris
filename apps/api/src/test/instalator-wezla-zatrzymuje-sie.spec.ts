import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
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

const KORZEN = join(__dirname, '..', '..', '..', '..');
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
    ['node-live-readiness.sh', ['preflight_stack']],
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
