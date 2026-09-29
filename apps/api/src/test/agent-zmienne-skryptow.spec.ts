import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Każda zmienna, której skrypt węzła WYMAGA (${PFX_NAZWA} bez wartości domyślnej), musi być przekazywana
 * przez agenta zadań (payload_env w node-tasks-agent.install.ts i ops/scripts/verris-task-run.sh).
 * Test D3 29.09 (D-08): „Tylko odczyt” dla użytkownika bazy kończył się na węźle „DBT_USER: parameter
 * null or not set” — agent nie mapował pól `user` i `privs` zadania DB_TRANSFER, a panel pokazywał
 * „zmiana w toku”.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const SKRYPTY = join(ROOT, 'ops', 'scripts');

function mapowania(tekst: string): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const [, pfx, cialo] of tekst.matchAll(/payload_env "(\w+)" "\{([^}]*)\}"/g)) {
    const s = m.get(pfx) ?? new Set<string>();
    for (const [, nazwa] of cialo.matchAll(/'[^']*':'([A-Z0-9_]+)'/g)) s.add(nazwa);
    m.set(pfx, s);
  }
  return m;
}

describe('agent zadań przekazuje wszystkie wymagane zmienne skryptów węzła', () => {
  const agentTs = mapowania(readFileSync(join(ROOT, 'apps', 'api', 'src', 'servers', 'node-tasks-agent.install.ts'), 'utf8'));
  const agentSh = mapowania(readFileSync(join(SKRYPTY, 'verris-task-run.sh'), 'utf8'));

  it('obie kopie agenta mapują to samo', () => {
    const plaskie = (m: Map<string, Set<string>>) => [...m].map(([p, s]) => `${p}:${[...s].sort().join(',')}`).sort();
    expect(plaskie(agentSh)).toEqual(plaskie(agentTs));
  });

  it('żaden skrypt nie wymaga zmiennej, której agent nie przekazuje', () => {
    const braki: string[] = [];
    for (const plik of readdirSync(SKRYPTY).filter((f) => f.endsWith('.sh'))) {
      const s = readFileSync(join(SKRYPTY, plik), 'utf8');
      for (const [pfx, zmapowane] of agentTs) {
        const uzyte = new Set([...s.matchAll(new RegExp(`\\$\\{?${pfx}_([A-Z0-9_]+)`, 'g'))].map((x) => x[1]));
        if (!uzyte.size) continue;
        const przypisane = new Set([...s.matchAll(new RegExp(`(?:^|\\s|local\\s+|export\\s+)${pfx}_([A-Z0-9_]+)=`, 'gm'))].map((x) => x[1]));
        const zDomyslna = new Set([...s.matchAll(new RegExp(`\\$\\{${pfx}_([A-Z0-9_]+):?-`, 'g'))].map((x) => x[1]));
        for (const n of uzyte) if (!zmapowane.has(n) && !przypisane.has(n) && !zDomyslna.has(n)) braki.push(`${plik}: ${pfx}_${n}`);
      }
    }
    expect(braki).toEqual([]);
  });
});
