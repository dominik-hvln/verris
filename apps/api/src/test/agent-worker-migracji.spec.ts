import { execFileSync } from 'child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { renderNodeTasksAgentInstallScript } from '../servers/node-tasks-agent.install.js';
import { wczytajSkryptMigracji } from '../servers/skrypty-migracji-wezla.js';
import { NodeTasksAgentController } from '../servers/node-tasks.agent.controller.js';

/**
 * 14.10 — worker migracji trafiał na węzeł tylko przy wdrażaniu węzła (node-onboard-live.sh → --install), więc
 * poprawki workera (paczka 47: sprawdzanie domeny docelowej; 52: strony spoza WordPressa) nie docierały na t1/t2.
 * Instalator agenta — uruchamiany też przez aktualizację floty — pobiera teraz worker i bibliotekę walidacji z API
 * (verris-fetch, podpis control-plane) i podmienia je atomowo; nieudane pobranie zostawia poprzednią parę plików.
 */
const SKRYPTY = resolve(import.meta.dirname, '..', '..', '..', '..', 'ops/scripts');

function fragment(sbin: string) {
  const s = renderNodeTasksAgentInstallScript();
  const od = s.indexOf('# --- Verris worker migracji');
  const do_ = s.indexOf('PROBES=', od);
  expect(od).toBeGreaterThan(-1);
  return s.slice(od, do_).replaceAll('/usr/local/sbin', sbin);
}

function wezel(o: { worker?: boolean; workerZApi?: string; guardZApi?: string | null } = {}) {
  const kat = mkdtempSync(join(tmpdir(), 'verris-agent-mig-'));
  const bin = join(kat, 'bin');
  execFileSync('mkdir', ['-p', bin, join(kat, 'sbin'), join(kat, 'api')]);
  if (o.worker !== false) {
    writeFileSync(join(kat, 'sbin', 'verris-migration-worker'), '#!/bin/bash\necho stary-worker\n');
    chmodSync(join(kat, 'sbin', 'verris-migration-worker'), 0o755);
    writeFileSync(join(kat, 'sbin', 'verris-migration-guard.sh'), '# stary guard\n');
  }
  writeFileSync(join(kat, 'api', 'worker'), o.workerZApi ?? '#!/bin/bash\necho nowy-worker\n');
  if (o.guardZApi !== null) writeFileSync(join(kat, 'api', 'guard'), o.guardZApi ?? '# nowy guard\nvg_is_domain() { :; }\n');
  // verris-fetch ŚCIEŻKA_API PLIK TIMEOUT — atrapa: kopiuje „odpowiedź API”, brak pliku = błąd (np. zły podpis)
  writeFileSync(join(bin, 'verris-fetch'), `#!/bin/bash\nf="${kat}/api/$(basename "$1")"\n[ -f "$f" ] || exit 1\ncp "$f" "$2"\necho "$1" >> "${kat}/pobrane"\n`);
  chmodSync(join(bin, 'verris-fetch'), 0o755);
  writeFileSync(join(kat, 't.sh'), `set -euo pipefail\n${fragment(join(kat, 'sbin'))}\n`);
  const r = (() => {
    try {
      return { rc: 0, out: execFileSync('bash', [join(kat, 't.sh')], { stdio: 'pipe', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }).toString() };
    } catch (e) {
      return { rc: (e as { status: number }).status, out: '' };
    }
  })();
  const czytaj = (n: string) => readFileSync(join(kat, 'sbin', n), 'utf8');
  return { ...r, kat, czytaj, pobrane: existsSync(join(kat, 'pobrane')) ? readFileSync(join(kat, 'pobrane'), 'utf8') : '' };
}

describe('instalator agenta odświeża worker migracji', () => {
  it('pobiera podpisany worker i bibliotekę walidacji z API i podmienia oba pliki', () => {
    const w = wezel();
    expect(w.rc).toBe(0);
    expect(w.pobrane).toBe('/agent/tasks/migracja/guard\n/agent/tasks/migracja/worker\n');
    expect(w.czytaj('verris-migration-worker')).toContain('nowy-worker');
    expect(w.czytaj('verris-migration-guard.sh')).toContain('nowy guard');
    expect(existsSync(join(w.kat, 'sbin', 'verris-migration-worker.new'))).toBe(false);
  });

  it('nieudane pobranie albo błąd składni — zostaje poprzednia para (bez mieszania wersji), instalator idzie dalej', () => {
    const bezGuarda = wezel({ guardZApi: null });
    expect(bezGuarda.rc).toBe(0);
    expect(bezGuarda.czytaj('verris-migration-worker')).toContain('stary-worker');
    expect(bezGuarda.czytaj('verris-migration-guard.sh')).toContain('stary guard');

    const zepsuty = wezel({ workerZApi: '#!/bin/bash\nif then fi (\n' });
    expect(zepsuty.rc).toBe(0);
    expect(zepsuty.czytaj('verris-migration-worker')).toContain('stary-worker');
    expect(zepsuty.czytaj('verris-migration-guard.sh')).toContain('stary guard');
  });

  it('węzeł bez workera migracji — nic nie instaluje (pełna instalacja to --install z zależnościami)', () => {
    const w = wezel({ worker: false });
    expect(w.rc).toBe(0);
    expect(w.pobrane).toBe('');
    expect(existsSync(join(w.kat, 'sbin', 'verris-migration-worker'))).toBe(false);
  });

  it('API wydaje prawdziwy worker i bibliotekę z repozytorium (obraz API je zawiera)', () => {
    const c = new NodeTasksAgentController({} as never, {} as never, {} as never);
    expect(c.migracjaWorker()).toBe(readFileSync(join(SKRYPTY, 'node-migration-worker.sh'), 'utf8'));
    expect(c.migracjaGuard()).toBe(readFileSync(join(SKRYPTY, 'lib/migration-input-guard.sh'), 'utf8'));
    expect(wczytajSkryptMigracji('worker')).toContain('cms_fixup');
    const docker = readFileSync(resolve(SKRYPTY, '..', '..', 'Dockerfile.api'), 'utf8');
    expect(docker).toContain('COPY ops/scripts/node-migration-worker.sh ./ops/scripts/node-migration-worker.sh');
    expect(docker).toContain('COPY ops/scripts/lib/migration-input-guard.sh ./ops/scripts/lib/migration-input-guard.sh');
  });
});
