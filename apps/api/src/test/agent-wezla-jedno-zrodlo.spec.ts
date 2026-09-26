import { readFileSync } from 'fs';
import { resolve } from 'path';
import { renderVerrisTaskRunScript, renderVerrisTasksScript } from '../servers/node-tasks-agent.install';
import { renderVerrisFetchScript } from '../servers/podpis-skryptow';

/**
 * Agent zadań węzła ma dwa sposoby instalacji: skrypt bootstrap z API (render w TS) i
 * `ops/scripts/node-verris-tasks-install.sh` (kopie plików z repo, tak instaluje onboarding węzła).
 * Do 2026-09-24 kopie w repo zostały w tyle: verris-tasks.sh nie przekazywał PHP_APPLY, APP_INSTALL,
 * OFFSITE_RESTORE ani FLEET_UPDATE, a verris-task-run.sh dla nieznanego rodzaju uruchamiał PROFIL
 * HOSTINGU (przekonfigurowanie całego węzła). Jedno źródło: render; pliki w repo muszą być identyczne.
 * Po zmianie w node-tasks-agent.install.ts wygeneruj je ponownie (treść = wynik funkcji render*).
 */
const OPS = resolve(__dirname, '../../../../ops/scripts');

describe('Agent węzła — jedno źródło skryptów', () => {
  it.each([
    ['verris-task-run.sh', renderVerrisTaskRunScript],
    ['verris-tasks.sh', renderVerrisTasksScript],
    ['verris-fetch.sh', renderVerrisFetchScript],
  ])('ops/scripts/%s = render z node-tasks-agent.install.ts', (plik, render) => {
    expect(readFileSync(resolve(OPS, plik), 'utf8')).toBe(render());
  });

  it('nieznany rodzaj zadania kończy się odmową, nie profilem hostingu', () => {
    const run = renderVerrisTaskRunScript();
    expect(run).toContain('elif [ "$TASK_KIND" = "HOSTING_PROFILE" ]; then');
    expect(run).toMatch(/else\n\s+# Nieznany rodzaj[\s\S]*?report_fail "Nieznany rodzaj zadania/);
  });

  it('każdy rodzaj obsługiwany przez runner jest przekazywany przez poller', () => {
    const run = renderVerrisTaskRunScript();
    const poll = renderVerrisTasksScript();
    const rodzaje = [...run.matchAll(/\$TASK_KIND" = "([A-Z_]+)"/g)].map((m) => m[1]).filter((k) => k !== 'HOSTING_PROFILE');
    const linia = /\n\s+([A-Z_|]+)\) dispatch_generic ;;/.exec(poll)?.[1].split('|') ?? [];
    expect(rodzaje.sort()).toEqual(linia.sort());
  });
});
