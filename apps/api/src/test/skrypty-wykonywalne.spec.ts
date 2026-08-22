import { execFileSync } from 'child_process';
import { statSync } from 'fs';
import { join } from 'path';

/**
 * Każdy skrypt powłoki w repozytorium ma bit wykonywalności.
 *
 * Odkryte przy X-25, tuż po zamknięciu H-20. Runbook, dokumentacja zadania
 * i MAIL PRZYPOMINAJĄCY do administratora mówią jednym głosem:
 *
 *     cd /opt/verris && ./ops/scripts/restore-drill-isolated.sh --owner "…"
 *
 * a plik miał w gicie tryb 100644. Na świeżym `git clone` to polecenie kończy
 * się „Permission denied" — czyli procedura, którą właśnie zamieniliśmy
 * w bramkę startu, nie dawała się wykonać w sposób, w jaki sama każe siebie
 * wykonywać. Szesnaście skryptów miało ten sam problem, w tym pięć
 * uruchamianych na węzłach produkcyjnych.
 *
 * Ślad po tym błędzie leżał w repozytorium od dawna: docs/ops/RESTORE_TEST.md
 * kazał wpisać `chmod +x` PRZED uruchomieniem, a Dockerfile.api robi `chmod +x`
 * na entrypoincie. Obejścia działały, więc nikt nie naprawił przyczyny.
 *
 * REGUŁA JEST BEZWYJĄTKOWA i to jest jej najważniejsza cecha. Lista „te
 * skrypty wolno mieć nieuruchamialne, bo woła je bash" musiałaby być
 * utrzymywana obok prawdziwych wywołań — czyli byłaby kolejnym wystąpieniem
 * „bliźniaczych miejsc" (Z-12, Z-16, M-06, X-24). Skrypt wykonywalny działa
 * pod `bash x.sh` tak samo dobrze, więc reguła bez wyjątków nic nie kosztuje.
 *
 * DLACZEGO TRYB Z DYSKU, A NIE Z INDEKSU GITA: liczy się to, co dostaje
 * maszyna po `git clone` — a `actions/checkout` wypisuje pliki dokładnie
 * z trybami z indeksu. Czytanie dysku działa też tam, gdzie kopia robocza nie
 * jest repozytorium (kontener budujący), i nie wymaga drugiej ścieżki kodu na
 * wypadek braku gita.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');

/** Ścieżki wszystkich skryptów .sh w repozytorium, bez node_modules i buildów. */
function skrypty(): string[] {
  const wyjscie = execFileSync(
    'find',
    [
      '.',
      '(',
      '-name', 'node_modules',
      '-o', '-name', '.next',
      '-o', '-name', 'dist',
      '-o', '-name', '.git',
      '-o', '-name', '_to_delete',
      ')',
      '-prune',
      '-o',
      '-name', '*.sh',
      '-type', 'f',
      '-print',
    ],
    { cwd: KORZEN, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  return wyjscie
    .split('\n')
    .filter(Boolean)
    .map((s) => s.replace(/^\.\//, ''))
    .sort();
}

const WSZYSTKIE = skrypty();
const wykonywalny = (s: string) => (statSync(join(KORZEN, s)).mode & 0o111) !== 0;

describe('skrypty powłoki są wykonywalne', () => {
  it('strażnik w ogóle coś widzi', () => {
    // Bez tego cała reszta przechodziłaby trywialnie na pustej liście — np.
    // gdyby `find` przestał trafiać albo wzorzec nazwy się rozjechał.
    expect(WSZYSTKIE.length).toBeGreaterThan(50);
    expect(WSZYSTKIE).toContain('ops/scripts/restore-drill-isolated.sh');
  });

  it('ŻADEN nie jest pozbawiony bitu wykonywalności', () => {
    expect(WSZYSTKIE.filter((s) => !wykonywalny(s))).toEqual([]);
  });

  it('skrypt z bramki startu daje się uruchomić tak, jak każe runbook', () => {
    // Ten konkretny plik jest w mailu przypominającym i w dokumentacji H-20
    // jako `./ops/scripts/restore-drill-isolated.sh`. Jeżeli kiedykolwiek
    // wróci do 644, procedura przestanie działać po `git clone` — a jest to
    // procedura, bez której nie wolno wystartować sprzedaży.
    expect(wykonywalny('ops/scripts/restore-drill-isolated.sh')).toBe(true);
  });
});
