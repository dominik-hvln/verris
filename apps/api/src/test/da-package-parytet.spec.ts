import { readFileSync } from 'fs';
import { join } from 'path';
import { packagePolicyForSlug } from '../servers/da-package-spec.js';

/**
 * Pakiety DirectAdmina opisane są w trzech miejscach: API (da-package-spec.ts — tworzy pakiet przy
 * zakładaniu konta, ale NIE poprawia istniejącego) i skrypt naprawczy prod-sync-server-da-packages.sh,
 * który nadpisuje pakiety wszystkich aktywnych planów. Do 2026-09-25 skrypt nie znał sprzedawanego planu
 * `verris-hosting` i zapisałby mu limity „starter” (1 domena, 25 skrzynek) — wbrew ofercie „bez limitu”.
 */
const SKRYPT = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'prod-sync-server-da-packages.sh'), 'utf8');
const literal = (nazwa: string) => {
  const m = new RegExp(`const ${nazwa} = (\\{[\\s\\S]*?\\n\\}|\\{[^\\n]*\\});`).exec(SKRYPT);
  if (!m) throw new Error(`brak ${nazwa} w skrypcie`);
  return new Function(`return (${m[1]});`)() as Record<string, unknown>;
};

describe('parytet pakietów DirectAdmina: API ↔ skrypt naprawczy', () => {
  const wSkrypcie = literal('PACKAGE_POLICY') as Record<string, Record<string, unknown>>;

  it.each(['verris-hosting', 'starter', 'pro', 'business'])('%s — te same limity', (slug) => {
    expect(wSkrypcie[slug]).toEqual(packagePolicyForSlug(slug));
  });

  it('nieznany plan dostaje tę samą ograniczoną politykę co w API', () => {
    expect(literal('DOMYSLNA')).toEqual(packagePolicyForSlug('nieznany-plan'));
  });
});
