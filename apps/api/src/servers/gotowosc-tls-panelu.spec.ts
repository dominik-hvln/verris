import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** 17.10 (PB-31): raport gotowości (Onboard LIVE) był zielony przy panelu DA po czystym HTTP (ssl=0). */
const SKRYPT = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-live-readiness.sh'), 'utf8');
const FUNKCJA = /\nsprawdz_tls_panelu\(\) \{[\s\S]*?\n\}\n/.exec(SKRYPT)![0];

function sprawdz(o: { ssl: string; curlKod: number }): string {
  const dir = mkdtempSync(join(tmpdir(), 'gotowosc-tls-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const atrapa = (n: string, t: string) => {
    writeFileSync(join(bin, n), `#!/usr/bin/env bash\n${t}\n`);
    chmodSync(join(bin, n), 0o755);
  };
  atrapa('da', `case "$2" in servername) echo t2.verris.pl ;; port) echo 2222 ;; ssl) echo ${o.ssl} ;; esac`);
  atrapa('curl', `echo "$*" >> '${join(dir, 'curl.log')}'; exit ${o.curlKod}`);
  const r = spawnSync('bash', ['-c', `log_ok() { echo "[OK] $*"; }\nlog_fail() { echo "[FAIL] $*"; }\n${FUNKCJA}\nsprawdz_tls_panelu`], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  let curl = '';
  try {
    curl = readFileSync(join(dir, 'curl.log'), 'utf8');
  } catch {
    /* curl nie był wołany */
  }
  return `${r.stdout}${r.stderr}${curl}`;
}

it('ssl=0 → [FAIL]', () => {
  expect(sprawdz({ ssl: '0', curlKod: 0 })).toContain('[FAIL] panel serwera bez HTTPS');
});
it('ssl=1, certyfikat nie przechodzi weryfikacji (curl 60) → [FAIL]', () => {
  expect(sprawdz({ ssl: '1', curlKod: 60 })).toContain('[FAIL]');
});
it('ssl=1 i ważny certyfikat → [OK], sprawdzenie bez -k na nazwie hosta', () => {
  const out = sprawdz({ ssl: '1', curlKod: 0 });
  expect(out).toContain('[OK] panel serwera po HTTPS');
  expect(out).toContain('--resolve t2.verris.pl:2222:127.0.0.1 https://t2.verris.pl:2222/');
  expect(out).not.toMatch(/ -k | --insecure/);
});
it('weryfikacja LIVE woła sprawdzenie TLS panelu', () => {
  expect(/verify_live_readiness\(\) \{[\s\S]*?\n\}/.exec(SKRYPT)![0]).toContain('sprawdz_tls_panelu');
});
