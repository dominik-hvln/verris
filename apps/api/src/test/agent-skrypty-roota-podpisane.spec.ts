import { execFileSync } from 'child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { renderBootstrapNodeTasksInstallFragment, renderNodeTasksAgentInstallScript } from '../servers/node-tasks-agent.install.js';

/**
 * Audyt 13.10 (do potwierdzenia #6, node-tasks-agent.install.ts:unsigned-lve-and-straznik-script-install):
 * verris-lve.sh i verris-straznik.sh (usługi roota co minutę) instalator pobierał gołym curl, z pominięciem
 * podpisu control-plane (PB-36). Teraz idą przez verris-fetch: niepodpisana odpowiedź = brak pliku.
 */
const SKRYPTY = [
  ['instalacja agenta z panelu', renderNodeTasksAgentInstallScript()],
  ['bootstrap węzła', renderBootstrapNodeTasksInstallFragment()],
] as const;

function fragment(skrypt: string, od: string, doZnacznika: string): string {
  const a = skrypt.indexOf(od);
  const b = skrypt.indexOf(doZnacznika, a);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return skrypt.slice(a, b);
}

describe('instalator: skrypty roota tylko z podpisem control-plane', () => {
  it.each(SKRYPTY)('%s: żaden curl nie pobiera skryptu z /agent/tasks/*/script', (_n, skrypt) => {
    const curlDoZadan = skrypt.replace(/\\\n/g, ' ').split('\n').filter(
      // POST wyników zadań i sonda lease nic nie zapisują do wykonania — liczy się pobranie skryptu do pliku.
      (l) => /\bcurl\b/.test(l) && /\/agent\/tasks\/[a-z-]+\/script/.test(l),
    );
    expect(curlDoZadan).toEqual([]);
  });

  it.each([
    ['verris-lve.sh', '# --- Verris LVE agent', '/usr/local/bin/verris-lve.sh'],
    ['verris-straznik.sh', '# --- Verris strażnik węzła', '/usr/local/bin/verris-straznik.sh'],
  ])('%s: podpis nieprawidłowy (verris-fetch → 3) → plik nie powstaje, poprzednia wersja zostaje', (_n, od, sciezka) => {
    const dir = mkdtempSync(join(tmpdir(), 'podpis-roota-'));
    const bin = join(dir, 'bin');
    execFileSync('mkdir', ['-p', bin]);
    // Atrapa verris-fetch: zapisuje treść niepodpisaną, ale kończy się kodem 3 jak przy złym podpisie
    // (prawdziwy verris-fetch nie zapisuje wtedy nic — tu sprawdzamy, że instalator i tak nie użyje pliku).
    writeFileSync(join(bin, 'verris-fetch'), '#!/usr/bin/env bash\nexit 3\n');
    chmodSync(join(bin, 'verris-fetch'), 0o755);
    // Atrapa curl: serwer (albo ktoś na drodze) odpowiada treścią bez podpisu — gołe curl ją zapisze.
    writeFileSync(join(bin, 'curl'), '#!/usr/bin/env bash\nwhile [ $# -gt 0 ]; do [ "$1" = -o ] && { printf "BEZ_PODPISU\\n" > "$2"; shift; }; shift; done\n');
    chmodSync(join(bin, 'curl'), 0o755);
    const cel = join(dir, 'skrypt.sh');
    writeFileSync(cel, 'POPRZEDNIA\n');
    const kawalek = fragment(renderNodeTasksAgentInstallScript(), od, 'if command -v systemctl')
      .replace('source /etc/verris.conf', ':')
      .split(sciezka).join(cel);
    execFileSync('bash', ['-c', kawalek], { env: { PATH: `${bin}:/usr/bin:/bin` }, stdio: 'pipe' });
    expect(readFileSync(cel, 'utf8')).toBe('POPRZEDNIA\n');
    expect(existsSync(`${cel}.tmp`)).toBe(false);
  });

  it('podpis poprawny (verris-fetch → 0) → nowy plik wykonywalny', () => {
    const dir = mkdtempSync(join(tmpdir(), 'podpis-roota-'));
    const bin = join(dir, 'bin');
    execFileSync('mkdir', ['-p', bin]);
    writeFileSync(join(bin, 'verris-fetch'), '#!/usr/bin/env bash\nprintf "NOWA\\n" > "$2"\n');
    chmodSync(join(bin, 'verris-fetch'), 0o755);
    const cel = join(dir, 'lve.sh');
    const kawalek = fragment(renderNodeTasksAgentInstallScript(), '# --- Verris LVE agent', 'if command -v systemctl')
      .replace('source /etc/verris.conf', ':')
      .split('/usr/local/bin/verris-lve.sh').join(cel);
    execFileSync('bash', ['-c', kawalek], { env: { PATH: `${bin}:/usr/bin:/bin` }, stdio: 'pipe' });
    expect(readFileSync(cel, 'utf8')).toBe('NOWA\n');
  });
});
