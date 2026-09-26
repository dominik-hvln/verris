import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tajność projektu — narzędzia nie wysyłają nic na zewnątrz. Next.js (telemetry.nextjs.org),
 * Turborepo (telemetry.vercel.com) i Prisma (checkpoint) domyślnie raportują użycie; wyłączamy je
 * w każdym workflow CI i w obu obrazach (build i działanie). Nowy workflow bez tych zmiennych = czerwony test.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const ZMIENNE = ['NEXT_TELEMETRY_DISABLED', 'TURBO_TELEMETRY_DISABLED', 'DO_NOT_TRACK', 'CHECKPOINT_DISABLE'];

describe('bez telemetrii narzędzi', () => {
  const katalog = join(KORZEN, '.github', 'workflows');
  it.each(readdirSync(katalog).filter((f) => f.endsWith('.yml')))('workflow %s wyłącza telemetrię dla wszystkich jobów', (plik) => {
    const tresc = readFileSync(join(katalog, plik), 'utf8');
    const globalne = /^env:\n((?: {2}.*\n|\n)+)/m.exec(tresc)?.[1] ?? '';
    for (const z of ZMIENNE) expect(globalne).toMatch(new RegExp(`^ {2}${z}: "1"$`, 'm'));
  });

  it.each(['Dockerfile.api', 'Dockerfile.panel'])('%s wyłącza telemetrię przy buildzie', (plik) => {
    const tresc = readFileSync(join(KORZEN, plik), 'utf8');
    const baza = tresc.slice(tresc.indexOf('AS base'), tresc.indexOf('AS deps'));
    for (const z of ZMIENNE) expect(baza).toContain(`${z}=1`);
  });
});
