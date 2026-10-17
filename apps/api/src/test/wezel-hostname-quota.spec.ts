import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildNodeBootstrapScript } from '../servers/node-bootstrap.script.js';
import { stosJakoEnv } from '../servers/stos-wezla.js';

/**
 * 13.10 (t2, Contabo): cloud-config z user-data dostawcy (manage_etc_hosts: true, fqdn vmi…) wygrywał z naszym
 * cloud.cfg.d — po restarcie nazwa hosta „t2” i /etc/hosts z 127.0.0.1 vmi…; kontrola maili DA w profilu szła na
 * verris-da-powiadomienia@t2 (FAIL). Do tego XFS z noquota na / — bez quota DA nie egzekwuje dysku kont.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const PROFIL = readFileSync(join(KORZEN, 'ops', 'scripts', 'node-hosting-profile.sh'), 'utf8');

function blokPythonCloudInit(skrypt: string): string {
  // 18.10: błąd bloku nie jest już cichy (`|| report …` zamiast `|| true`)
  const m = /<<'PYCC' \|\| report PREFLIGHT STARTED "[^"\n]*"\n([\s\S]*?)\nPYCC\n/.exec(skrypt);
  if (!m) throw new Error('brak bloku PYCC w bootstrapie');
  return m[1]!;
}

describe('bootstrap węzła — cloud-init nie zmienia nazwy hosta po restarcie', () => {
  const skrypt = buildNodeBootstrapScript({ apiBaseUrl: 'https://api.verris.pl/', bootstrapToken: 'eko_btk_test', serverId: 'srv-1', stackEnv: stosJakoEnv(), hostname: 't2.verris.pl' });

  it('wyłącza set_hostname, update_hostname i update_etc_hosts, zostawia resztę modułów', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-'));
    writeFileSync(join(dir, 'cloud.cfg'), [
      'cloud_init_modules:',
      ' - migrator',
      ' - seed_random',
      ' - bootcmd',
      ' - write-files',
      ' - [growpart, always]',
      ' - set_hostname',
      ' - update_hostname',
      ' - update_etc_hosts',
      ' - rsyslog',
      ' - users-groups',
      ' - ssh',
      '',
    ].join('\n'));
    const cel = join(dir, '99-verris-zz-bez-hostname.cfg');
    const r = spawnSync('python3', ['-', join(dir, 'cloud.cfg'), cel], { input: blokPythonCloudInit(skrypt), encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(existsSync(cel)).toBe(true);
    const wynik = readFileSync(cel, 'utf8');
    expect(wynik).not.toMatch(/set_hostname|update_hostname|update_etc_hosts/);
    for (const m of ['migrator', 'bootcmd', 'growpart', 'users-groups', 'ssh']) expect(wynik).toContain(m);
  });

  it('plik trafia do cloud.cfg.d (po 99-verris-hostname.cfg)', () => {
    expect(skrypt).toContain('/99-verris-zz-bez-hostname.cfg');
  });
});

describe('profil hostingowy — domena kontroli maili DA i quota', () => {
  it('domena adresu-ujścia z Exima (primary_hostname), nie z hostname -f', () => {
    expect(PROFIL).toMatch(/da_domena="\$\(exim -bP primary_hostname/);
    expect(PROFIL).toContain('DA_SINK="${DA_SINK_LOCAL}@${da_domena}"');
    expect(PROFIL).not.toMatch(/DA_SINK="\$\{DA_SINK_LOCAL\}@\$\(hostname -f/);
  });

  it('sprawdza quota partycji quota_partition (repquota) i wywołuje kontrolę w profilu', () => {
    expect(PROFIL).toMatch(/^check_disk_quota\(\) \{/m);
    expect(PROFIL).toContain('da config-get quota_partition');
    expect(PROFIL).toMatch(/^check_disk_quota$/m);
  });
});
