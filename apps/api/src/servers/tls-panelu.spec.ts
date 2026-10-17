import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildNodeBootstrapScript } from './node-bootstrap.script.js';
import { KNOWN_PHASES } from './node-bootstrap.service.js';
import { stosJakoEnv } from './stos-wezla.js';
import { TLS_PANELU_SH } from './tls-panelu.script.js';

/**
 * PB-31 (17.10, TEST-02): po bootstrapie DirectAdmin miał ssl=0 — panel po czystym HTTP (ERR_SSL_PROTOCOL_ERROR),
 * jednorazowy link logowania i API bez TLS. Bootstrap ma teraz fazę TLS: certyfikat hostname mechanizmem DA,
 * dopiero potem ssl=1. Ta sama funkcja w skrypcie dla węzłów sprzed zmiany.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const HTTP01 = readFileSync(join(KORZEN, 'ops', 'scripts', 'node-directadmin-tls-http01.sh'), 'utf8');
const IP = '62.171.162.57';

interface Atrapa {
  dir: string;
  da: string;
  log: string;
  /** Plik z wartością ssl w „directadmin.conf” atrapy. */
  ssl: string;
}

/**
 * Atrapy: da (config-get/config-set na plikach), dig (rekord A z pliku), ip, curl (HTTPS działa tylko przy
 * ssl=1 i wydanym certyfikacie), letsencrypt.sh (kod z opcji), sleep — wszystko do logu.
 */
function atrapa(o: { rekordA?: string; ssl?: string; leKod?: number; certJest?: boolean }): Atrapa {
  const dir = mkdtempSync(join(tmpdir(), 'tls-panelu-'));
  const da = join(dir, 'da');
  const bin = join(dir, 'bin');
  mkdirSync(join(da, 'scripts'), { recursive: true });
  mkdirSync(bin);
  const a: Atrapa = { dir, da, log: join(dir, 'log'), ssl: join(dir, 'ssl') };
  writeFileSync(a.log, '');
  writeFileSync(a.ssl, o.ssl ?? '0');
  writeFileSync(join(dir, 'a'), o.rekordA ?? '');
  const cert = join(dir, 'cert');
  if (o.certJest) writeFileSync(cert, '');
  const skrypt = (sciezka: string, tresc: string) => {
    writeFileSync(sciezka, `#!/usr/bin/env bash\n${tresc}\n`);
    chmodSync(sciezka, 0o755);
  };
  skrypt(
    join(bin, 'da'),
    `echo "da $*" >> '${a.log}'
case "$1 $2" in
  "config-get ssl") cat '${a.ssl}' ;;
  "config-get port") echo 2222 ;;
  "config-set ssl") echo "$3" > '${a.ssl}' ;;
esac`,
  );
  skrypt(
    join(bin, 'dig'),
    `echo "dig $*" >> '${a.log}'
case "$*" in
  "+short NS verris.pl") echo 'dns200.anycast.me.' ;;
  *" NS "*) ;;
  *) cat '${join(dir, 'a')}' ;;
esac`,
  );
  skrypt(join(bin, 'ip'), `echo '1.1.1.1 via 62.171.162.1 dev eth0 src ${IP} uid 0'`);
  skrypt(
    join(bin, 'curl'),
    `echo "curl $*" >> '${a.log}'
[ "$(cat '${a.ssl}')" = 1 ] && [ -f '${cert}' ] && exit 0
exit 35`,
  );
  skrypt(join(bin, 'sleep'), `echo "sleep $*" >> '${a.log}'`);
  skrypt(join(bin, 'dnf'), `echo "dnf $*" >> '${a.log}'; exit 1`);
  skrypt(
    join(da, 'scripts', 'letsencrypt.sh'),
    `echo "letsencrypt.sh $*" >> '${a.log}'
[ "${o.leKod ?? 0}" = 0 ] && touch '${cert}'
exit ${o.leKod ?? 0}`,
  );
  return a;
}

function sciezka(a: Atrapa): string {
  return `${join(a.dir, 'bin')}:${process.env.PATH}`;
}

