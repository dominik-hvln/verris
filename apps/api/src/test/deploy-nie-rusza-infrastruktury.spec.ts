import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PB-38 — deploy aplikacji nie odtwarza infrastruktury.
 *
 * Od Postgresa 18 baza leży w NOWYM wolumenie. Gdyby `compose up api` odtworzył zależność
 * `postgres` (bo zmieniła się jej definicja), aplikacja wstałaby na pustej bazie — klienci
 * zobaczyliby puste konta. Infrastrukturę zmienia wyłącznie ops/scripts/prod-infra-upgrade.sh
 * (z kopią, porównaniem wierszy i automatycznym powrotem na Postgres 16).
 */
const KORZEN = resolve(import.meta.dirname, '../../../..');
const bezKomentarzy = (t: string) => t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
const deploy = bezKomentarzy(readFileSync(resolve(KORZEN, 'ops/scripts/prod-deploy-ghcr.sh'), 'utf-8'));
const compose = readFileSync(resolve(KORZEN, 'docker-compose.prod.yml'), 'utf-8');

describe('PB-38 — deploy nie rusza infrastruktury', () => {
  it('każde `compose up` w deployu ma --no-deps', () => {
    const upy = deploy.split('\n').filter((l) => /compose up\b/.test(l));
    expect(upy.length).toBeGreaterThanOrEqual(4); // strażnik strażnika: wzorzec coś łapie
    expect(upy.filter((l) => !l.includes('--no-deps'))).toEqual([]);
  });

  it('Postgres 18 ma wolumen pod /var/lib/postgresql (obraz 18 odmawia startu z …/data)', () => {
    const blok = compose.slice(compose.indexOf('\n  postgres:\n'), compose.indexOf('\n  redis:\n'));
    const major = /image: postgres:(\d+)/.exec(blok)?.[1];
    expect(Number(major)).toBeGreaterThanOrEqual(18);
    expect(blok).toMatch(/- postgres_data_18:\/var\/lib\/postgresql\n/);
    expect(blok).not.toMatch(/\/var\/lib\/postgresql\/data/);
  });

  it('powrót na Postgres 16 celuje w stary, nietknięty wolumen', () => {
    const pg16 = readFileSync(resolve(KORZEN, 'docker-compose.pg16.yml'), 'utf-8');
    expect(pg16).toMatch(/image: postgres:16-alpine/);
    expect(pg16).toMatch(/volumes: !override\n\s+- postgres_data:\/var\/lib\/postgresql\/data/);
  });
});
