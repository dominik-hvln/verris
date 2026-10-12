import { spawnSync } from 'node:child_process';
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderNodeTasksAgentInstallScript, renderVerrisTaskRunScript, renderVerrisTasksScript } from '../servers/node-tasks-agent.install.js';

/**
 * Analiza 12.10 — agent zadań węzła (verris-tasks.sh) trzyma blokadę /var/run/verris-tasks.lock na deskryptorze 9.
 * W ścieżce awaryjnej („exec verris-task-run.sh”, gdy nie da się uruchomić zadania przez systemd) deskryptor 9 przechodził
 * do runnera i do procesów zadania. Usługa uruchomiona przez zadanie (demon w tle) trzymała blokadę po końcu zadania —
 * każde kolejne uruchomienie agenta kończyło się na „flock -n 9 || exit 0” i węzeł nie pobierał ŻADNYCH zadań.
 * Do tego „systemctl start” jednostki Type=oneshot czekał na koniec zadania (do TimeoutStartSec=120 agenta).
 *
 * Agent i runner uruchomione naprawdę (bash), ścieżki węzła podmienione na katalog tymczasowy, atrapy: systemctl,
 * verris-fetch (zlecenie + skrypt zadania), curl (zapis wywołań API).
 */
const INST = '0c11af1caaaa4bbbbccccdddddddeeee';
const TASK = '0c11af1c-aaaa-4bbb-bccc-cdddddddeeee';
const OPS = resolve(import.meta.dirname, '../../../../ops/scripts');

function wezel(T: string, skrypt: string): string {
  return skrypt
    .replaceAll('/etc/verris.conf', join(T, 'verris.conf'))
    .replaceAll('/etc/verris-stack.env', join(T, 'verris-stack.env'))
    .replaceAll('/etc/logrotate.d', join(T, 'brak-logrotate'))
    .replaceAll('/var/log/verris-tasks', join(T, 'log/verris-tasks'))
    .replaceAll('/var/run/verris-tasks', join(T, 'run/verris-tasks'))
    .replaceAll('/usr/local/bin/', `${join(T, 'bin')}/`);
}

function srodowisko(opts: { startRc: number; lease: string }) {
  const T = mkdtempSync(join(tmpdir(), 'verris-agent-fd-'));
  for (const d of ['bin', 'log', 'run/verris-tasks']) mkdirSync(join(T, d), { recursive: true });
  writeFileSync(join(T, 'verris.conf'), 'VERRIS_API_URL=http://127.0.0.1:9\nVERRIS_SERVER_ID=s1\nVERRIS_IDENTITY_TOKEN=t\n');
  writeFileSync(join(T, 'lease.json'), opts.lease);
  // Zadanie uruchamia „usługę” w tle (jak restart demona poza systemd) i kończy się od razu.
  writeFileSync(
    join(T, 'zadanie.sh'),
    `sleep 30 >/dev/null 2>&1 </dev/null &\necho $! > "${join(T, 'demon.pid')}"\necho VERRIS_UPDATE_RESULT=ok\n`,
  );
  const pliki: Record<string, string> = {
    'verris-tasks.sh': wezel(T, renderVerrisTasksScript()),
    'verris-task-run.sh': wezel(T, renderVerrisTaskRunScript()),
    'verris-fetch': `#!/bin/bash\necho "$1" >> "${join(T, 'fetch.log')}"\ncase "$1" in\n  /agent/tasks/lease) cat "${join(T, 'lease.json')}" ;;\n  /agent/tasks/node-update/script) cp "${join(T, 'zadanie.sh')}" "$2" ;;\n  *) exit 1 ;;\nesac\n`,
    curl: `#!/bin/bash\nfor a in "$@"; do case "$a" in http*) echo "$a" >> "${join(T, 'api.log')}" ;; esac; done\nexit 0\n`,
    systemctl: `#!/bin/bash\necho "$*" >> "${join(T, 'systemctl.log')}"\ncase "$1" in\n  cat) exit 0 ;;\n  show) echo inactive ;;\n  start) exit ${opts.startRc} ;;\nesac\n`,
  };
  for (const [n, tresc] of Object.entries(pliki)) {
    writeFileSync(join(T, 'bin', n), tresc);
    chmodSync(join(T, 'bin', n), 0o755);
  }
  const env = { PATH: `${join(T, 'bin')}:${process.env.PATH ?? ''}`, HOME: T };
  const czytaj = (n: string) => (existsSync(join(T, n)) ? readFileSync(join(T, n), 'utf8').trim().split('\n') : []);
  const uruchom = (polecenie: string[]) => {
    const fd = openSync(join(T, 'log/verris-tasks.log'), 'a');
    try {
      return spawnSync(polecenie[0], polecenie.slice(1), { env, stdio: ['ignore', fd, fd], timeout: 20_000 });
    } finally {
      closeSync(fd);
    }
  };
  const sprzataj = () => {
    for (const p of czytaj('demon.pid')) {
      try {
        process.kill(Number(p));
      } catch {
        /* już nie żyje */
      }
    }
    rmSync(T, { recursive: true, force: true });
  };
  return { T, env, czytaj, uruchom, sprzataj, lock: join(T, 'run/verris-tasks.lock') };
}

