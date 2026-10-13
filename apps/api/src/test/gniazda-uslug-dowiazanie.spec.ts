import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Audyt 13.10 (ops/scripts/node-redis.sh, root-chmod-follows-client-symlink) — skrypt zakładał katalog gniazda
 * jako klient, ale `chmod 700 "$DIR"` wykonywał jako root. Klient podstawiał ~/.verris-redis jako dowiązanie
 * do dowolnego katalogu, a GNU chmod szedł za nim: root zamykał cudzy katalog (np. /var/www, katalog innego konta).
 */
const SKRYPTY = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts');

function uruchomRedis(przygotuj: (home: string, dir: string) => void) {
  const DIR = mkdtempSync(join(tmpdir(), 'gniazdo-'));
  const bin = join(DIR, 'bin');
  const home = join(DIR, 'home');
  mkdirSync(bin);
  mkdirSync(home);
  const fake = (n: string, body: string) => {
    writeFileSync(join(bin, n), `#!/bin/bash\n${body}\n`);
    chmodSync(join(bin, n), 0o755);
  };
  fake('id', 'exit 0');
  fake('getent', `echo "klient1:x:1001:1001::${home}:/bin/bash"`);
  // runuser -u <user> -- <polecenie…> — atrapa wykonuje polecenie bez zmiany użytkownika.
  fake('runuser', 'while [ "$1" != "--" ]; do shift; done; shift; exec "$@"');
  fake('redis-server', 'exit 0');
  fake('redis-cli', 'echo PONG');
  fake('sleep', 'exit 0');
  przygotuj(home, DIR);
  const r = spawnSync('bash', [join(SKRYPTY, 'node-redis.sh')], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RD_MODE: 'enable', RD_DA_USER: 'klient1', RD_SKIP_SYSTEMD: '1', RD_ETC: join(DIR, 'etc') },
    encoding: 'utf8',
  });
  return { r, DIR, home, sprzataj: () => rmSync(DIR, { recursive: true, force: true }) };
}

describe('Redis/Memcached — katalog gniazda w domu klienta', () => {
  it('~/.verris-redis jako dowiązanie do cudzego katalogu → odmowa, tryb ofiary bez zmian', () => {
    const t = uruchomRedis((home, dir) => {
      mkdirSync(join(dir, 'ofiara'), { mode: 0o755 });
      chmodSync(join(dir, 'ofiara'), 0o755);
      symlinkSync(join(dir, 'ofiara'), join(home, '.verris-redis'));
    });
    const tryb = statSync(join(t.DIR, 'ofiara')).mode & 0o777;
    t.sprzataj();
    expect(t.r.status).toBe(1);
    expect(t.r.stderr).toContain('dowiązaniem');
    expect(tryb).toBe(0o755);
  });

  it('zwykły przypadek: katalog gniazda powstaje z trybem 700, Redis startuje', () => {
    const t = uruchomRedis(() => undefined);
    const tryb = statSync(join(t.home, '.verris-redis')).mode & 0o777;
    t.sprzataj();
    expect(t.r.status).toBe(0);
    expect(t.r.stdout).toContain('VERRIS_REDIS_SOCKET=');
    expect(tryb).toBe(0o700);
  });

  it.each(['node-redis.sh', 'node-memcached.sh'])('%s: tryb katalogu ustawia klient, nie root (wyścig po sprawdzeniu -L)', (plik) => {
    const s = readFileSync(join(SKRYPTY, plik), 'utf8');
    expect(s).not.toMatch(/^chmod 700 "\$DIR"/m);
    expect(s).toMatch(/jako_klient sh -c '[^']*\[ ! -L "\$1" \] && chmod 700 "\$1"'/);
  });
});
