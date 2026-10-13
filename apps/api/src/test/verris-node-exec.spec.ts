import { execFileSync } from 'child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * 12.10: `verris-node exec <węzeł> -- <komenda>` pomijało komendę (ssh_base przekazywało do ssh
 * tylko adres), więc zamiast wykonać polecenie otwierało zwykłą sesję. Test uruchamia prawdziwy
 * skrypt z atrapami `docker` (wiersz węzła z bazy) i `ssh` (zapis argumentów).
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');

describe('verris-node exec', () => {
  it('przekazuje komendę do ssh po adresie węzła', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verris-node-'));
    mkdirSync(join(dir, 'ops/scripts'), { recursive: true });
    mkdirSync(join(dir, 'bin'));
    copyFileSync(join(KORZEN, 'ops/scripts/verris-node.sh'), join(dir, 'ops/scripts/verris-node.sh'));
    writeFileSync(join(dir, '.env.prod'), 'POSTGRES_USER=verris\nPOSTGRES_DB=verris\n');
    writeFileSync(join(dir, 'klucz'), 'x');
    const log = join(dir, 'ssh.log');
    writeFileSync(join(dir, 'bin/docker'), `#!/bin/sh\nprintf 't1\\tabc12345\\t203.0.113.7\\tACTIVE\\tnbg1\\n'\n`);
    writeFileSync(join(dir, 'bin/ssh'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${log}'\n`);
    chmodSync(join(dir, 'bin/docker'), 0o755);
    chmodSync(join(dir, 'bin/ssh'), 0o755);

    execFileSync('bash', [join(dir, 'ops/scripts/verris-node.sh'), 'exec', 't1', '--', 'lshttpd', '-V'], {
      env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, VERRIS_PG_SERVICE: 'db', NODE_SSH_KEY: join(dir, 'klucz') },
    });
    const argi = readFileSync(log, 'utf8').trim().split('\n');
    expect(argi.slice(-3)).toEqual(['root@203.0.113.7', 'lshttpd', '-V']);
    // Przegląd 13.10: `--` przed adresem — komenda zaczynająca się od „-” nie jest już opcją ssh.
    expect(argi.slice(-4, -3)).toEqual(['--']);
  });
});
