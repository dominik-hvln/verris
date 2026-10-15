import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildNodeBootstrapScript } from './node-bootstrap.script.js';
import { QUOTA_XFS_SH } from './quota-xfs.script.js';
import { stosJakoEnv } from './stos-wezla.js';

/**
 * Decyzja 15.10 (PB-31) — quota XFS bez ręcznego SSH. t2 (13.10): XFS z noquota na /, DA bez limitów dysku kont,
 * a profil kazał zrobić grubby + restart ręcznie. Teraz bootstrap ustawia opcję i sam restartuje (faza QUOTA),
 * a profil ustawia ją na węzłach sprzed zmiany.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const PROFIL = readFileSync(join(KORZEN, 'ops', 'scripts', 'node-hosting-profile.sh'), 'utf8');

interface Atrapa {
  dir: string;
  fstab: string;
  grub: string;
  opcje: string;
  log: string;
}

/** Atrapy findmnt / grubby / systemctl: system plików i opcje montowania z plików, wywołania do logu. */
function atrapa(o: { cel: string; typ: string; opcje: string; grubbyKod?: number }): Atrapa {
  const dir = mkdtempSync(join(tmpdir(), 'quota-'));
  const a: Atrapa = {
    dir,
    fstab: join(dir, 'fstab'),
    grub: join(dir, 'grub'),
    opcje: join(dir, 'opcje'),
    log: join(dir, 'log'),
  };
  writeFileSync(a.opcje, o.opcje);
  writeFileSync(a.log, '');
  const bin = join(dir, 'bin');
  spawnSync('mkdir', ['-p', bin]);
  const skrypt = (nazwa: string, tresc: string) => {
    writeFileSync(join(bin, nazwa), `#!/usr/bin/env bash\n${tresc}\n`);
    chmodSync(join(bin, nazwa), 0o755);
  };
  skrypt(
    'findmnt',
    `echo "findmnt $*" >> '${a.log}'
case "$*" in
  *TARGET*) echo '${o.cel}' ;;
  *FSTYPE*) echo '${o.typ}' ;;
  *OPTIONS*) cat '${a.opcje}' ;;
esac`,
  );
  skrypt('grubby', `echo "grubby $*" >> '${a.log}'; exit ${o.grubbyKod ?? 0}`);
  skrypt('systemctl', `echo "systemctl $*" >> '${a.log}'`);
  skrypt('sync', 'true');
  return a;
}