/** PATH bez systemowego dig: atrapy + tylko potrzebne narzędzia (dowiązania). */
function sciezkaBezDig(a: Atrapa): string {
  const nb = join(a.dir, 'narzedzia');
  mkdirSync(nb, { recursive: true });
  for (const n of ['bash', 'seq', 'sed', 'grep', 'head', 'cat', 'touch']) {
    const z = spawnSync('bash', ['-c', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim();
    if (z) symlinkSync(z, join(nb, n));
  }
  rmSync(join(a.dir, 'bin', 'dig'));
  return `${join(a.dir, 'bin')}:${nb}`;
}

function wlacz(a: Atrapa, host = 't2.verris.pl', path = sciezka(a)): { kod: number; log: string; out: string } {
  const r = spawnSync('/bin/bash', ['-c', `set -uo pipefail\n${TLS_PANELU_SH}\nwlacz_tls_panelu '${host}' '${a.da}'; echo "kod=$?"`], {
    encoding: 'utf8',
    env: { ...process.env, PATH: path, TLS_DNS_PROB: '3' },
  });
  const out = `${r.stdout}${r.stderr}`;
  const m = /kod=(\d+)/.exec(out);
  return { kod: m ? Number(m[1]) : -1, log: readFileSync(a.log, 'utf8'), out };
}

describe('wlacz_tls_panelu — certyfikat hostname i HTTPS panelu bez ręcznego kroku', () => {
  it('świeży DA (ssl=0), rekord A wskazuje węzeł: ACME włączone, server_cert, dopiero potem ssl=1; kod 0', () => {
    const a = atrapa({ rekordA: IP });
    const r = wlacz(a);
    expect(r.kod).toBe(0);
    expect(r.log).toContain('da config-set acme_server_cert_enabled 1 --no-reload');
    expect(r.log).toContain(`letsencrypt.sh server_cert`);
    // rekord A pytany u serwera autorytatywnego strefy, nie w /etc/hosts
    expect(r.log).toContain('dig +short NS verris.pl');
    expect(r.log).toContain('dig +short A t2.verris.pl @dns200.anycast.me.');
    const le = r.log.indexOf('letsencrypt.sh server_cert');
    const ssl = r.log.indexOf('da config-set ssl 1');
    expect(ssl).toBeGreaterThan(le);
    expect(readFileSync(a.ssl, 'utf8').trim()).toBe('1');
    // HTTPS sprawdzane z weryfikacją certyfikatu (bez -k), na porcie panelu z konfiguracji
    expect(r.log).toMatch(/curl .*--resolve t2\.verris\.pl:2222:127\.0\.0\.1 https:\/\/t2\.verris\.pl:2222\//);
    expect(r.log).not.toMatch(/curl .*(-k|--insecure)/);
  });

  it('panel już po HTTPS z ważnym certyfikatem: kod 0 bez nowego certyfikatu (idempotentnie)', () => {
    const a = atrapa({ rekordA: IP, ssl: '1', certJest: true });
    const r = wlacz(a);
    expect(r.kod).toBe(0);
    expect(r.log).not.toContain('letsencrypt.sh');
    expect(r.log).not.toContain('config-set');
  });

  it('rekord A jeszcze nie istnieje albo wskazuje inny serwer: kod 3, bez prób Let’s Encrypt i bez ssl=1', () => {
    for (const rekord of ['', '203.0.113.9']) {
      const a = atrapa({ rekordA: rekord });
      const r = wlacz(a);
      expect(r.kod).toBe(3);
      expect(r.log).not.toContain('letsencrypt.sh');
      expect(r.log).not.toContain('config-set ssl');
      // ACME DA włączone dopiero po zgodnym rekordzie — inaczej DA sam zużywałby limit nieudanych walidacji
      expect(r.log).not.toContain('acme_server_cert_enabled');
      expect(r.log.match(/dig \+short A/g)).toHaveLength(3);
      // bez czekania po ostatniej próbie
      expect(r.log.match(/sleep 30/g)).toHaveLength(2);
      expect(readFileSync(a.ssl, 'utf8').trim()).toBe('0');
    }
  });

  it('brak dig i nieudana instalacja bind-utils: kod 4, bez prób Let’s Encrypt', () => {
    const a = atrapa({ rekordA: IP });
    const r = wlacz(a, 't2.verris.pl', sciezkaBezDig(a));
    expect(r.kod).toBe(4);
    expect(r.log).toContain('dnf -y -q install bind-utils');
    expect(r.log).not.toContain('letsencrypt.sh');
    expect(r.log).not.toContain('acme_server_cert_enabled');
  });

  it('nazwa głębsza niż strefa (x.t3.verris.pl): NS strefy verris.pl, nie pusty serwer', () => {
    const a = atrapa({ rekordA: IP });
    const r = wlacz(a, 'x.t3.verris.pl');
    expect(r.kod).toBe(0);
    expect(r.log).toContain('dig +short A x.t3.verris.pl @dns200.anycast.me.');
  });

  it('server_cert zawodzi: 3 próby z odstępem, kod 1, panel zostaje bez ssl=1 (bez samopodpisanego certyfikatu)', () => {
    const a = atrapa({ rekordA: IP, leKod: 1 });
    const r = wlacz(a);
    expect(r.kod).toBe(1);
    expect(r.log.match(/letsencrypt\.sh server_cert/g)).toHaveLength(3);
    expect(r.log.match(/sleep 120/g)).toHaveLength(2);
    expect(r.log).not.toContain('config-set ssl');
  });

  it('skrypt dla węzłów sprzed zmiany: --renew przed nazwą hosta nie staje się nazwą hosta', () => {
    const parsowanie = /\nHOST=""\n[\s\S]*?\ndone\n/.exec(HTTP01)![0];
    const r = spawnSync('bash', ['-c', `set -- --renew node.x.verris.pl\n${parsowanie}\necho "$HOST $RENEW"`], { encoding: 'utf8' });
    expect(r.stdout.trim()).toBe('node.x.verris.pl 1');
  });

  it('skrypt dla węzłów sprzed zmiany ma tę samą funkcję co bootstrap', () => {
    expect(HTTP01).toContain(TLS_PANELU_SH);
    expect(HTTP01).toMatch(/wlacz_tls_panelu "\$HOST" "\$DA" \|\| kod=\$\?/);
    expect(spawnSync('bash', ['-n', '-c', HTTP01]).status).toBe(0);
  });
});

describe('bootstrap węzła — faza TLS', () => {
  const skrypt = buildNodeBootstrapScript({
    apiBaseUrl: 'https://api.verris.pl/',
    bootstrapToken: 'eko_btk_test',
    serverId: 'srv-1',
    stackEnv: stosJakoEnv(),
    hostname: 't2.verris.pl',
  });

  it('po CANARY (wtedy control-plane zakłada rekord A) faza TLS, dopiero ona kończy bootstrap', () => {
    const canary = /phase_canary\(\) \{([\s\S]*?)\n\}/.exec(skrypt)![1]!;
    expect(canary).toContain('set_phase TLS');
    expect(canary).not.toContain('finish');
    expect(skrypt).toMatch(/TLS\)\s+phase_tls ;;/);
    expect(skrypt).toContain(TLS_PANELU_SH);
    // raport CANARY STARTED uruchamia DNS w OVH — nie może zginąć po jednym nieudanym żądaniu
    expect(/report\(\) \{[\s\S]*?\n\}/.exec(skrypt)![0]).toContain('--retry-all-errors');
  });

  it('API zna każdą fazę, którą raportuje skrypt (nieznana zapisywała się jako PENDING)', () => {
    const fazy = new Set([...skrypt.matchAll(/report (\w+) (?:STARTED|OK|FAILED|REBOOT)/g)].map((m) => m[1]!));
    expect(fazy).toContain('TLS');
    for (const f of fazy) expect(KNOWN_PHASES.has(f)).toBe(true);
  });

  /** Fazę TLS uruchamiamy naprawdę: bez końcowego `case`, report do logu, stan i pliki w katalogu tymczasowym. */
  function fazaTls(a: Atrapa): { faza: string; log: string } {
    const stan = join(a.dir, 'stan');
    mkdirSync(stan, { recursive: true });
    writeFileSync(join(stan, 'bootstrap.state'), 'TLS\n');
    const runner = join(a.dir, 'runner');
    writeFileSync(runner, '');
    const kod = skrypt
      .replace('STATE_DIR=/var/lib/verris', `STATE_DIR='${stan}'`)
      .replace('RUNNER=/usr/local/sbin/verris-bootstrap', `RUNNER='${runner}'`)
      .replace('UNIT=/etc/systemd/system/verris-bootstrap.service', `UNIT='${join(a.dir, 'unit')}'`)
      .replace('DA=/usr/local/directadmin dabin', `DA='${a.da}' dabin`)
      .replace(/\ncase "\$\{1:-install\}" in[\s\S]*$/, '\n');
    expect(kod).toContain(`DA='${a.da}' dabin`);
    writeFileSync(join(a.dir, 'bin', 'systemctl'), `#!/usr/bin/env bash\necho "systemctl $*" >> '${a.log}'\n`);
    chmodSync(join(a.dir, 'bin', 'systemctl'), 0o755);
    spawnSync(
      'bash',
      [
        '-c',
        `set -uo pipefail
${kod}
report() { echo "report $*" >> '${a.log}'; }
phase_tls`,
      ],
      { encoding: 'utf8', env: { ...process.env, PATH: sciezka(a), TLS_DNS_PROB: '3' } },
    );
    return { faza: readFileSync(join(stan, 'bootstrap.state'), 'utf8').trim(), log: readFileSync(a.log, 'utf8') };
  }

  it('certyfikat wydany: TLS OK i DONE (token usunięty); brak rekordu A: TLS FAILED, faza zostaje do ponowienia', () => {
    const ok = atrapa({ rekordA: IP });
    let r = fazaTls(ok);
    expect(r.log).toContain('report TLS OK HTTPS panelu z certyfikatem dla t2.verris.pl');
    expect(r.faza).toBe('DONE');
    expect(existsSync(join(ok.dir, 'runner'))).toBe(false);

    const bezA = atrapa({ rekordA: '' });
    r = fazaTls(bezA);
    expect(r.log).toMatch(/report TLS FAILED rekord A t2\.verris\.pl nie wskazuje węzła.*systemctl start verris-bootstrap/);
    expect(r.faza).toBe('TLS');
    expect(existsSync(join(bezA.dir, 'runner'))).toBe(true);
  });
});
