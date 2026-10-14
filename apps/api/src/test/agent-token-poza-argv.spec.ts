import { execFile } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { renderNodeTasksAgentInstallScript, renderVerrisTaskRunScript, renderVerrisTasksScript } from '../servers/node-tasks-agent.install.js';
import { renderVerrisFetchScript } from '../servers/podpis-skryptow.js';

/**
 * Audyt 13.10 (do potwierdzenia #13, node-secrets:identity-token-in-argv): skrypty węzła podawały token tożsamości
 * w argumentach curl (`-H "X-Server-Token: …"`), widocznych w /proc/<pid>/cmdline dla innych użytkowników, jeśli
 * jądro na to pozwala. Teraz nagłówki idą z deskryptora (`-H @<(printf …)`, printf to builtin basha — bez procesu
 * z tokenem w argv).
 */
const OPS = resolve(import.meta.dirname, '../../../../ops/scripts');
const run = promisify(execFile);

describe('token węzła poza argv curl', () => {
  it.each([
    ...readdirSync(OPS).filter((f) => f.endsWith('.sh')).map((f) => [`ops/scripts/${f}`, () => readFileSync(join(OPS, f), 'utf8')] as const),
    ['render verris-tasks.sh', renderVerrisTasksScript] as const,
    ['render verris-task-run.sh', renderVerrisTaskRunScript] as const,
    ['render verris-fetch', renderVerrisFetchScript] as const,
    ['instalator agenta', renderNodeTasksAgentInstallScript] as const,
  ])('%s: bez -H "X-Server-Token: $…" w wywołaniu', (_n, tresc) => {
    expect(tresc()).not.toMatch(/-H\s+["']X-Server-Token:\s*\$/);
  });

  it('verris-fetch (prawdziwy curl): API dostaje token, a argv curl go nie zawiera', async () => {
    let token: string | undefined;
    let id: string | undefined;
    const srv = createServer((req, res) => {
      token = req.headers['x-server-token'] as string | undefined;
      id = req.headers['x-server-id'] as string | undefined;
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const port = (srv.address() as AddressInfo).port;
    const T = mkdtempSync(join(tmpdir(), 'token-argv-'));
    try {
      writeFileSync(join(T, 'verris.conf'), `VERRIS_API_URL=http://127.0.0.1:${port}\nVERRIS_SERVER_ID=srv-fikcyjny\nVERRIS_IDENTITY_TOKEN=TOKEN-FIKCYJNY-123\n`);
      writeFileSync(join(T, 'klucz.pub'), 'x');
      writeFileSync(join(T, 'verris-fetch'), renderVerrisFetchScript());
      // Atrapa curl: zapisuje argv i przekazuje wywołanie prawdziwemu curl.
      writeFileSync(join(T, 'curl'), `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> "${join(T, 'argv.log')}"\nexec /usr/bin/curl "$@"\n`);
      chmodSync(join(T, 'curl'), 0o755);
      const r = await run('bash', [join(T, 'verris-fetch'), '/agent/tasks/x/script', '-', '5'], {
        env: { PATH: `${T}:/usr/bin:/bin`, VERRIS_CONF: join(T, 'verris.conf'), VERRIS_SIG_PUB: join(T, 'klucz.pub') },
      }).catch((e: { code?: number }) => e);
      expect((r as { code?: number }).code).toBe(4); // 404 → kod 4: żądanie doszło
      expect(token).toBe('TOKEN-FIKCYJNY-123');
      expect(id).toBe('srv-fikcyjny');
      expect(readFileSync(join(T, 'argv.log'), 'utf8')).not.toContain('TOKEN-FIKCYJNY-123');
    } finally {
      srv.close();
      rmSync(T, { recursive: true, force: true });
    }
  });
});
