import { readFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Deploy nie pobiera niczego spoza ghcr.io.
 * 2026-09-23: obrazy aplikacji (ghcr.io) pobrane, a potem migracja www wołała node:22 z Docker
 * Huba (prune przed pull usuwa go przy każdym deployu) — „TLS handshake timeout” do
 * auth.docker.io, potem to samo z mirror.gcr.io. Trzy nieudane deploye z rzędu z jednego powodu.
 */
const KORZEN = resolve(__dirname, '../../../..');
const deploy = readFileSync(join(KORZEN, 'ops/scripts/prod-deploy-ghcr.sh'), 'utf8');
const migracja = readFileSync(join(KORZEN, 'ops/scripts/prod-migrate-www.sh'), 'utf8');
const kod = (t: string) => t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

describe('deploy pobiera obrazy wyłącznie z ghcr.io', () => {
  it('migracja www dostaje obraz API z rejestru, a nie domyślny node z Docker Huba', () => {
    expect(kod(deploy)).toMatch(/MIGRATE_NODE_IMAGE="\$\{REGISTRY_PREFIX\}\/verris-api:\$\{IMAGE_TAG\}"\s+bash ops\/scripts\/prod-migrate-www\.sh/);
  });

  it('migracja nadpisuje entrypoint API i zdejmuje NODE_ENV=production (inaczej brak CLI Payloada)', () => {
    const m = kod(migracja);
    expect(m).toMatch(/--entrypoint bash/);
    expect(m).toMatch(/-e NODE_ENV= /);
    expect(m).toMatch(/"\$NODE_IMAGE" -lc/);
  });

  it('żadne inne docker run / pull w deployu nie celuje w Docker Huba', () => {
    const obce = kod(deploy).split('\n').filter((l) => /docker (run|pull)\b/.test(l) && !/ghcr\.io|\$\{?REGISTRY_PREFIX|IMAGE_TAG/.test(l));
    expect(obce).toEqual([]);
  });
});
