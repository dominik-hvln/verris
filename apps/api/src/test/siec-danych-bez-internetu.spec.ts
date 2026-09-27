import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Sieć danych bez internetu (2026-09-28). `verris_internal` ma `internal: true`, a przejście
 * istniejącej sieci robi jeden skrypt — deploy przy starej sieci odmawia, zanim ruszy kontenery.
 * Sprawdzone na replice stosu (Docker 29, Compose 5.1): częściowe `up`/`run` przy starej sieci
 * potrafi zostawić zatrzymaną bazę, a `down` + `up` odtworzyłby kontener postgresa (PB-38).
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const czytaj = (p: string) => readFileSync(join(KORZEN, p), 'utf8');
const bezKomentarzy = (t: string) => t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

describe('sieć danych bez internetu', () => {
  it('verris_internal ma internal: true, verris_public nie', () => {
    const compose = czytaj('docker-compose.prod.yml');
    const blok = (nazwa: string) => {
      const m = new RegExp(`\\n  ${nazwa}:[^\\n]*\\n((?:    [^\\n]*\\n|\\s*\\n)*)`).exec(compose);
      return bezKomentarzy(m?.[1] ?? '');
    };
    expect(blok('verris_internal')).toMatch(/^\s*internal: true\s*$/m);
    expect(blok('verris_public')).not.toMatch(/internal: true/);
  });

  it('deploy odmawia przy starej sieci PRZED pierwszym poleceniem compose', () => {
    const kod = bezKomentarzy(czytaj('ops/scripts/prod-deploy-ghcr.sh'));
    const straznik = kod.indexOf('prod-siec-danych-izolacja.sh');
    const pierwszyCompose = kod.search(/\n\s*(REGISTRY_PREFIX=\S+ IMAGE_TAG=\S+ )?compose (pull|run|up)/);
    expect(straznik).toBeGreaterThan(0);
    expect(straznik).toBeLessThan(pierwszyCompose);
  });

  it('migracja www dostaje obie sieci (baza + rejestr npm)', () => {
    const kod = bezKomentarzy(czytaj('ops/scripts/prod-migrate-www.sh'));
    expect(kod).toMatch(/docker network connect "\$PUB" "\$CID"/);
    expect(kod).toMatch(/docker start -a "\$CID"/);
    expect(kod).not.toMatch(/docker run --rm/);
  });

  it('skrypt przejścia tylko restartuje kontenery: bez down, bez odtwarzania', () => {
    const kod = bezKomentarzy(czytaj('ops/scripts/prod-siec-danych-izolacja.sh'));
    expect(kod).not.toMatch(/compose down|docker compose[^\n]* down/);
    for (const up of kod.match(/compose up [^\n]*/g) ?? []) expect(up).toMatch(/--no-recreate/);
    expect(kod).toMatch(/podepnij_z_powrotem/);
  });
});
