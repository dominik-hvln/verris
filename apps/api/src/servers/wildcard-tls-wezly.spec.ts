import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Decyzja 17.10 (PB-31): certyfikat panelu węzła wydaje DA (ACME, faza TLS bootstrapu). Cron wildcard na control-plane
 * nadpisywał go co tydzień i trzymał klucz *.verris.pl na węzłach; błąd ssh kończył się „OK” (`|| failed++` wyłącza
 * set -e w funkcji).
 */
const SKRYPT = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'verris-node-wildcard-tls.sh'), 'utf8');
const FUNKCJA = /\ndeploy_cert_to_node\(\) \{[\s\S]*?\n\}\n/.exec(SKRYPT)![0];

function uruchom(o: { acme: string; sshKod?: number }): { kod: number; log: string; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'wildcard-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const log = join(dir, 'log');
  writeFileSync(log, '');
  const atrapa = (n: string, t: string) => {
    writeFileSync(join(bin, n), `#!/usr/bin/env bash\n${t}\n`);
    chmodSync(join(bin, n), 0o755);
  };
  atrapa('ssh', `echo "ssh $*" >> '${log}'; cat >/dev/null; case "$*" in *config-get*) echo ' ${o.acme}' ;; esac; exit ${o.sshKod ?? 0}`);
  atrapa('scp', `echo "scp $*" >> '${log}'`);
  const r = spawnSync(
    'bash',
    ['-c', `set -euo pipefail\nLOG_TAG=x; CERT_DIR=/c\nlog() { echo "$*"; }\nssh_key_path() { echo /k; }\n${FUNKCJA}\nfailed=0\ndeploy_cert_to_node 203.0.113.5 t9.verris.pl || failed=1\necho "failed=$failed"`],
    { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } },
  );
  const out = `${r.stdout}${r.stderr}`;
  return { kod: Number(/failed=(\d)/.exec(out)?.[1] ?? -1), log: readFileSync(log, 'utf8'), out };
}

describe('wildcard TLS z control-plane na węzły', () => {
  it('węzeł z ACME DA (acme_server_cert_enabled=1): pominięty, klucz nie jest wysyłany', () => {
    const r = uruchom({ acme: '1' });
    expect(r.kod).toBe(0);
    expect(r.out).toContain('SKIP t9.verris.pl');
    expect(r.log).not.toContain('privkey.pem');
  });

  it('węzeł bez klucza acme w DA (starszy, np. t1): sprawdzenie nie kończy się błędem ssh — wildcard wdrażany jak dotąd', () => {
    expect(FUNKCJA).toMatch(/config-get acme_server_cert_enabled 2>\/dev\/null \|\| true"/);
    const r = uruchom({ acme: '' });
    expect(r.kod).toBe(0);
    expect(r.log).toContain('privkey.pem');
  });

  it('błąd ssh: węzeł liczony jako nieudany, nie „OK”', () => {
    const r = uruchom({ acme: '0', sshKod: 255 });
    expect(r.kod).toBe(1);
    expect(r.out).not.toContain('OK t9.verris.pl');
  });
});

it('lista kontrolna Onboard LIVE: Host DA = nazwa hosta (certyfikat), bez kroku wildcard i bez rekordu A w OVH', () => {
  const onboard = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-onboard-live.sh'), 'utf8');
  expect(onboard).not.toContain('Host=$PUBLIC_IP');
  expect(onboard).toContain('Host=${da_host}');
  expect(onboard).not.toContain('verris-node-wildcard-tls.sh --deploy-only');
  expect(onboard).not.toContain('rekord A w OVH');
});
