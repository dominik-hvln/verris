import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * C-27 — t1 04.10: klonowanie git@github.com: z panelu wisiało ~5 min i kończyło się „sprawdź klucz”.
 * Przyczyna: egress węzła wpuszcza TCP/22 tylko dla roota, konto klienta dostaje timeout.
 * GitHub/GitLab.com/Bitbucket mają oficjalny SSH na 443 — skrypt przepisuje adres i mówi wprost o porcie 22.
 */
const skrypt = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-git-deploy.sh'), 'utf8');
const funkcja = (nazwa: string) => {
  const start = skrypt.indexOf(`\n${nazwa}() {`) + 1;
  const linia = skrypt.slice(start, skrypt.indexOf('\n', start) + 1);
  return linia.trimEnd().endsWith('}') ? linia : skrypt.slice(start, skrypt.indexOf('\n}\n', start) + 3);
};
const bash = (kod: string) =>
  spawnSync('bash', ['-c', `${funkcja('log')}${funkcja('fail')}${funkcja('adres_443')}${funkcja('blad_git')}\n${kod}`], { encoding: 'utf8' });

describe('node-git-deploy.sh — SSH przez port 443', () => {
  it.each([
    ['git@github.com:firma/strona.git', 'ssh://git@ssh.github.com:443/firma/strona.git'],
    ['git@gitlab.com:grupa/pod/strona.git', 'ssh://git@altssh.gitlab.com:443/grupa/pod/strona.git'],
    ['git@bitbucket.org:ws/strona.git', 'ssh://git@altssh.bitbucket.org:443/ws/strona.git'],
    ['https://github.com/firma/strona.git', 'https://github.com/firma/strona.git'],
    ['git@git.firma.pl:strona.git', 'git@git.firma.pl:strona.git'],
  ])('%s → %s', (wej, wyj) => {
    expect(bash(`adres_443 '${wej}'`).stdout.trim()).toBe(wyj);
  });

  it('timeout na porcie 22 → komunikat o zablokowanym porcie, nie „sprawdź klucz”', () => {
    const r = bash(`blad_git 'ssh: connect to host git.firma.pl port 22: Connection timed out' 'sprawdź klucz'`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('porcie 22');
    expect(bash(`blad_git 'Permission denied (publickey).' 'sprawdź klucz'`).stderr).toContain('sprawdź klucz');
  });

  it('klon i pull przechodzą przez adres 443, a repo zapamiętuje klucz (cron „git pull”)', () => {
    expect(skrypt).toContain('git clone --depth 50 ${GD_BRANCH:+--branch "$GD_BRANCH"} -- "$(adres_443 "$GD_URL")"');
    expect(skrypt).toMatch(/config core\.sshCommand "\$SSH_CMD"/);
    expect(skrypt).toMatch(/pull\)\n\s+jako_klient test -d "\$CEL\/\.git"[^\n]*\n\s+utrwal_repo/);
    expect(skrypt).toContain('ConnectTimeout=20');
  });
});
