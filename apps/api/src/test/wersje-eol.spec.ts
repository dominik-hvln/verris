import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * PB-38 fala 4 — strażnik końca wsparcia.
 *
 * Każde środowisko, które deklarujemy (Node z .nvmrc, Postgres z docker-compose.prod.yml, Debian
 * z Dockerfile'i, Alpine z obrazu MinIO), musi mieć wpis w ops/ci/wersje-eol.json (z oficjalnym
 * źródłem) i co najmniej `okno_ostrzezenia_dni` wsparcia przed sobą. Czerwień przychodzi na kilka
 * miesięcy przed końcem — podniesienie jest wtedy planowane, a nie gaszeniem pożaru.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const czytaj = (p: string) => readFileSync(join(KORZEN, p), 'utf8');
const eol = JSON.parse(czytaj('ops/ci/wersje-eol.json')) as {
  okno_ostrzezenia_dni: number;
  srodowiska: Record<string, Record<string, { koniec: string; zrodlo: string }>>;
};

const deklarowane: [string, string, string | undefined][] = [
  ['node (.nvmrc)', 'node', czytaj('.nvmrc').trim()],
  ['postgres (docker-compose.prod.yml)', 'postgres', /image: postgres:(\d+)/.exec(czytaj('docker-compose.prod.yml'))?.[1]],
  ['debian (Dockerfile.api)', 'debian', /-(trixie|bookworm|forky)-slim/.exec(czytaj('Dockerfile.api'))?.[1]],
  ['debian (Dockerfile.panel)', 'debian', /-(trixie|bookworm|forky)-slim/.exec(czytaj('Dockerfile.panel'))?.[1]],
  ['alpine (ops/docker/minio)', 'alpine', /alpine:(\d+\.\d+)/.exec(czytaj('ops/docker/minio/Dockerfile'))?.[1]],
];

describe('PB-38 — deklarowane środowiska mają wsparcie przed sobą', () => {
  it.each(deklarowane)('%s', (_opis, klucz, wersja) => {
    expect(wersja).toBeDefined();
    const wpis = eol.srodowiska[klucz]?.[wersja!];
    expect(wpis ? 'jest' : `brak ${klucz} ${wersja} w ops/ci/wersje-eol.json`).toBe('jest');
    expect(wpis!.zrodlo).toMatch(/^https:\/\//);
    const dni = Math.floor((new Date(`${wpis!.koniec}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
    expect(
      dni >= eol.okno_ostrzezenia_dni ? '' : `${klucz} ${wersja}: koniec wsparcia ${wpis!.koniec} (za ${dni} dni) — zaplanuj podniesienie`,
    ).toBe('');
  });
});
