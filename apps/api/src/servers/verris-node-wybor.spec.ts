import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** 17.10 (PB-31): po reinstalacji ta sama nazwa węzła jest przy wycofanym rekordzie i przy nowym — verris-node.sh brał pierwszy. */
const SKRYPT = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'verris-node.sh'), 'utf8');
const FUNKCJA = /\nresolve_node\(\) \{[\s\S]*?\n\}\n/.exec(SKRYPT)![0];

it('dokładna nazwa → węzeł niewycofany, nawet gdy wycofany jest pierwszy w tabeli', () => {
  const wiersze = ['TEST-02\teb9a\twycofany-eb9a\tDEPROVISIONING\tde', 'TEST-02\tf00d\t62.171.162.57\tPENDING_APPROVAL\tde'].join('\n');
  const plik = join(mkdtempSync(join(tmpdir(), 'verris-node-')), 'wezly.tsv');
  writeFileSync(plik, `${wiersze}\n`);
  const r = spawnSync('bash', ['-c', `die() { echo "DIE $*"; exit 1; }\nall_nodes() { cat '${plik}'; }\n${FUNKCJA}\nresolve_node TEST-02`], {
    encoding: 'utf8',
  });
  expect(r.stdout).toContain('62.171.162.57');
});