function uruchom(a: Atrapa, kod: string): { status: number | null; out: string } {
  const r = spawnSync('bash', ['-c', `set -uo pipefail\n${kod}`], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(a.dir, 'bin')}:${process.env.PATH}` },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

function wlacz(a: Atrapa, cel = '/home'): { kod: number; out: string } {
  const r = uruchom(a, `${QUOTA_XFS_SH}\nwlacz_quota_xfs '${cel}' '${a.fstab}' '${a.grub}'; echo "kod=$?"`);
  const m = /kod=(\d+)/.exec(r.out);
  return { kod: m ? Number(m[1]) : -1, out: r.out };
}

describe('wlacz_quota_xfs — quota XFS bez ręcznego kroku', () => {
  it('XFS na / bez quota: grubby rootflags=uquota,pquota, GRUB_CMDLINE_LINUX dla kolejnych jąder, kod 10 (restart)', () => {
    const a = atrapa({ cel: '/', typ: 'xfs', opcje: 'rw,relatime,attr2,inode64,logbufs=8,logbsize=32k,noquota' });
    writeFileSync(a.grub, 'GRUB_TIMEOUT=5\nGRUB_CMDLINE_LINUX="crashkernel=auto rhgb quiet"\n');
    expect(wlacz(a).kod).toBe(10);
    expect(readFileSync(a.log, 'utf8')).toContain('grubby --update-kernel=ALL --args=rootflags=uquota,pquota');
    const grub = readFileSync(a.grub, 'utf8');
    expect(grub).toContain('GRUB_CMDLINE_LINUX="crashkernel=auto rhgb quiet rootflags=uquota,pquota"');
    expect(grub).toContain('GRUB_TIMEOUT=5');
    // drugi przebieg nie dubluje opcji w /etc/default/grub
    expect(wlacz(a).kod).toBe(10);
    expect(readFileSync(a.grub, 'utf8').match(/rootflags=uquota,pquota/g)).toHaveLength(1);
  });

  it('quota już aktywna (usrquota w opcjach montowania): kod 0, nic nie zmienia', () => {
    const a = atrapa({ cel: '/', typ: 'xfs', opcje: 'rw,relatime,attr2,inode64,usrquota,prjquota' });
    expect(wlacz(a).kod).toBe(0);
    expect(readFileSync(a.log, 'utf8')).not.toContain('grubby');
    expect(existsSync(a.grub)).toBe(false);
  });

  it('osobna partycja XFS dla /home: uquota,pquota w fstab (bez noquota), inne wpisy bez zmian', () => {
    const a = atrapa({ cel: '/home', typ: 'xfs', opcje: 'rw,relatime,noquota' });
    writeFileSync(
      a.fstab,
      [
        '# /etc/fstab',
        'UUID=aaa /     xfs defaults 0 0',
        'UUID=bbb /home xfs defaults,noquota 0 0',
        '/swapfile none swap defaults 0 0',
        '',
      ].join('\n'),
    );
    expect(wlacz(a).kod).toBe(10);
    const f = readFileSync(a.fstab, 'utf8').split('\n');
    expect(f[2]).toBe('UUID=bbb\t/home\txfs\tdefaults,uquota,pquota\t0\t0');
    expect(f[1]).toBe('UUID=aaa /     xfs defaults 0 0');
    expect(f[3]).toBe('/swapfile none swap defaults 0 0');
    expect(readFileSync(a.log, 'utf8')).not.toContain('grubby');
  });

  it('brak wpisu partycji w fstab: kod 1 (błąd, nie cichy sukces)', () => {
    const a = atrapa({ cel: '/home', typ: 'xfs', opcje: 'rw,noquota' });
    writeFileSync(a.fstab, 'UUID=aaa / xfs defaults 0 0\n');
    expect(wlacz(a).kod).toBe(1);
  });

  it('ext4: kod 2, bez zmian', () => {
    const a = atrapa({ cel: '/', typ: 'ext4', opcje: 'rw,relatime' });
    writeFileSync(a.grub, 'GRUB_CMDLINE_LINUX="quiet"\n');
    expect(wlacz(a).kod).toBe(2);
    expect(readFileSync(a.log, 'utf8')).not.toContain('grubby');
    expect(readFileSync(a.grub, 'utf8')).toBe('GRUB_CMDLINE_LINUX="quiet"\n');
  });

  it('grubby zwraca błąd: kod 1', () => {
    const a = atrapa({ cel: '/', typ: 'xfs', opcje: 'rw,noquota', grubbyKod: 1 });
    expect(wlacz(a).kod).toBe(1);
  });

  it('profil hostingowy ma tę samą funkcję co bootstrap i nie każe już robić grubby ręcznie', () => {
    expect(PROFIL).toContain(QUOTA_XFS_SH);
    expect(PROFIL).toMatch(/wlacz_quota_xfs "\$qp" \|\| kod=\$\?/);
    expect(PROFIL).not.toContain('XFS: grubby --update-kernel=ALL');
  });
});

describe('bootstrap węzła — faza QUOTA', () => {
  const skrypt = buildNodeBootstrapScript({
    apiBaseUrl: 'https://api.verris.pl/',
    bootstrapToken: 'eko_btk_test',
    serverId: 'srv-1',
    stackEnv: stosJakoEnv(),
    hostname: 't3.verris.pl',
  });

  it('po CloudLinux zawsze faza QUOTA, dopiero potem DA', () => {
    const cl = /phase_cloudlinux\(\) \{([\s\S]*?)\n\}/.exec(skrypt)![1]!;
    expect(cl).not.toContain('set_phase DA');
    expect(cl.match(/set_phase QUOTA/g)).toHaveLength(4);
    expect(skrypt).toMatch(/QUOTA\)\s+phase_quota ;;/);
    // preflight ustawia opcję wcześniej — restart CloudLinux ją od razu włącza
    expect(/phase_preflight\(\) \{([\s\S]*?)\n\}/.exec(skrypt)![1]).toContain('wlacz_quota_xfs /home');
  });

  /** Fazę QUOTA uruchamiamy naprawdę: skrypt bez końcowego `case`, report/fail do logu, stan w katalogu tymczasowym. */
  function fazaQuota(a: Atrapa): { out: string; faza: string } {
    const stan = join(a.dir, 'stan');
    spawnSync('mkdir', ['-p', stan]);
    // Tylko pliki tymczasowe: domyślne /etc/fstab i /etc/default/grub to prawdziwe pliki maszyny z testami
    // (runner CI ma /etc/default/grub — sed -i bez roota padał, a z rootem by go zmienił).
    const domyslne = 'fstab=/etc/fstab grub=/etc/default/grub';
    expect(skrypt).toContain(domyslne);
    const bezStartu = skrypt
      .replace(domyslne, `fstab='${a.fstab}' grub='${a.grub}'`)
      .replace('STATE_DIR=/var/lib/verris', `STATE_DIR='${stan}'`)
      .replace(/\ncase "\$\{1:-install\}" in[\s\S]*$/, '\n');
    writeFileSync(join(stan, 'bootstrap.state'), 'QUOTA\n');
    const r = uruchom(
      a,
      `${bezStartu}
report() { echo "report $*" >> '${a.log}'; }
phase_quota; echo "koniec=$?"`,
    );
    return { out: r.out, faza: readFileSync(join(stan, 'bootstrap.state'), 'utf8').trim() };
  }

  it('XFS bez quota: restart raz, po nim quota aktywna → DA; drugi raz bez quota → błąd fazy zamiast pętli', () => {
    const a = atrapa({ cel: '/', typ: 'xfs', opcje: 'rw,noquota' });
    writeFileSync(a.grub, '');
    let r = fazaQuota(a);
    expect(readFileSync(a.log, 'utf8')).toContain('report QUOTA REBOOT');
    expect(readFileSync(a.log, 'utf8')).toContain('systemctl reboot');
    expect(r.faza).toBe('QUOTA');

    // po restarcie z rootflags — quota działa
    writeFileSync(a.opcje, 'rw,attr2,usrquota,prjquota');
    r = fazaQuota(a);
    expect(readFileSync(a.log, 'utf8')).toContain('report QUOTA OK quota XFS aktywna');
    expect(r.faza).toBe('DA');

    // inny węzeł: po restarcie dalej noquota → FAILED, bez kolejnego restartu
    const b = atrapa({ cel: '/', typ: 'xfs', opcje: 'rw,noquota' });
    fazaQuota(b);
    writeFileSync(b.log, '');
    const r2 = fazaQuota(b);
    expect(readFileSync(b.log, 'utf8')).toContain('report QUOTA FAILED quota XFS nieaktywna mimo restartu');
    expect(readFileSync(b.log, 'utf8')).not.toContain('systemctl reboot');
    expect(r2.faza).toBe('QUOTA');
  });

  it('ext4: faza przechodzi do DA bez restartu', () => {
    const a = atrapa({ cel: '/', typ: 'ext4', opcje: 'rw,relatime' });
    const r = fazaQuota(a);
    expect(r.faza).toBe('DA');
    expect(readFileSync(a.log, 'utf8')).not.toContain('systemctl reboot');
  });
});
