import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Skrypty ops pytają bazę wprost (psql), więc literał statusu węzła w SQL nie przechodzi przez Prismę.
 * 08.10: `verris-node.sh` filtrował `status <> 'DELETED'` — takiej wartości enum ServerStatus nie ma,
 * Postgres odrzucał zapytanie i `list`/`ssh`/`exec` kończyły się „brak węzłów w bazie” na każdym węźle.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const czytaj = (p: string) => readFileSync(join(KORZEN, p), 'utf8');

const statusyWezla = (() => {
  const blok = czytaj('libs/database/prisma/schema.prisma').match(/^enum ServerStatus \{([\s\S]*?)^\}/m);
  if (!blok) throw new Error('brak enum ServerStatus w schema.prisma');
  return new Set(
    blok[1]
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, '').trim())
      .filter(Boolean),
  );
})();

const skrypty = readdirSync(join(KORZEN, 'ops/scripts'))
  .filter((f) => f.endsWith('.sh'))
  .map((f) => `ops/scripts/${f}`);

describe('skrypty ops — statusy węzła w SQL', () => {
  it('enum ServerStatus wczytany', () => {
    expect(statusyWezla.has('ACTIVE')).toBe(true);
  });

  it('każdy literał statusu przy tabeli "Server" istnieje w enumie', () => {
    const zle: string[] = [];
    for (const plik of skrypty) {
      const tekst = czytaj(plik);
      if (!/\\?"Server\\?"/.test(tekst)) continue; // w bashu często jako \"Server\"
      for (const m of tekst.matchAll(/\bstatus\s*(?:<>|!=|=|IN\s*\()\s*((?:'[A-Z_]+'\s*,?\s*)+)/gi)) {
        for (const lit of m[1].matchAll(/'([A-Z_]+)'/g)) {
          if (!statusyWezla.has(lit[1])) zle.push(`${plik}: ${lit[1]}`);
        }
      }
    }
    expect(zle).toEqual([]);
  });

  it('verris-node.sh: błąd zapytania do bazy nie udaje pustej floty', () => {
    expect(czytaj('ops/scripts/verris-node.sh')).toMatch(/rows="\$\(all_nodes\)" \|\| die /);
  });
});
