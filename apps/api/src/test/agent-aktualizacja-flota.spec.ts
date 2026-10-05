import { renderNodeTasksAgentInstallScript } from '../servers/node-tasks-agent.install.js';
import { loadNodeUpdateScript } from '../servers/node-update.script.js';

/**
 * 05.10 — G-12 dodał pole zadania (lista plików), a stary agent na t1 go nie znał: każda zmiana agenta
 * wymagała ręcznej instalacji przez SSH na każdym węźle. Aktualizacja floty (FLEET_UPDATE, fala co tydzień)
 * odświeża teraz agenta podpisanym instalatorem; instalator zapisuje skrypty atomowo, bo biegnie w trakcie
 * wykonywania verris-task-run.sh.
 */
describe('agent zadań — aktualizacja bez SSH', () => {
  it('aktualizacja floty pobiera podpisany instalator agenta i go uruchamia; błąd zatrzymuje falę', () => {
    const s = loadNodeUpdateScript();
    expect(s).toContain('verris-fetch /agent/tasks/agent-install/script /usr/local/bin/verris-agent-install.sh 60');
    expect(s).toMatch(/bash \/usr\/local\/bin\/verris-agent-install\.sh[^\n]*\|\| blad "instalacja agenta zadań"/);
    expect(s.indexOf('agent-install')).toBeLessThan(s.indexOf('CustomBuild'));
  });

  it('instalator nie nadpisuje działającego verris-task-run.sh w miejscu (nowy plik + mv)', () => {
    const s = renderNodeTasksAgentInstallScript();
    expect(s).not.toMatch(/cat > "\$TASK_RUN_PATH" /);
    expect(s).not.toMatch(/cat > "\$TASKS_PATH" /);
    expect(s).toContain('mv -f "$TASK_RUN_PATH.new" "$TASK_RUN_PATH"');
    expect(s).toContain('mv -f "$TASKS_PATH.new" "$TASKS_PATH"');
  });
});
