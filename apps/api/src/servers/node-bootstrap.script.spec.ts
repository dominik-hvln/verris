import { execFileSync, spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildNodeBootstrapOneLiner, buildNodeBootstrapScript } from './node-bootstrap.script.js';
import { STOS_WEZLA, stosJakoEnv, zgodnoscZManifestem } from './stos-wezla.js';
import { renderBootstrapScript } from './servers.service.js';

/** PB-29 / PB-30 — bootstrap węzła: bez sekretów w treści, manifest wersji, poprawne wykrywanie CloudLinux. */
describe('Bootstrap węzła (PB-29 / PB-30)', () => {
  const skrypt = buildNodeBootstrapScript({
    apiBaseUrl: 'https://api.verris.pl/',
    bootstrapToken: 'eko_btk_test',
    serverId: 'srv-1',
    stackEnv: stosJakoEnv(),
    hostname: 'node-pl-02.verris.pl',
  });

  it('jest poprawnym skryptem bash', () => {
    expect(() => execFileSync('bash', ['-n'], { input: skrypt })).not.toThrow();
  });

  it('nie zawiera kluczy licencyjnych — pobiera je POST-em z nagłówkiem tokenu', () => {
    expect(skrypt).toMatch(/^DA_LICENSE=''$/m);
    expect(skrypt).toMatch(/^CL_ACTIVATION_KEY=''$/m);
    expect(skrypt).toMatch(/^LS_SERIAL=''$/m);
    expect(skrypt).toContain('-X POST -H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN" "$API_BASE/agent/nodes/bootstrap/secrets"');
    expect(skrypt).not.toContain('?token=');
  });

  it('wykrywa CloudLinux przez /proc/lve i cldetect, nie po nazwie jądra', () => {
    expect(skrypt).toContain('[ -e /proc/lve/list ]');
    expect(skrypt).toContain('cldetect --detect-edition');
    expect(skrypt).not.toContain('uname -r | grep -qi lve');
  });

  it('instaluje DirectAdmin z wersjami z manifestu i sprząta token po DONE', () => {
    expect(skrypt).toContain(`VERRIS_MARIADB='${STOS_WEZLA.mariadb}'`);
    expect(skrypt).toContain('export DA_CHANNEL="$VERRIS_DA_CHANNEL"');
    expect(skrypt).toContain('mysql_inst=mariadb mariadb="$VERRIS_MARIADB"');
    expect(skrypt).toContain('rm -f "$RUNNER" "$UNIT"');
  });

  it('działa na świeżym obrazie chmurowym (Hetzner Cloud AlmaLinux 9)', () => {
    // cloud-init nie nadpisze nazwy hosta po restarcie CloudLinux; swap wymagany przez DA; SELinux permissive.
    expect(skrypt).toContain('preserve_hostname: true');
    expect(skrypt).toContain('mkswap /swapfile');
    expect(skrypt).toContain("sed -i 's/^SELINUX=enforcing/SELINUX=permissive/'");
    // obraz nie musi mieć wget — tylko curl (sprawdzany w PREFLIGHT)
    expect(skrypt).not.toMatch(/^\s*wget /m);
    // start przez systemd, nie w sesji SSH (zerwane SSH nie przerywa instalacji)
    expect(skrypt).toContain('systemctl start --no-block verris-bootstrap.service');
    expect(skrypt).not.toContain('exec "$RUNNER" run');
    expect(skrypt).toContain('Environment=HOME=/root');
  });

  it('LiteSpeed przez CustomBuild: opcja litespeed_serialno, tryb lsphp, trial bez seriala', () => {
    expect(skrypt).toContain('./build set litespeed_serialno "$LS_SERIAL"');
    expect(skrypt).not.toMatch(/litespeed_serial\s/);
    expect(skrypt).toContain('./build set php1_mode lsphp');
    // CustomBuild z setup.sh nie może biec w tle równolegle z fazą STACK
    expect(skrypt).toContain('export DA_FOREGROUND_CUSTOMBUILD=yes');
    expect(skrypt).not.toContain('pominięto LiteSpeed');
  });

  it('one-liner niesie token w nagłówku, nie w adresie', () => {
    const linia = buildNodeBootstrapOneLiner({ apiBaseUrl: 'https://api.verris.pl', bootstrapToken: 'eko_btk_x' });
    expect(linia).toBe("curl -fsS -H 'X-Bootstrap-Token: eko_btk_x' 'https://api.verris.pl/agent/nodes/bootstrap/script' | bash");
  });

  it('raport zgodności porównuje prefiks wersji i zna brak raportu', () => {
    const r = zgodnoscZManifestem({ stackVersion: STOS_WEZLA.wersja, dbVersion: '11.4.13', lsVersion: '6.2.1', phpVersion: null });
    expect(r.map((p) => p.zgodne)).toEqual([true, true, false, null]);
  });
});

