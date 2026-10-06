import { spawnSync } from 'child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * ops/scripts/prod-ustaw-klucze.sh — właściciel wpisuje klucze integracji do .env.prod.
 * 06.10: HETZNER_API_TOKEN nie był przekazywany do kontenera API (docker-compose.prod.yml ma jawną listę
 * zmiennych), więc VPS był nieczynny mimo tokenu w .env.prod; a AI_TYLKO_KONTA nie dało się wyczyścić,
 * bo puste pole znaczy „bez zmian”.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const SKRYPT = join(KORZEN, 'ops', 'scripts', 'prod-ustaw-klucze.sh');

function kluczeSkryptu(): string[] {
  return [...readFileSync(SKRYPT, 'utf8').matchAll(/^\s+"([A-Z0-9_]+)\|[sj]\|/gm)].map((m) => m[1]);
}

it('każdy klucz ze skryptu trafia do kontenera API (docker-compose.prod.yml)', () => {
  const compose = readFileSync(join(KORZEN, 'docker-compose.prod.yml'), 'utf8');
  const klucze = kluczeSkryptu();
  expect(klucze).toEqual(expect.arrayContaining(['AI_TYLKO_KONTA', 'HETZNER_API_TOKEN']));
  expect(klucze.filter((k) => !new RegExp(`^\\s+${k}: \\$\\{${k}`, 'm').test(compose))).toEqual([]);
});

it('„-” czyści wartość, Enter zostawia bez zmian', () => {
  const k = mkdtempSync(join(tmpdir(), 'klucze-'));
  mkdirSync(join(k, 'ops', 'scripts'), { recursive: true });
  mkdirSync(join(k, 'bin'));
  copyFileSync(SKRYPT, join(k, 'ops', 'scripts', 'prod-ustaw-klucze.sh'));
  writeFileSync(join(k, 'ops', 'scripts', 'prod-env-backup.sh'), 'exit 0\n');
  writeFileSync(join(k, '.env.prod'), "AI_API_KEY='sk-stary'\nAI_TYLKO_KONTA='a@b.pl'\nAI_EMBED_DISABLED='true'\n");
  for (const [n, t] of [['id', 'echo 0'], ['docker', 'case "$1" in inspect) echo ghcr.io/x/verris-api:abc ;; esac; exit 0']] as const) {
    writeFileSync(join(k, 'bin', n), `#!/usr/bin/env bash\n${t}\n`);
    chmodSync(join(k, 'bin', n), 0o755);
  }
  // Wejście: AI_API_KEY Enter, ANTHROPIC Enter, AI_TYLKO_KONTA „-”, AI_EMBED_DISABLED „false”.
  const r = spawnSync('bash', [join(k, 'ops', 'scripts', 'prod-ustaw-klucze.sh'), 'ai'], {
    input: '\n\n-\nfalse\n',
    encoding: 'utf8',
    env: { PATH: `${join(k, 'bin')}:${process.env.PATH}` },
  });
  expect(r.status).toBe(0);
  const env = readFileSync(join(k, '.env.prod'), 'utf8');
  expect(env).toContain("AI_API_KEY='sk-stary'");
  expect(env).toContain("AI_TYLKO_KONTA=''");
  expect(env).toContain("AI_EMBED_DISABLED='false'");
});
