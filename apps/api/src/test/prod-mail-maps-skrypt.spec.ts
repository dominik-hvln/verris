import { spawnSync } from 'child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * prod-mail-apply-maps.sh działa jako root i tworzy katalogi skrzynek ze ścieżek z mapy Postfixa.
 * Ścieżka spoza „domena/lokalna” (np. „../../etc/cron.d”) nie może utworzyć katalogu poza VHOST_ROOT.
 */
const ZRODLO = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'prod-mail-apply-maps.sh');

function uruchom(mapa: string, przygotuj?: (vhosts: string, dir: string) => void) {
  const DIR = mkdtempSync(join(tmpdir(), 'mail-maps-'));
  const skrypty = join(DIR, 'repo', 'ops', 'scripts');
  mkdirSync(skrypty, { recursive: true });
  copyFileSync(ZRODLO, join(skrypty, 'prod-mail-apply-maps.sh'));
  writeFileSync(join(skrypty, 'prod-mail-postmap-reload.sh'), '#!/bin/bash\necho RELOAD\n');
  chmodSync(join(skrypty, 'prod-mail-postmap-reload.sh'), 0o755);
  const bin = join(DIR, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'docker'), '#!/bin/bash\nexit 1\n');
  chmodSync(join(bin, 'docker'), 0o755);
  const maps = join(DIR, 'maps');
  const vhosts = join(DIR, 'vhosts');
  mkdirSync(maps);
  mkdirSync(vhosts);
  writeFileSync(join(maps, 'virtual_mailbox_maps'), mapa);
  przygotuj?.(vhosts, DIR);
  const r = spawnSync('bash', [join(skrypty, 'prod-mail-apply-maps.sh')], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      CONTROL_PLANE_MAIL_MAPS_DIR: maps,
      CONTROL_PLANE_MAIL_DATA_ROOT: vhosts,
    },
    encoding: 'utf8',
  });
  return { r, DIR, vhosts };
}

describe('prod-mail-apply-maps.sh — katalogi skrzynek tylko wewnątrz VHOST_ROOT', () => {
  it('poprawny wpis tworzy domena/lokalna i przechodzi do reloadu', () => {
    const { r, vhosts } = uruchom('jan.kowalski@verris.pl\tverris.pl/jan.kowalski/\n# komentarz\n');
    expect(r.status).toBe(0);
    expect(existsSync(join(vhosts, 'verris.pl', 'jan.kowalski'))).toBe(true);
    expect(r.stdout).toContain('RELOAD');
  });

  it.each([
    ['../../uciekl/x/'],
    ['/uciekl/x/'],
    ['verris.pl/../../uciekl/'],
    ['verris.pl/a/b/'],
    ['verris.pl/-zle/'],
  ])('ścieżka %s jest pomijana, nic nie powstaje poza korzeniem', (sciezka) => {
    const { r, DIR } = uruchom(`zly@verris.pl\t${sciezka}\nok@verris.pl\tverris.pl/ok/\n`);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('Pomijam');
    expect(existsSync(join(DIR, 'uciekl'))).toBe(false);
    expect(existsSync(join(DIR, 'vhosts', 'verris.pl', 'ok'))).toBe(true);
  });

  it('symlink domeny wyprowadzający poza korzeń jest pomijany', () => {
    const { r, DIR } = uruchom('x@zly.pl\tzly.pl/x/\n', (vhosts, dir) => {
      mkdirSync(join(dir, 'obcy'));
      symlinkSync(join(dir, 'obcy'), join(vhosts, 'zly.pl'));
    });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('poza');
    expect(existsSync(join(DIR, 'obcy', 'x'))).toBe(false);
  });
});
