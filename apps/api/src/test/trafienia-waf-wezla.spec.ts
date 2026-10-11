import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { regulyZTrafien, trafieniaZLogu } from '../servers/trafienia-waf.js';

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
  it('Serial: tylko domeny konta (z www i subdomenami), od najstarszego (obcięcie zabiera najstarsze), czas w UTC, ścieżka bez query', () => {
    const r = uruchom(LOG);
    expect(r.rc, r.err).toBe(0);
    expect(r.wiersze).toEqual([
      'VERRIS_WAF 2026-10-10T10:00:00Z|klient.pl|198.51.100.23|GET|/|942100|SQL Injection Attack Detected via libinjection|1|403',
      'VERRIS_WAF 2026-10-10T10:10:00Z|klient.pl|2001:db8::7|GET|/sklep/xmlrpc.php|930120|OS File Access Attempt|0|200',
    ]);
    // Panel: najnowsze pierwsze.
    expect(trafieniaZLogu(r.out).map((t) => t.czas)).toEqual(['2026-10-10T10:10:00Z', '2026-10-10T10:00:00Z']);
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

  it('audyt Fali 3: fałszywe sekcje wstrzyknięte w treść żądania (sekcja I) nie tworzą trafienia; wpis bez „-Z--” odrzucony', () => {
    const wstrzykniety = [
      '--aa11bb22-A--',
      '[10/Oct/2026:12:00:00.000001 +0200] Yreal 203.0.113.66 40000 10.0.0.5 443',
      '--aa11bb22-B--',
      'POST /formularz HTTP/1.1',
      'Host: obcy.pl',
      '',
      '--aa11bb22-I--',
      '--deadbeef-A--',
      '[11/Oct/2026:10:00:00 +0200] X 198.51.100.9 1 2 3',
      '--deadbeef-B--',
      'POST /wp-login.php HTTP/1.1',
      'Host: klient.pl',
      '--deadbeef-H--',
      'Message: Warning. [id "941100"] [msg "Falszywa regula"]',
      'Action: Intercepted (phase 2)',
      '--deadbeef-Z--',
      '',
      '--aa11bb22-F--',
      'HTTP/1.1 403 Forbidden',
      '',
      '--aa11bb22-H--',
      `Message: ${ZBIORCZA}`,
      'Action: Intercepted (phase 2)',
      '',
      '--aa11bb22-Z--',
      '',
    ].join('\n');
    const urwany = wpis('c9d0e1f2', { czas: '10/Oct/2026:12:30:00.000001 +0200', ip: '192.0.2.1', linia: 'GET /x HTTP/1.1', host: 'klient.pl', status: '403 Forbidden', wiad: [SQLI], blok: true }).replace(/--c9d0e1f2-Z--\n$/, '');
    const r = uruchom(wstrzykniety + urwany);
    expect(r.rc, r.err).toBe(0);
    expect(r.wiersze).toEqual([]);
    expect(r.out).not.toContain('198.51.100.9');
    // Prawdziwe wpisy obok — dalej rozpoznane.
    expect(uruchom(wstrzykniety + LOG).wiersze).toHaveLength(2);
  });

  it('audyt Fali 3: budżet wyjścia w BAJTACH (agent: tail -c 100000); najnowsze trafienie na końcu, przetrwa obcięcie', () => {
    const wpisy = Array.from({ length: 300 }, (_, i) => {
      const min = String(i % 60).padStart(2, '0');
      const godz = String(10 + Math.floor(i / 60)).padStart(2, '0');
      // Ścieżka z bajtami spoza UTF-8 → U+FFFD (3 bajty) po dekodowaniu na węźle.
      return wpis(`b${String(i).padStart(7, '0')}`, { czas: `10/Oct/2026:${godz}:${min}:00.000001 +0200`, ip: '198.51.100.23', linia: `GET /\xff${'\xfe'.repeat(190)} HTTP/1.1`, host: 'klient.pl', status: '403 Forbidden', wiad: [SQLI], blok: true });
    });
    const dir = mkdtempSync(join(tmpdir(), 'waf-'));
    const plik = join(dir, 'modsec_audit.log');
    writeFileSync(plik, Buffer.from(wpisy.join(''), 'latin1'));
    const r = spawnSync('bash', [SKRYPT], { env: { PATH: process.env.PATH, WH_DOMAINS: 'klient.pl', MODSEC_AUDIT_LOG: plik }, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const wiersze = r.stdout.split('\n').filter((l) => l.startsWith('VERRIS_WAF '));
    expect(Buffer.byteLength(wiersze.join('\n') + '\n')).toBeLessThanOrEqual(80000);
    expect(wiersze.at(-1)).toContain('2026-10-10T12:59:00Z');
    const poAgencie = Buffer.from(r.stdout, 'utf8').subarray(-100000).toString('utf8');
    expect(trafieniaZLogu(poAgencie)[0].czas).toBe('2026-10-10T12:59:00Z');
  });

  it('JSON ModSecurity v3 (LiteSpeed na t1, 11.10): wpisy w „transaction”, host z nagłówka małymi literami, czas lokalny serwera', () => {
    // Kształt jak w /var/log/httpd/modsec_audit.log na t1 (adresy zamienione na dokumentacyjne, nagłówki skrócone).
    const v3 = (o: { czas: string; ip: string; uri: string; host: string; kod: number; reguly: [number, string][] }) =>
      JSON.stringify({
        transaction: {
          unique_id: 'xzrHip5ZyguDusxotZdbY7hc', time_stamp: o.czas, client_ip: o.ip, client_port: 38452,
          host_ip: '192.0.2.1:443', host_port: 443,
          request: { method: 'GET', http_version: 'HTTP/1.1', uri: o.uri, headers: { host: o.host, cookie: 'wordpress_logged_in_x=SEKRET', 'user-agent': 'Mozilla/5.0' } },
          response: { http_code: o.kod },
          messages: o.reguly.map(([id, msg]) => ({ message: msg, details: { match: 'x', ruleId: id, file: '/etc/modsecurity.d/REQUEST-930.conf', msg, severity: 'CRITICAL' } })),
        },
      }) + '\n';
    const log =
      v3({ czas: 'Sun Oct 11 14:20:00 2026', ip: '203.0.113.44', uri: '/Dockerfile', host: 'o05.klient.pl', kod: 406, reguly: [[930130, 'Restricted File Access Attempt']] }) +
      v3({ czas: 'Sun Oct 11 14:37:16 2026', ip: '2001:db8::18', uri: '/', host: '[2001:db8::1]', kod: 406, reguly: [[920350, 'Host header is a numeric IP address']] }) +
      v3({ czas: 'Sun Oct 11 14:43:58 2026', ip: '198.51.100.154', uri: '/?page=../../../../etc/passwd&test=verris-waf-1011', host: 'klient.pl', kod: 406, reguly: [[949110, 'Inbound Anomaly Score Exceeded'], [930100, 'Path Traversal Attack (/../) or (/.../)']] }) +
      v3({ czas: 'Sun Oct 11 14:50:00 2026', ip: '198.51.100.7', uri: '/sklep', host: 'Klient.PL', kod: 200, reguly: [[942100, 'SQL Injection Attack Detected via libinjection']] });
    const dir = mkdtempSync(join(tmpdir(), 'waf-'));
    const plik = join(dir, 'modsec_audit.log');
    writeFileSync(plik, log);
    // Czas lokalny serwera — strefa jak na węzłach (Europa/Warszawa, CEST = UTC+2).
    const r = spawnSync('bash', [SKRYPT], { env: { PATH: process.env.PATH, TZ: 'Europe/Warsaw', WH_DOMAINS: 'klient.pl', MODSEC_AUDIT_LOG: plik }, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.split('\n').filter((l) => l.startsWith('VERRIS_WAF '))).toEqual([
      'VERRIS_WAF 2026-10-11T12:20:00Z|klient.pl|203.0.113.44|GET|/Dockerfile|930130|Restricted File Access Attempt|1|406',
      'VERRIS_WAF 2026-10-11T12:43:58Z|klient.pl|198.51.100.154|GET|/|930100|Path Traversal Attack (/../) or (/.../)|1|406',
      'VERRIS_WAF 2026-10-11T12:50:00Z|klient.pl|198.51.100.7|GET|/sklep|942100|SQL Injection Attack Detected via libinjection|0|200',
    ]);
    expect(r.stdout).not.toContain('SEKRET');
    expect(r.stdout).not.toContain('verris-waf-1011');
  });

  /**
   * Weryfikacja 11.10 — na t1 949110 („Inbound Anomaly Score Exceeded”) była osobną pozycją 74× obok konkretnych reguł:
   * to samo żądanie w dzienniku v3 dwoma wpisami (wykrycie i ocena progu z odmową). Zdarzenie liczy się raz — z regułą
   * konkretną i odmową z wpisu zbiorczego; sama zbiorcza (bez konkretnej) zostaje, w panelu jako „Przekroczony próg anomalii (CRS)”.
   */
  it('v3: osobne wpisy tego samego żądania (konkretna + 949110) → jedno trafienie z regułą konkretną i odmową; sama 949110 zostaje', () => {
    const v3 = (o: { id: string; czas: string; ip: string; uri: string; kod: number; reguly: [number, string][] }) =>
      JSON.stringify({
        transaction: {
          unique_id: o.id, time_stamp: o.czas, client_ip: o.ip, client_port: 1, host_ip: '192.0.2.1:443', host_port: 443,
          request: { method: 'GET', http_version: 'HTTP/1.1', uri: o.uri, headers: { host: 'klient.pl' } },
          response: { http_code: o.kod },
          messages: o.reguly.map(([id, msg]) => ({ message: msg, details: { ruleId: id, msg } })),
        },
      }) + '\n';
    const log =
      v3({ id: 'a1', czas: 'Sun Oct 11 16:17:40 2026', ip: '198.51.100.154', uri: '/?q=<script>', kod: 200, reguly: [[941100, 'XSS Attack Detected via libinjection']] }) +
      v3({ id: 'a2', czas: 'Sun Oct 11 16:17:40 2026', ip: '198.51.100.154', uri: '/?q=<script>', kod: 406, reguly: [[949110, 'Inbound Anomaly Score Exceeded (Total Score: 5)']] }) +
      v3({ id: 'b1', czas: 'Sun Oct 11 16:20:00 2026', ip: '203.0.113.5', uri: '/wp-login.php', kod: 406, reguly: [[949110, 'Inbound Anomaly Score Exceeded (Total Score: 10)']] });
    const dir = mkdtempSync(join(tmpdir(), 'waf-'));
    const plik = join(dir, 'modsec_audit.log');
    writeFileSync(plik, log);
    const r = spawnSync('bash', [SKRYPT], { env: { PATH: process.env.PATH, TZ: 'Europe/Warsaw', WH_DOMAINS: 'klient.pl', MODSEC_AUDIT_LOG: plik }, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.split('\n').filter((l) => l.startsWith('VERRIS_WAF '))).toEqual([
      'VERRIS_WAF 2026-10-11T14:17:40Z|klient.pl|198.51.100.154|GET|/|941100|XSS Attack Detected via libinjection|1|406',
      'VERRIS_WAF 2026-10-11T14:20:00Z|klient.pl|203.0.113.5|GET|/wp-login.php|949110|Inbound Anomaly Score Exceeded (Total Score: 10)|1|406',
    ]);
    const t = trafieniaZLogu(r.stdout);
    expect(t.map((x) => [x.regula, x.opis])).toEqual([
      ['949110', 'Przekroczony próg anomalii (CRS)'],
      ['941100', 'XSS Attack Detected via libinjection'],
    ]);
    expect(regulyZTrafien(t).map((x) => [x.regula, x.razy])).toEqual([['949110', 1], ['941100', 1]]);
  });

  it('API: wynik starszego skryptu (osobne wiersze 949110 i konkretnej z tego samego zdarzenia) liczony raz', () => {
    const stary = [
      'VERRIS_WAF 2026-10-11T14:17:40Z|klient.pl|198.51.100.154|GET|/|941100|XSS Attack Detected via libinjection|0|200',
      'VERRIS_WAF 2026-10-11T14:17:40Z|klient.pl|198.51.100.154|GET|/|949110|Inbound Anomaly Score Exceeded (Total Score: 5)|1|406',
      'VERRIS_WAF 2026-10-11T14:18:00Z|klient.pl|198.51.100.154|GET|/x|949110|Inbound Anomaly Score Exceeded (Total Score: 5)|1|406',
    ].join('\n');
    const t = trafieniaZLogu(stary);
    expect(t.map((x) => [x.czas, x.regula, x.opis, x.zablokowano, x.status])).toEqual([
      ['2026-10-11T14:18:00Z', '949110', 'Przekroczony próg anomalii (CRS)', true, '406'],
      ['2026-10-11T14:17:40Z', '941100', 'XSS Attack Detected via libinjection', true, '406'],
    ]);
    expect(regulyZTrafien(t).find((r) => r.regula === '941100')).toMatchObject({ razy: 1, zablokowano: 1 });
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
