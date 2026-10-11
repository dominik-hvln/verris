import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { renderVerrisTaskRunScript, renderVerrisTasksScript } from '../servers/node-tasks-agent.install.js';
import { renderVerrisFetchScript } from '../servers/podpis-skryptow.js';

/**
 * Agent zadań węzła ma dwa sposoby instalacji: skrypt bootstrap z API (render w TS) i
 * `ops/scripts/node-verris-tasks-install.sh` (kopie plików z repo, tak instaluje onboarding węzła).
 * Do 2026-09-24 kopie w repo zostały w tyle: verris-tasks.sh nie przekazywał PHP_APPLY, APP_INSTALL,
 * OFFSITE_RESTORE ani FLEET_UPDATE, a verris-task-run.sh dla nieznanego rodzaju uruchamiał PROFIL
 * HOSTINGU (przekonfigurowanie całego węzła). Jedno źródło: render; pliki w repo muszą być identyczne.
 * Po zmianie w node-tasks-agent.install.ts wygeneruj je ponownie (treść = wynik funkcji render*).
 */
const OPS = resolve(import.meta.dirname, '../../../../ops/scripts');

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

  it('audyt Fali 3: wyjście zadania tylko do jego pliku (bez kopii w logu agenta), pliki zadań starsze niż 30 dni usuwane, log agenta rotowany', () => {
    const run = renderVerrisTaskRunScript();
    expect(run).not.toMatch(/tee -a "\$TASK_LOG"/);
    expect(run).toContain('bash "$RUN_BIN" >> "$TASK_LOG" 2>&1');
    expect(run).toMatch(/\nrc=\$\?\n/);
    expect(run).toMatch(/\/var\/log\/verris-tasks\.log \{[^}]*maxage 30[^}]*copytruncate[^}]*\}/);

    // Linia sprzątania uruchomiona naprawdę na katalogu tymczasowym.
    const linia = run.split('\n').find((l) => l.startsWith('find "$LOG_DIR"'))!;
    const dir = mkdtempSync(join(tmpdir(), 'verris-tasks-'));
    try {
      const stary = join(dir, 'stary.log');
      const swiezy = join(dir, 'swiezy.log');
      const inny = join(dir, 'stary.json');
      for (const f of [stary, swiezy, inny]) writeFileSync(f, 'x');
      const dawno = new Date(Date.now() - 40 * 86_400_000);
      utimesSync(stary, dawno, dawno);
      utimesSync(inny, dawno, dawno);
      execFileSync('bash', ['-c', `LOG_DIR=${JSON.stringify(dir)}\n${linia}`]);
      expect([existsSync(stary), existsSync(swiezy), existsSync(inny)]).toEqual([false, true, true]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
