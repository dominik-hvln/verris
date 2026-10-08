import { execFileSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

/**
 * Z-09 / t1 (08.10, migracja z Pleska, zadanie b6d22fe0): lftp --verbose dla WordPressa daje log > 128 KiB.
 * fail_job/complete_job wkładały do 200 KB logu jako JEDEN argument jq (--argjson) i curl (--data) —
 * Linux odrzuca pojedynczy argument > 128 KiB (MAX_ARG_STRLEN): „jq: Argument list too long”, pusty body,
 * API 400, a zadanie wisiało w panelu jako „W toku” bez błędu i bez ponowienia.
 */
const WORKER = resolve(import.meta.dirname, '..', '..', '..', '..', 'ops/scripts/node-migration-worker.sh');

function uruchom(funkcja: 'fail' | 'complete', bajtyLogu: number) {
  const zrodlo = readFileSync(WORKER, 'utf8');
  const od = zrodlo.indexOf('api() {');
  const do_ = zrodlo.indexOf('post_progress() {');
  expect(od).toBeGreaterThan(-1);
  expect(do_).toBeGreaterThan(od);

  const kat = mkdtempSync(join(tmpdir(), 'verris-raport-'));
  // Prawdziwy plik wykonywalny (nie funkcja bash) — tylko wtedy obowiązuje limit argumentu execve.
  writeFileSync(join(kat, 'curl'), `#!/bin/bash\ncat > "${kat}/body"\nprintf '%s\\n' "$@" > "${kat}/args"\n`);
  chmodSync(join(kat, 'curl'), 0o755);
  const linia = 'Transferring file `wp-includes/js/dist/block-editor.min.js\'\n';
  writeFileSync(join(kat, 'job.log'), linia.repeat(Math.ceil(bajtyLogu / linia.length)));

  const wywolanie =
    funkcja === 'fail'
      ? `fail_job job-1 "files transfer failed (rc=3)" "${kat}/job.log" true`
      : `complete_job job-1 1000 10 0 0 "${kat}/job.log"`;
  const skrypt = `set -u\nlog() { :; }\nVERRIS_SERVER_ID=s; VERRIS_IDENTITY_TOKEN=t; VERRIS_API_URL=http://api\n${zrodlo.slice(od, do_)}\n${wywolanie}\n`;
  writeFileSync(join(kat, 't.sh'), skrypt);
  const stderr = (() => {
    try {
      execFileSync('bash', [join(kat, 't.sh')], { stdio: 'pipe', env: { ...process.env, PATH: `${kat}:${process.env.PATH}` } });
      return '';
    } catch (e) {
      return String((e as { stderr?: Buffer }).stderr ?? e);
    }
  })();
  const body = readFileSync(join(kat, 'body'), 'utf8');
  const args = readFileSync(join(kat, 'args'), 'utf8');
  return { stderr, body, args };
}

describe('worker migracji — raport do API przy dużym logu', () => {
  it('fail_job z logiem 200 KB wysyła poprawny JSON z błędem i końcówką logu', () => {
    const { stderr, body } = uruchom('fail', 300_000);
    expect(stderr).not.toMatch(/Argument list too long/);
    const json = JSON.parse(body);
    expect(json).toMatchObject({ error: 'files transfer failed (rc=3)', retryable: true });
    expect(json.log.length).toBeGreaterThan(190_000);
    expect(json.log.length).toBeLessThanOrEqual(200_000);
  });

  it('complete_job z logiem 200 KB wysyła poprawny JSON', () => {
    const { stderr, body } = uruchom('complete', 300_000);
    expect(stderr).not.toMatch(/Argument list too long/);
    expect(JSON.parse(body)).toMatchObject({ bytesTransferred: 1000, filesTransferred: 10 });
  });

  it('body idzie do curl przez stdin, nie jako argument', () => {
    const { args } = uruchom('fail', 1000);
    expect(args).toContain('@-');
    expect(args).not.toContain('files transfer failed');
  });
});
