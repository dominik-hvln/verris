import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * E2e 14.10 (migracja 1e4768ef, źródło „FTPS”, port 21): krok plików padał 3/3 z
 * „mirror: Fatal error: gnutls_handshake: An unexpected TLS packet was received”, choć test dostępów przeszedł.
 * Worker dawał lftp adres `ftps://host:21` — w lftp to FTPS NIEJAWNY (TLS od pierwszego bajtu, port 990),
 * a „FTPS” w Verris (preflight, formularze) to AUTH TLS na zwykłym porcie. Explicit = `ftp://` + ftp:ssl-force.
 * https://lftp.yar.ru/lftp-man.html
 */
const WORKER = resolve(import.meta.dirname, '..', '..', '..', '..', 'ops/scripts/node-migration-worker.sh');
const zrodlo = readFileSync(WORKER, 'utf8');

function url(proto: string, host = '203.0.113.7', port = '21') {
  const od = zrodlo.indexOf('lftp_url() {');
  expect(od).toBeGreaterThan(-1);
  const fn = zrodlo.slice(od, zrodlo.indexOf('\n}\n', od) + 3);
  return execFileSync('bash', ['-c', `${fn}\nlftp_url "$1" "$2" "$3"`, '_', proto, host, port]).toString();
}

describe('worker migracji — FTPS explicit (AUTH TLS) w lftp', () => {
  it('ftps → ftp:// (TLS wymusza ftp:ssl-force), ftp → ftp://, sftp → sftp://', () => {
    expect(url('ftps')).toBe('ftp://203.0.113.7:21');
    expect(url('ftp')).toBe('ftp://203.0.113.7:21');
    expect(url('sftp', '[2001:db8::1]', '22')).toBe('sftp://[2001:db8::1]:22');
  });

  it('oba wywołania lftp (kopia plików, wgranie eksportu bazy) biorą adres z lftp_url, a ftps wymusza TLS', () => {
    const wywolania = [...zrodlo.matchAll(/lftp --env-password[\s\S]*?<\/dev\/null/g)].map((m) => m[0]);
    expect(wywolania).toHaveLength(2);
    for (const w of wywolania) {
      expect(w).toContain('$(lftp_url "$proto"');
      expect(w).not.toMatch(/\$\{proto\}:\/\//);
    }
    expect(zrodlo.match(/\[ "\$proto" = "ftps" \] && ssl_setting="set ftp:ssl-force true; set ftp:ssl-protect-data true;"/g)).toHaveLength(2);
  });
});
