import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderVerrisTaskRunScript } from '../servers/node-tasks-agent.install.js';

/**
 * Weryfikacja 11.10 (t1) — agent zadań węzła, runner verris-task-run.sh uruchomiony naprawdę (bash), z atrapami curl
 * (zapis wywołań API) i verris-fetch (skrypt zadania), ścieżki węzła podmienione na katalog tymczasowy.
 *
 * a) log(): systemd dopisuje stdout runnera do /var/log/verris-tasks.log (StandardOutput=append), a log() robił jeszcze
 *    „tee -a” do tego samego pliku — każda linia dwa razy.
 * b) FLEET_UPDATE 8f542756…: druga kopia runnera tej samej instancji (poza systemd) padła w trakcie zadania, zgłosiła
 *    „Proces zakończył się bez raportu do API (rc=1)” i skasowała pid/zlecenie oryginału; API oznaczyło zadanie jako
 *    FAILED, a raport „complete” oryginału po 18 min został odrzucony. Teraz druga kopia kończy się kodem 0 bez raportu.
 */
const INST = '8f542756aaaa4bbbbccccdddddddeeee';
const TASK = '8f542756-aaaa-4bbb-bccc-cdddddddeeee';

function srodowisko() {
  const T = mkdtempSync(join(tmpdir(), 'verris-runner-'));
  for (const d of ['bin', 'log', 'run/verris-tasks']) mkdirSync(join(T, d), { recursive: true });
  const runner = renderVerrisTaskRunScript()
    .replaceAll('/etc/verris.conf', join(T, 'verris.conf'))
    .replaceAll('/var/log/verris-tasks', join(T, 'log/verris-tasks'))
    .replaceAll('/var/run/verris-tasks', join(T, 'run/verris-tasks'))
    .replaceAll('/etc/logrotate.d', join(T, 'brak-logrotate'))
    .replaceAll('/usr/local/bin/', `${join(T, 'bin')}/`);
  writeFileSync(join(T, 'runner.sh'), runner);
  writeFileSync(join(T, 'verris.conf'), 'VERRIS_API_URL=http://127.0.0.1:9\nVERRIS_SERVER_ID=s1\nVERRIS_IDENTITY_TOKEN=t\n');
  // Zadanie czeka na plik „pusc” — test decyduje, kiedy oryginał kończy pracę.
  writeFileSync(join(T, 'zadanie.sh'), `while [ ! -f "${join(T, 'pusc')}" ]; do sleep 0.1; done\necho VERRIS_UPDATE_RESULT=ok\n`);
  const atrapy: Record<string, string> = {
    curl: `#!/bin/bash\nurl=""\nfor a in "$@"; do case "$a" in http*) url="$a" ;; esac; done\necho "$url" >> "${join(T, 'api.log')}"\nexit 0\n`,
    'verris-fetch': `#!/bin/bash\ncp "${join(T, 'zadanie.sh')}" "$2"\n`,
  };
  for (const [n, tresc] of Object.entries(atrapy)) {
    writeFileSync(join(T, 'bin', n), tresc);
    chmodSync(join(T, 'bin', n), 0o755);
  }
  writeFileSync(join(T, 'run/verris-tasks', `${INST}.json`), JSON.stringify({ id: TASK, kind: 'FLEET_UPDATE', payload: {} }));
  const env = { PATH: `${join(T, 'bin')}:${process.env.PATH ?? ''}`, HOME: T };
  const agentLog = join(T, 'log/verris-tasks.log');
  const api = () => (existsSync(join(T, 'api.log')) ? readFileSync(join(T, 'api.log'), 'utf8').trim().split('\n') : []);
  return { T, env, agentLog, api };
}