describe('ponowny jednolinijkowiec w trakcie instalacji (17.10)', () => {
  function instaluj(stanUslugi: string): { runner: string; out: string; dir: string } {
    const dir = mkdtempSync(join(tmpdir(), 'install-self-'));
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const runner = join(dir, 'runner');
    writeFileSync(runner, 'STARY SKRYPT W TRAKCIE\n');
    const atrapa = (n: string, t: string) => {
      writeFileSync(join(bin, n), `#!/usr/bin/env bash\n${t}\n`);
      chmodSync(join(bin, n), 0o755);
    };
    atrapa('systemctl', `case "$*" in *ActiveState*) echo '${stanUslugi}' ;; esac`);
    atrapa('curl', `for a in "$@"; do [ "$p" = "-o" ] && echo 'NOWY SKRYPT' > "$a"; p="$a"; done`);
    const skrypt = buildNodeBootstrapScript({ apiBaseUrl: 'https://api.verris.pl', bootstrapToken: 't', serverId: 's', stackEnv: stosJakoEnv(), hostname: 't2.verris.pl' })
      .replace('STATE_DIR=/var/lib/verris', `STATE_DIR='${join(dir, 'stan')}'`)
      .replace('RUNNER=/usr/local/sbin/verris-bootstrap', `RUNNER='${runner}'`)
      .replace('UNIT=/etc/systemd/system/verris-bootstrap.service', `UNIT='${join(dir, 'unit')}'`)
      .replace(/write_stack_env\(\) \{/, `write_stack_env() { return 0;`);
    const r = spawnSync('bash', ['-s'], { input: skrypt, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
    return { runner: readFileSync(runner, 'utf8'), out: `${r.stdout}${r.stderr}`, dir };
  }

  it('usługa działa (activating) → plik usługi nietknięty, komunikat', () => {
    const r = instaluj('activating');
    expect(r.runner).toBe('STARY SKRYPT W TRAKCIE\n');
    expect(r.out).toContain('bootstrap już działa w tle');
  });

  it('usługa nie działa (failed / brak) → skrypt podmieniony', () => {
    expect(instaluj('failed').runner).toBe('NOWY SKRYPT\n');
    expect(existsSync(join(instaluj('').dir, 'runner.nowy'))).toBe(false);
  });
});

describe('faza AGENT — ponowienie po udanym handshake (17.10)', () => {
  function fazaAgent(maTozsamosc: boolean): { log: string; faza: string } {
    const dir = mkdtempSync(join(tmpdir(), 'faza-agent-'));
    const bin = join(dir, 'bin');
    const stan = join(dir, 'stan');
    mkdirSync(bin);
    mkdirSync(stan);
    const log = join(dir, 'log');
    writeFileSync(log, '');
    const conf = join(dir, 'verris.conf');
    if (maTozsamosc) writeFileSync(conf, 'VERRIS_SERVER_ID="s"\nVERRIS_IDENTITY_TOKEN="x"\n');
    writeFileSync(join(stan, 'agent-install.sh'), `echo "agent POMIN=\${VERRIS_POMIN_HANDSHAKE:-0}" >> '${log}'\n`);
    writeFileSync(join(stan, 'bootstrap.state'), 'AGENT\n');
    // token zużyty: /secrets i /agent-script → 401
    writeFileSync(join(bin, 'curl'), `#!/usr/bin/env bash\necho "curl $*" >> '${log}'\nexit 22\n`);
    chmodSync(join(bin, 'curl'), 0o755);
    const s = buildNodeBootstrapScript({ apiBaseUrl: 'https://api.verris.pl', bootstrapToken: 't', serverId: 's', stackEnv: stosJakoEnv(), hostname: 't2.verris.pl' })
      .replace('STATE_DIR=/var/lib/verris', `STATE_DIR='${stan}'`)
      .replaceAll('/etc/verris.conf 2>/dev/null', `'${conf}' 2>/dev/null`)
      .replace(/\ncase "\$\{1:-install\}" in[\s\S]*$/, '\n');
    spawnSync('bash', ['-c', `${s}\nreport() { echo "report $*" >> '${log}'; }\nload_secrets() { echo "load_secrets" >> '${log}'; return 1; }\nphase_agent`], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    return { log: readFileSync(log, 'utf8'), faza: readFileSync(join(stan, 'bootstrap.state'), 'utf8').trim() };
  }

  it('tożsamość zapisana → zachowany skrypt agenta bez handshake, bez kluczy, faza CANARY', () => {
    const r = fazaAgent(true);
    expect(r.log).toContain('agent POMIN=1');
    expect(r.log).not.toContain('load_secrets');
    expect(r.log).toContain('report AGENT OK');
    expect(r.faza).toBe('CANARY');
  });

  it('bez tożsamości → zwykła ścieżka (klucze), błąd przy zużytym tokenie', () => {
    const r = fazaAgent(false);
    expect(r.log).toContain('load_secrets');
    expect(r.log).toContain('report AGENT FAILED');
  });

  it('skrypt agenta przy pominiętym handshake dochodzi do końca (set -u: zmienne z handshake niezdefiniowane)', () => {
    const agent = renderBootstrapScript({ apiUrl: 'https://api.verris.pl', bootstrapToken: 't', serverName: 'n' });
    // od bloku handshake do końca, bez instalacji (sekcje po handshake podmieniamy na nic) — liczy się zakończenie
    const start = agent.indexOf('# 17.10 (PB-31): ponowienie fazy AGENT');
    const koniecHandshake = agent.indexOf('fi # VERRIS_POMIN_HANDSHAKE') + 'fi # VERRIS_POMIN_HANDSHAKE'.length;
    const ogon = agent.slice(agent.indexOf('echo "[verris] Bootstrap complete.'));
    const dir = mkdtempSync(join(tmpdir(), 'agent-ogon-'));
    const conf = join(dir, 'verris.conf');
    writeFileSync(conf, 'VERRIS_IDENTITY_TOKEN="x"\n');
    const kod = `set -euo pipefail\nCONFIG_FILE='${conf}'\n${agent.slice(start, koniecHandshake)}\n${ogon}`;
    const r = spawnSync('bash', ['-c', kod], { encoding: 'utf8', env: { ...process.env, VERRIS_POMIN_HANDSHAKE: '1' } });
    expect(r.stderr).not.toContain('unbound variable');
    expect(r.status).toBe(0);
  });

  it('skrypt agenta pomija handshake przy VERRIS_POMIN_HANDSHAKE=1 i zapisanej tożsamości', () => {
    const agent = renderBootstrapScript({ apiUrl: 'https://api.verris.pl', bootstrapToken: 't', serverName: 'n' });
    const i = agent.indexOf('VERRIS_POMIN_HANDSHAKE:-0');
    expect(i).toBeGreaterThan(0);
    expect(agent.indexOf('"$API_URL/servers/handshake"')).toBeGreaterThan(i);
    expect(agent.indexOf('fi # VERRIS_POMIN_HANDSHAKE')).toBeGreaterThan(agent.indexOf('"$API_URL/servers/handshake"'));
  });
});

describe('faza CLOUDLINUX — LVE po restarcie (17.10)', () => {
  function fazaCl(o: { lve: boolean; przekonwertowany: boolean; poRestarcie: boolean }): { log: string; faza: string } {
    const dir = mkdtempSync(join(tmpdir(), 'faza-cl-'));
    const stan = join(dir, 'stan');
    mkdirSync(stan);
    const log = join(dir, 'log');
    writeFileSync(log, '');
    writeFileSync(join(stan, 'bootstrap.state'), 'CLOUDLINUX\n');
    if (o.poRestarcie) writeFileSync(join(stan, '.cloudlinux-restart'), '');
    const s = buildNodeBootstrapScript({ apiBaseUrl: 'https://api.verris.pl', bootstrapToken: 't', serverId: 's', stackEnv: stosJakoEnv(), hostname: 't2.verris.pl' })
      .replace('STATE_DIR=/var/lib/verris', `STATE_DIR='${stan}'`)
      .replace(/\ncase "\$\{1:-install\}" in[\s\S]*$/, '\n');
    spawnSync(
      'bash',
      ['-c', `${s}\nreport() { echo "report $*" >> '${log}'; }\nsystemctl() { echo "systemctl $*" >> '${log}'; }\nsync() { :; }\nlve_active() { ${o.lve ? 'true' : 'false'}; }\ncloudlinux_converted() { ${o.przekonwertowany ? 'true' : 'false'}; }\nphase_cloudlinux`],
      { encoding: 'utf8' },
    );
    return { log: readFileSync(log, 'utf8'), faza: readFileSync(join(stan, 'bootstrap.state'), 'utf8').trim() };
  }

  it('przekonwertowany, LVE jeszcze nie działa → restart, faza zostaje CLOUDLINUX (sprawdzenie po restarcie)', () => {
    const r = fazaCl({ lve: false, przekonwertowany: true, poRestarcie: false });
    expect(r.log).toContain('report CLOUDLINUX REBOOT');
    expect(r.log).toContain('systemctl reboot');
    expect(r.faza).toBe('CLOUDLINUX');
  });

  it('po restarcie LVE dalej nie działa → błąd fazy, bez kolejnego restartu', () => {
    const r = fazaCl({ lve: false, przekonwertowany: true, poRestarcie: true });
    expect(r.log).toContain('report CLOUDLINUX FAILED CloudLinux zainstalowany, ale LVE nie działa po restarcie');
    expect(r.log).not.toContain('systemctl reboot');
  });

  it('po restarcie LVE działa → QUOTA', () => {
    const r = fazaCl({ lve: true, przekonwertowany: true, poRestarcie: true });
    expect(r.log).toContain('report CLOUDLINUX OK');
    expect(r.faza).toBe('QUOTA');
  });
});
