import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * PB-38 (następca X-23 „wyciszenia Dependabota mają termin”) — świadome wstrzymania podniesień.
 *
 * Dependabot nie obsługuje pnpm 11+, więc reguły `ignore` przeniosły się do
 * ops/ci/wersje-wstrzymane.json, czytanego przez tygodniowy raport wersji. Zasada bez zmian:
 * wstrzymanie bez właściciela albo bez terminu to alarm wyłączony na zawsze.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
type Wstrzymanie = { pakiet: string; poziom: string; pozycja: string; przeglad: string; powod: string };
const { wstrzymane } = JSON.parse(readFileSync(join(KORZEN, 'ops/ci/wersje-wstrzymane.json'), 'utf8')) as {
  wstrzymane: Wstrzymanie[];
};

describe('PB-38 — wstrzymane podniesienia mają właściciela i termin', () => {
  it('strażnik ma czego pilnować', () => {
    expect(wstrzymane.map((w) => w.pakiet)).toEqual(expect.arrayContaining(['prisma', 'typescript', 'graphql']));
  });

  it('każde wstrzymanie ma poziom, pozycję, datę przeglądu i powód', () => {
    const braki = wstrzymane.filter(
      (w) => !['major', 'minor', 'patch'].includes(w.poziom) || !/^[A-Z]+-\d+$/.test(w.pozycja) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(w.przeglad) || w.powod.trim().length < 20,
    );
    expect(braki).toEqual([]);
  });

  it('żaden termin przeglądu nie minął', () => {
    const dzis = new Date();
    const po = wstrzymane.filter((w) => new Date(w.przeglad) < dzis).map((w) => `${w.pakiet} (${w.pozycja}) — ${w.przeglad}`);
    expect(po.length === 0 ? '' : `Termin przeglądu minął — przedłuż świadomie albo usuń:\n${po.join('\n')}`).toBe('');
  });

  it('każda pozycja istnieje w macierzy audytu albo w planie (zadania PB)', () => {
    const macierz = readFileSync(join(KORZEN, 'audyt', 'dane', 'macierz.csv'), 'utf8');
    const pb = readFileSync(join(KORZEN, 'audyt', 'dane', 'zadania_pb.csv'), 'utf8');
    for (const w of wstrzymane) expect(`${macierz}\n${pb}`).toContain(`\n${w.pozycja},`);
  });

  it('Dependabot nie ma już ekosystemu npm (nie obsługuje pnpm 11+ — raport go zastępuje)', () => {
    const dependabot = readFileSync(join(KORZEN, '.github', 'dependabot.yml'), 'utf8');
    expect(dependabot).not.toMatch(/package-ecosystem:\s*npm/);
    expect(dependabot).toMatch(/package-ecosystem:\s*docker-compose/);
  });
});
