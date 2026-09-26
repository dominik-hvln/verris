import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const KORZEN = resolve(import.meta.dirname, '../../../..');

/**
 * DEP-02 — w drzewie jest jeden major ESLinta.
 *
 * Do 2026-09-23 korzeń deklarował `@eslint/js ^10` i `typescript-eslint` bez żadnego
 * eslint.config.* w korzeniu, a peer `eslint >=9` w libs/eslint-config dociągał
 * eslint 10 obok 9 używanego przez aplikacje. Bramka była zielona, ale nic nie
 * pilnowało, że wersja jest jedna — to ten sam brak kontroli co przy wersji Node
 * (ENV-01). Ten strażnik czyta deklaracje wszystkich paczek i lockfile.
 */
const MAJOR = 10;
const PAKIETY = ['eslint', '@eslint/js'];

function manifesty(): Array<{ plik: string; json: Record<string, Record<string, string>> }> {
  const out = [{ plik: 'package.json', json: JSON.parse(readFileSync(resolve(KORZEN, 'package.json'), 'utf-8')) }];
  for (const grupa of ['apps', 'libs']) {
    for (const nazwa of readdirSync(resolve(KORZEN, grupa))) {
      const plik = resolve(KORZEN, grupa, nazwa, 'package.json');
      if (existsSync(plik)) out.push({ plik: `${grupa}/${nazwa}/package.json`, json: JSON.parse(readFileSync(plik, 'utf-8')) });
    }
  }
  return out;
}

const majorZeSpecyfikacji = (spec: string) => Number(/(\d+)/.exec(spec)?.[1] ?? NaN);

describe('DEP-02 — jeden major ESLinta', () => {
  it(`każda deklaracja eslint / @eslint/js wskazuje major ${MAJOR}`, () => {
    const zle: string[] = [];
    for (const { plik, json } of manifesty()) {
      for (const sekcja of ['dependencies', 'devDependencies', 'peerDependencies']) {
        for (const p of PAKIETY) {
          const spec = json[sekcja]?.[p];
          if (spec && majorZeSpecyfikacji(spec) !== MAJOR) zle.push(`${plik} ${sekcja}.${p}=${spec}`);
        }
      }
    }
    expect(zle).toEqual([]);
  });

  it('peer eslint nie jest otwarty w górę (">=9" dociąga kolejny major przez auto-install-peers)', () => {
    const otwarte = manifesty()
      .filter(({ json }) => /^>=/.test(json.peerDependencies?.eslint ?? ''))
      .map(({ plik }) => plik);
    expect(otwarte).toEqual([]);
  });

  it(`lockfile nie zawiera eslint ani @eslint/js w innym majorze niż ${MAJOR}`, () => {
    const lock = readFileSync(resolve(KORZEN, 'pnpm-lock.yaml'), 'utf-8');
    const wersje = new Set<string>();
    for (const m of lock.matchAll(/^ {2}'?(@eslint\/js|eslint)@(\d+)\.\d+\.\d+/gm)) wersje.add(`${m[1]}@${m[2]}`);
    expect([...wersje].filter((w) => !w.endsWith(`@${MAJOR}`))).toEqual([]);
    expect(wersje.size).toBeGreaterThan(0);
  });
});
