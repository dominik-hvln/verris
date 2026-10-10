import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * F3.2 — prawdziwy ops/scripts/node-waf-hits.sh (zadanie WAF_HITS) na próbce dziennika audytu ModSecurity v2 (format
 * Serial i JSON wg apache2/msc_logging.c): tylko domeny konta (z subdomenami), najnowsze najpierw, bez query string,
 * nagłówków i ciasteczek, reguła konkretna zamiast zbiorczej 949110, zablokowane vs wykryte, nieznany format = błąd.
 */
const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-waf-hits.sh');

const wpis = (g: string, o: { czas: string; ip: string; linia: string; host: string; status: string; wiad: string[]; blok: boolean }) =>
  [
    `--${g}-A--`,
    `[${o.czas}] YxAbCdEfGh ${o.ip} 51234 10.0.0.5 443`,
    `--${g}-B--`,
    o.linia,
    `Host: ${o.host}`,
    'Cookie: wordpress_logged_in_abc=SEKRET-SESJI',
    'User-Agent: sqlmap/1.7',
    '',
    `--${g}-F--`,
    `HTTP/1.1 ${o.status}`,
    'Content-Type: text/html',
    '',
    `--${g}-H--`,
    ...o.wiad.map((w) => `Message: ${w}`),
    ...(o.blok ? ['Action: Intercepted (phase 2)'] : []),
    'Stopwatch: 1760090000000000 1234 (- - -)',
    '',
    `--${g}-Z--`,
    '',
  ].join('\n');

const SQLI = 'Warning. detected SQLi using libinjection. [file "/etc/modsecurity.d/owasp/rules/REQUEST-942-APPLICATION-ATTACK-SQLI.conf"] [line "66"] [id "942100"] [msg "SQL Injection Attack Detected via libinjection"] [severity "CRITICAL"]';
const ZBIORCZA = 'Access denied with code 403 (phase 2). Matched "Operator `Ge\' with parameter `5\'" [id "949110"] [msg "Inbound Anomaly Score Exceeded (Total Score: 5)"]';

const LOG = [
  wpis('a1b2c3d4', { czas: '10/Oct/2026:12:00:00.123456 +0200', ip: '198.51.100.23', linia: "GET /?id=1'+OR+1=1--&token=TAJNE HTTP/1.1", host: 'www.klient.pl', status: '403 Forbidden', wiad: [SQLI, ZBIORCZA], blok: true }),
  wpis('e5f6a7b8', { czas: '10/Oct/2026:12:05:00.000001 +0200', ip: '203.0.113.9', linia: 'POST /wp-login.php HTTP/1.1', host: 'obcy.pl', status: '403 Forbidden', wiad: [ZBIORCZA], blok: true }),
  wpis('c9d0e1f2', { czas: '10/Oct/2026:12:10:00.000001 +0200', ip: '2001:db8::7', linia: 'GET /sklep/xmlrpc.php HTTP/1.1', host: 'sklep.klient.pl:443', status: '200 OK', wiad: ['Warning. Pattern match [id "930120"] [msg "OS File Access Attempt"]'], blok: false }),
].join('');

function uruchom(log: string, domeny = 'klient.pl,inna-klienta.pl') {
  const dir = mkdtempSync(join(tmpdir(), 'waf-'));
  const plik = join(dir, 'modsec_audit.log');
  writeFileSync(plik, log);
  const r = spawnSync('bash', [SKRYPT], { env: { PATH: process.env.PATH, WH_DOMAINS: domeny, MODSEC_AUDIT_LOG: plik }, encoding: 'utf8' });
  return { rc: r.status, out: r.stdout, err: r.stderr, wiersze: r.stdout.split('\n').filter((l) => l.startsWith('VERRIS_WAF ')) };
}

describe('F3.2 — node-waf-hits.sh (dziennik audytu ModSecurity)', () => {
  it('Serial: tylko domeny konta (z www i subdomenami), najnowsze najpierw, czas w UTC, ścieżka bez query', () => {
    const r = uruchom(LOG);
    expect(r.rc, r.err).toBe(0);
    expect(r.wiersze).toEqual([
      'VERRIS_WAF 2026-10-10T10:10:00Z|klient.pl|2001:db8::7|GET|/sklep/xmlrpc.php|930120|OS File Access Attempt|0|200',
      'VERRIS_WAF 2026-10-10T10:00:00Z|klient.pl|198.51.100.23|GET|/|942100|SQL Injection Attack Detected via libinjection|1|403',
    ]);
    expect(r.out).toMatch(/^VERRIS_WAF_RAZEM 2 2 \d+$/m);
    // Bez query string, ciasteczek i nagłówków.
    expect(r.out).not.toMatch(/TAJNE|SEKRET|sqlmap|OR\+1=1/);
  });

  it('JSON (SecAuditLogFormat JSON): te same pola', () => {
    const j = JSON.stringify({
      transaction: { time: '10/Oct/2026:12:00:00.123456 +0200', transaction_id: 'x', remote_address: '198.51.100.23', remote_port: 1, local_address: '10.0.0.5', local_port: 443 },
      request: { request_line: 'GET /wp-admin/?a=TAJNE HTTP/1.1', headers: { Host: 'klient.pl', Cookie: 'SEKRET' } },
      response: { protocol: 'HTTP/1.1', status: 403 },
      audit_data: { messages: [SQLI], action: { intercepted: true, phase: 2 } },
    });
    const r = uruchom(`${j}\n`);
    expect(r.rc, r.err).toBe(0);
    expect(r.wiersze).toEqual(['VERRIS_WAF 2026-10-10T10:00:00Z|klient.pl|198.51.100.23|GET|/wp-admin/|942100|SQL Injection Attack Detected via libinjection|1|403']);
    expect(r.out).not.toMatch(/TAJNE|SEKRET/);
  });

  it('pusty dziennik → zero trafień (nie błąd); nieznany format → błąd zadania', () => {
    expect(uruchom('').out).toContain('VERRIS_WAF_RAZEM 0 0 0');
    const r = uruchom('[Sat Oct 10 12:00:00 2026] [error] cos zupelnie innego\n');
    expect(r.rc).not.toBe(0);
    expect(r.err).toContain('[waf-hits] BŁĄD: nieznany format dziennika WAF');
  });

  it('brak pliku → błąd zadania; zła lista domen → odmowa przed czytaniem', () => {
    const r = spawnSync('bash', [SKRYPT], { env: { PATH: process.env.PATH, WH_DOMAINS: 'klient.pl', MODSEC_AUDIT_LOG: '/nie/ma/takiego' }, encoding: 'utf8' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('brak dziennika WAF');
    for (const d of ['klient.pl;id', '$(id)', '../etc', '']) {
      expect({ d, rc: uruchom(LOG, d).rc === 0 }).toEqual({ d, rc: false });
    }
  });
});
