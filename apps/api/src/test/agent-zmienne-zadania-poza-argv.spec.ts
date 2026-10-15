import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderVerrisTaskRunScript } from '../servers/node-tasks-agent.install.js';

/**
 * Noc 15.10 (uwaga z audytu 13.10, poza siedmioma poprawkami): runner zadania węzła podawał dane z payloadu zadania
 * (hasło administratora WordPressa, hasło bazy) jako argumenty `env NAZWA=wartość … bash skrypt`. Przez czas startu
 * procesu `env` widać je w /proc/<pid>/cmdline (i w `ps`) dla innych użytkowników węzła. Teraz runner robi `export`
 * (builtin basha) w podpowłoce i `exec bash skrypt` — wartości są tylko w środowisku procesu (/proc/<pid>/environ,
 * czytelne dla właściciela i roota).
 *
 * Runner uruchomiony naprawdę (bash) jak w agent-runner-jedna-kopia.spec.ts; atrapa `env` w PATH zapisuje swoje argv.
 */
const INST = '9a1b2c3d4e5f40718293a4b5c6d7e8f9';
const TASK = '9a1b2c3d-4e5f-4071-8293-a4b5c6d7e8f9';
const HASLO = 'HASLO-FIKCYJNE wp$1 "z cudzysłowem" =koniec=';
const HASLO_BAZY = 'baza-FIKCYJNA-77==';

describe('runner zadania węzła — dane payloadu poza argv procesu', () => {
  it('WP_INSTALL: skrypt dostaje WP_ADMIN_PASS i WP_DB_PASS, a nikt nie dostaje ich w argumentach', () => {
    const T = mkdtempSync(join(tmpdir(), 'verris-runner-env-'));
    try {
      for (const d of ['bin', 'log', 'run/verris-tasks']) mkdirSync(join(T, d), { recursive: true });
      const runner = renderVerrisTaskRunScript()
        .replaceAll('/etc/verris.conf', join(T, 'verris.conf'))
        .replaceAll('/var/log/verris-tasks', join(T, 'log/verris-tasks'))
        .replaceAll('/var/run/verris-tasks', join(T, 'run/verris-tasks'))
        .replaceAll('/etc/logrotate.d', join(T, 'brak-logrotate'))
        .replaceAll('/usr/local/bin/', `${join(T, 'bin')}/`);
      writeFileSync(join(T, 'runner.sh'), runner);
      writeFileSync(join(T, 'verris.conf'), 'VERRIS_API_URL=http://127.0.0.1:9\nVERRIS_SERVER_ID=s1\nVERRIS_IDENTITY_TOKEN=t\n');
      // Skrypt zadania zapisuje, co dostał w środowisku, i swoje argv.
      writeFileSync(
        join(T, 'zadanie.sh'),
        `printf '%s' "$WP_ADMIN_PASS" > "${join(T, 'dostal-haslo')}"\nprintf '%s' "$WP_DB_PASS" > "${join(T, 'dostal-baze')}"\nprintf '%s\\n' "$0" "$@" > "${join(T, 'argv-zadania')}"\n`,
      );
      const argvLog = join(T, 'argv.log');
      const atrapy: Record<string, string> = {
        curl: '#!/bin/bash\nexit 0\n',
        'verris-fetch': `#!/bin/bash\ncp "${join(T, 'zadanie.sh')}" "$2"\n`,
        // Każde wywołanie `env` z PATH zostawia ślad swoich argumentów (tak widać by je w /proc/<pid>/cmdline).
        env: `#!/bin/bash\nprintf '%s\\n' "$@" >> "${argvLog}"\nexec /usr/bin/env "$@"\n`,
      };
      for (const [n, tresc] of Object.entries(atrapy)) {
        writeFileSync(join(T, 'bin', n), tresc);
        chmodSync(join(T, 'bin', n), 0o755);
      }
      writeFileSync(
        join(T, 'run/verris-tasks', `${INST}.json`),
        JSON.stringify({
          id: TASK,
          kind: 'WP_INSTALL',
          payload: { daUser: 'kl1', domain: 'przyklad.pl', dbName: 'kl1_wp', dbUser: 'kl1_wp', dbPass: HASLO_BAZY, adminUser: 'admin', adminPass: HASLO, adminEmail: 'a@przyklad.pl' },
        }),
      );
      const r = spawnSync('bash', [join(T, 'runner.sh'), INST], {
        env: { PATH: `${join(T, 'bin')}:${process.env.PATH ?? ''}`, HOME: T },
        encoding: 'utf8',
        timeout: 20_000,
      });
      expect(r.status).toBe(0);
      // Skrypt dostał wartości bez zmian (spacje, cudzysłowy, „=”, „$”).
      expect(readFileSync(join(T, 'dostal-haslo'), 'utf8')).toBe(HASLO);
      expect(readFileSync(join(T, 'dostal-baze'), 'utf8')).toBe(HASLO_BAZY);
      // Ani `env`, ani skrypt zadania nie dostały haseł w argumentach.
      const argv = existsSync(argvLog) ? readFileSync(argvLog, 'utf8') : '';
      expect(argv).not.toContain('HASLO-FIKCYJNE');
      expect(argv).not.toContain(HASLO_BAZY);
      expect(readFileSync(join(T, 'argv-zadania'), 'utf8')).not.toContain('HASLO-FIKCYJNE');
    } finally {
      rmSync(T, { recursive: true, force: true });
    }
  }, 30_000);

  it('runner nie przekazuje RUN_ENV przez `env` (statycznie, na wypadek innej ścieżki uruchomienia)', () => {
    expect(renderVerrisTaskRunScript()).not.toMatch(/env\s+"\$\{RUN_ENV\[@\]\}"/);
  });
});