const LEASE = JSON.stringify({ id: TASK, kind: 'FLEET_UPDATE', payload: {} });

describe('Agent węzła — blokada agenta nie przechodzi do procesów zadania', () => {
  it('ścieżka awaryjna (exec runnera): demon uruchomiony przez zadanie nie trzyma /var/run/verris-tasks.lock po końcu agenta', () => {
    const s = srodowisko({ startRc: 1, lease: LEASE });
    try {
      const r = s.uruchom(['bash', join(s.T, 'bin/verris-tasks.sh')]);
      expect(r.status).toBe(0);
      // Zadanie naprawdę poszło ścieżką awaryjną i zostało zaraportowane.
      expect(readFileSync(join(s.T, 'log/verris-tasks.log'), 'utf8')).toContain('fallback sync');
      expect(s.czytaj('api.log').filter((u) => !u.endsWith('/progress'))).toEqual([`http://127.0.0.1:9/agent/tasks/${TASK}/complete`]);
      const demon = Number(s.czytaj('demon.pid')[0]);
      expect(() => process.kill(demon, 0)).not.toThrow();

      // Demon żyje, a blokada agenta jest wolna — następne uruchomienie z timera ją dostanie.
      const f = spawnSync('flock', ['-n', s.lock, 'true']);
      expect(f.status).toBe(0);
    } finally {
      s.sprzataj();
    }
  }, 30_000);

  it('systemd: start zadania bez czekania na jego koniec (--no-block), bez ścieżki awaryjnej', () => {
    const s = srodowisko({ startRc: 0, lease: LEASE });
    try {
      const r = s.uruchom(['bash', join(s.T, 'bin/verris-tasks.sh')]);
      expect(r.status).toBe(0);
      expect(s.czytaj('systemctl.log').filter((l) => l.startsWith('start'))).toEqual([`start --no-block verris-task@${INST}.service`]);
      expect(readFileSync(join(s.T, 'log/verris-tasks.log'), 'utf8')).not.toContain('fallback sync');
      expect(s.czytaj('api.log')).toEqual([]);
    } finally {
      s.sprzataj();
    }
  }, 30_000);

  // Węzeł bez systemd (cron): „flock -n LOCK verris-tasks.sh” brał blokadę na innym opisie pliku niż „exec 9>LOCK” w skrypcie,
  // więc skrypt nigdy jej nie dostawał i kończył się kodem 0 bez pobrania zlecenia. Skrypt blokuje się sam.
  it.each([
    ['instalator z API', () => renderNodeTasksAgentInstallScript()],
    ['ops/scripts/node-verris-tasks-install.sh', () => readFileSync(resolve(OPS, 'node-verris-tasks-install.sh'), 'utf8')],
  ])('cron (%s): agent naprawdę pobiera zlecenie', (_n, instalator) => {
    const s = srodowisko({ startRc: 1, lease: 'null' });
    try {
      const linia = instalator()
        .split('\n')
        .find((l) => /^\* \* \* \* \* root .*verris-tasks\.sh/.test(l));
      expect(linia).toBeDefined();
      const polecenie = wezel(s.T, linia!.replace(/^\* \* \* \* \* root /, ''));
      const r = s.uruchom(['bash', '-c', polecenie]);
      expect(r.status).toBe(0);
      expect(s.czytaj('fetch.log')).toContain('/agent/tasks/lease');
    } finally {
      s.sprzataj();
    }
  }, 30_000);
});
