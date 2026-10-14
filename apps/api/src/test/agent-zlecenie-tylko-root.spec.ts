import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderNodeTasksAgentInstallScript, renderVerrisTasksScript } from '../servers/node-tasks-agent.install.js';

/**
 * Audyt 13.10 (do potwierdzenia #14, node-tasks:job-json-world-readable): agent zapisywał zlecenie (JSON z hasłem
 * bazy i admina WordPressa klienta) w /var/run/verris-tasks z umask 022 — plik 0644 w katalogu 0755. Każde konto
 * lokalne spoza klatki CageFS mogło je przeczytać. Teraz katalog 0700, plik 0600.
 *
 * Agent uruchomiony naprawdę (bash), ścieżki węzła w katalogu tymczasowym, atrapy verris-fetch i systemctl.
 */
const INST = '0c11af1caaaa4bbbbccccdddddddeeee';
const TASK = '0c11af1c-aaaa-4bbb-bccc-cdddddddeeee';

describe('Agent węzła — zlecenie z hasłami tylko dla roota', () => {
  it('plik zlecenia 0600, katalog stanu 0700 (także gdy katalog istniał jako 0755)', () => {
    const T = mkdtempSync(join(tmpdir(), 'verris-zlecenie-'));
    try {
      for (const d of ['bin', 'log']) mkdirSync(join(T, d), { recursive: true });
      mkdirSync(join(T, 'run/verris-tasks'), { recursive: true, mode: 0o755 });
      chmodSync(join(T, 'run/verris-tasks'), 0o755);
      writeFileSync(join(T, 'verris.conf'), 'VERRIS_API_URL=http://127.0.0.1:9\nVERRIS_SERVER_ID=s1\nVERRIS_IDENTITY_TOKEN=t\n');
      const lease = JSON.stringify({ id: TASK, kind: 'WP_INSTALL', payload: { dbPass: 'haslo-fikcyjne', adminPass: 'haslo-fikcyjne-2' } });
      writeFileSync(join(T, 'lease.json'), lease);
      const skrypt = renderVerrisTasksScript()
        .replaceAll('/etc/verris.conf', join(T, 'verris.conf'))
        .replaceAll('/etc/verris-stack.env', join(T, 'verris-stack.env'))
        .replaceAll('/etc/logrotate.d', join(T, 'brak-logrotate'))
        .replaceAll('/var/log/verris-tasks', join(T, 'log/verris-tasks'))
        .replaceAll('/var/run/verris-tasks', join(T, 'run/verris-tasks'))
        .replaceAll('/usr/local/bin/', `${join(T, 'bin')}/`);
      const pliki: Record<string, string> = {
        'verris-tasks.sh': skrypt,
        'verris-fetch': `#!/bin/bash\ncase "$1" in\n  /agent/tasks/lease) cat "${join(T, 'lease.json')}" ;;\n  *) exit 1 ;;\nesac\n`,
        curl: '#!/bin/bash\nexit 0\n',
        systemctl: '#!/bin/bash\ncase "$1" in\n  show) echo inactive ;;\nesac\nexit 0\n',
      };
      for (const [n, tresc] of Object.entries(pliki)) {
        writeFileSync(join(T, 'bin', n), tresc);
        chmodSync(join(T, 'bin', n), 0o755);
      }
      const r = spawnSync('bash', ['-c', `umask 022; exec bash "${join(T, 'bin/verris-tasks.sh')}"`], {
        env: { PATH: `${join(T, 'bin')}:${process.env.PATH ?? ''}`, HOME: T },
        stdio: 'ignore',
        timeout: 20_000,
      });
      expect(r.status).toBe(0);
      expect(statSync(join(T, `run/verris-tasks/${INST}.json`)).mode & 0o777).toBe(0o600);
      expect(statSync(join(T, 'run/verris-tasks')).mode & 0o777).toBe(0o700);
    } finally {
      rmSync(T, { recursive: true, force: true });
    }
  }, 30_000);

  it.each([
    ['instalator z API', () => renderNodeTasksAgentInstallScript()],
    ['ops/scripts/node-verris-tasks-install.sh', () => readFileSync(resolve(import.meta.dirname, '../../../../ops/scripts/node-verris-tasks-install.sh'), 'utf8')],
  ])('%s zakłada katalog stanu 0700', (_n, tresc) => {
    const s = tresc();
    expect(s).toContain('chmod 700 /var/run/verris-tasks');
    expect(s).not.toMatch(/chmod 755[^\n]*\/var\/run\/verris-tasks/);
  });
});