const czekaj = async (warunek: () => boolean, ms = 10_000) => {
  const koniec = Date.now() + ms;
  while (!warunek()) {
    if (Date.now() > koniec) throw new Error('przekroczony czas oczekiwania');
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe('Agent węzła — runner zadania: jedna kopia na instancję, jedna linia logu na zdarzenie', () => {
  it('druga kopia tej samej instancji kończy się kodem 0 bez raportu i bez kasowania pid/zlecenia; oryginał raportuje complete', async () => {
    const { T, env, agentLog, api } = srodowisko();
    try {
      // Oryginał jak pod systemd: stdout i stderr dopisywane do logu agenta.
      const fd = openSync(agentLog, 'a');
      const a = spawn('bash', [join(T, 'runner.sh'), INST], { env, stdio: ['ignore', fd, fd] });
      closeSync(fd);
      const koniecA = new Promise<number | null>((r) => a.on('exit', (kod) => r(kod)));
      const pid = join(T, 'run/verris-tasks', `${INST}.pid`);
      await czekaj(() => existsSync(pid) && readFileSync(agentLog, 'utf8').includes('Starting task'));

      // Druga kopia tej samej instancji (np. fallback exec z verris-tasks.sh) — limit czasu jak timeout jednostki.
      const fdB = openSync(agentLog, 'a');
      const b = spawnSync('bash', [join(T, 'runner.sh'), INST], { env, stdio: ['ignore', fdB, fdB], timeout: 5_000 });
      closeSync(fdB);
      expect(b.status).toBe(0);
      expect(api().filter((u) => u.endsWith('/fail'))).toEqual([]);
      expect(readFileSync(pid, 'utf8').trim()).toBe(String(a.pid));
      expect(existsSync(join(T, 'run/verris-tasks', `${INST}.json`))).toBe(true);

      writeFileSync(join(T, 'pusc'), '');
      expect(await koniecA).toBe(0);
      expect(api().filter((u) => u.endsWith('/complete'))).toEqual([`http://127.0.0.1:9/agent/tasks/${TASK}/complete`]);
      expect(api().filter((u) => u.endsWith('/fail'))).toEqual([]);

      // a) Jedna linia na zdarzenie w logu agenta (stdout = ten sam plik, jak StandardOutput=append).
      const linie = readFileSync(agentLog, 'utf8').split('\n');
      expect(linie.filter((l) => l.includes(`Starting task ${TASK}`))).toHaveLength(1);
      expect(linie.filter((l) => l.includes(`Task ${TASK} COMPLETED`))).toHaveLength(1);
      expect(linie.filter((l) => l.includes('już działa'))).toHaveLength(1);
    } finally {
      // Przy błędzie testu procesy zadania czekają na „pusc” — dajmy im skończyć przed usunięciem katalogu.
      writeFileSync(join(T, 'pusc'), '');
      await new Promise((r) => setTimeout(r, 500));
      rmSync(T, { recursive: true, force: true });
    }
  }, 30_000);

  it('a) pod systemd (stdout = log agenta, StandardOutput=append): każda linia raz', () => {
    const { T, env, agentLog } = srodowisko();
    try {
      writeFileSync(join(T, 'pusc'), '');
      const fd = openSync(agentLog, 'a');
      const r = spawnSync('bash', [join(T, 'runner.sh'), INST], { env, stdio: ['ignore', fd, fd], timeout: 20_000 });
      closeSync(fd);
      expect(r.status).toBe(0);
      const linie = readFileSync(agentLog, 'utf8').split('\n');
      expect(linie.filter((l) => l.includes(`Starting task ${TASK}`))).toHaveLength(1);
      expect(linie.filter((l) => l.includes(`Task ${TASK} COMPLETED`))).toHaveLength(1);
    } finally {
      rmSync(T, { recursive: true, force: true });
    }
  }, 30_000);

  it('uruchomiony ręcznie (stdout poza logiem agenta) — linia trafia do logu agenta raz', () => {
    const { T, env, agentLog } = srodowisko();
    try {
      writeFileSync(join(T, 'pusc'), '');
      const r = spawnSync('bash', [join(T, 'runner.sh'), INST], { env, encoding: 'utf8', timeout: 20_000 });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain(`Starting task ${TASK}`);
      expect(readFileSync(agentLog, 'utf8').split('\n').filter((l) => l.includes(`Starting task ${TASK}`))).toHaveLength(1);
    } finally {
      rmSync(T, { recursive: true, force: true });
    }
  }, 30_000);
});
