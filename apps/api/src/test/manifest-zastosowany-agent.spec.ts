import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * 13.10 — kolumna „Manifest stosu” była zgodna minutę po zapisie manifestu, zanim fala cokolwiek zastosowała:
 * agent raportował wersję z /etc/verris-stack.env, który pobiera co minutę. Teraz raportuje wersję ZASTOSOWANĄ
 * (/etc/verris-stack.applied — zapisuje bootstrap i udane wyrównanie); bez pliku manifest nie jest raportowany.
 * Python agenta (heredoc verris-lve.sh) uruchomiony naprawdę, ścieżki podmienione na katalog testu.
 */
const SKRYPT = readFileSync(join(import.meta.dirname, '../../../../ops/scripts/verris-lve.sh'), 'utf8');
const PYTHON = (() => {
  const m = /python3 - <<'PYEOF'\n([\s\S]*?)\nPYEOF/.exec(SKRYPT);
  if (!m) throw new Error('brak heredoca PYEOF w verris-lve.sh');
  return m[1].replace(/\nmain\(\)\s*$/, '\n');
})();

function raport(pliki: { env?: string; applied?: string }): string | null {
  const kat = mkdtempSync(join(tmpdir(), 'verris-manifest-'));
  if (pliki.env !== undefined) writeFileSync(join(kat, 'verris-stack.env'), pliki.env);
  if (pliki.applied !== undefined) writeFileSync(join(kat, 'verris-stack.applied'), pliki.applied);
  const kod = `${PYTHON.replaceAll('/etc/verris-stack.env', join(kat, 'verris-stack.env')).replaceAll('/etc/verris-stack.applied', join(kat, 'verris-stack.applied'))}
import json as _j
print("WYNIK=" + _j.dumps(stack_versions().get("stackVersion")))
`;
  const out = execFileSync('python3', ['-I', '-c', kod], {
    env: { PATH: process.env.PATH ?? '', VERRIS_API_URL: 'http://127.0.0.1:9', VERRIS_SERVER_ID: 's', VERRIS_IDENTITY_TOKEN: 't', LOG: join(kat, 'log') },
    encoding: 'utf8',
  });
  return JSON.parse(out.split('\n').find((l) => l.startsWith('WYNIK='))!.slice('WYNIK='.length)) as string | null;
}

describe('Agent verris-lve — raportowany manifest stosu', () => {
  it('pobrany nowszy manifest, zastosowany starszy → raport starszego (różnica widoczna w panelu)', () => {
    expect(raport({ env: "VERRIS_STACK_VERSION='2026-10-13.1'\n", applied: "VERRIS_STACK_VERSION='2026-10-01.1'\n" })).toBe('2026-10-01.1');
  });

  it('tylko pobrany manifest, bez zastosowanego → brak raportu, nie „zgodny”', () => {
    expect(raport({ env: "VERRIS_STACK_VERSION='2026-10-13.1'\n" })).toBeNull();
  });
});
