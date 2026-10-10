import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * F3.1 (reszta) — prawdziwe skrypty węzła:
 * - node-mail-queue.sh tryb `limit`: dobowy limit wysyłki konta w /etc/virtual/limit_<użytkownik> (dokumentacja DA),
 *   odczyt, zapis atomowy z prawami pliku /etc/virtual/limit, „domyslny” usuwa plik, wejście bez powłoki;
 * - node-mail-log.sh tryb `stats`: najwięksi nadawcy i odrzucenia na zewnątrz węzła z logu exima, bez adresów.
 */
const SKRYPTY = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts');

function limitSrodowisko() {
  const dir = mkdtempSync(join(tmpdir(), 'limit-'));
  const virtual = join(dir, 'virtual');
  const users = join(dir, 'users');
  mkdirSync(virtual);
  mkdirSync(join(users, 'klient1'), { recursive: true });
  writeFileSync(join(users, 'klient1', 'user.conf'), 'usertype=user\n');
  writeFileSync(join(virtual, 'limit'), '1000\n');
  chmodSync(join(virtual, 'limit'), 0o640);
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  // exim nie może być wołany w trybie limit
  writeFileSync(join(bin, 'exim'), `#!/bin/bash\necho "$*" >> "${dir}/exim"\n`);
  chmodSync(join(bin, 'exim'), 0o755);
  const uruchom = (env: Record<string, string>) => {
    const r = spawnSync('bash', [join(SKRYPTY, 'node-mail-queue.sh')], {
      env: { PATH: `${bin}:${process.env.PATH}`, MQ_MODE: 'limit', MQ_VIRTUAL_DIR: virtual, MQ_DA_USERS: users, ...env },
      encoding: 'utf8',
    });
    return { rc: r.status, out: r.stdout, err: r.stderr };
  };
  return { dir, virtual, uruchom, plik: join(virtual, 'limit_klient1'), exim: () => existsSync(join(dir, 'exim')) };
}

describe('F3.1 — limit wysyłki konta (node-mail-queue.sh, tryb limit)', () => {
  it('odczyt bez własnego limitu: „domyslny” i limit domyślny serwera', () => {
    const s = limitSrodowisko();
    const r = s.uruchom({ MQ_USER: 'klient1' });
    expect(r.rc).toBe(0);
    expect(r.out).toContain('VERRIS_MQ_LIMIT klient1 domyslny 1000');
    expect(existsSync(s.plik)).toBe(false);
    expect(s.exim()).toBe(false);
  });

  it('ustawienie: plik limit_<użytkownik> z samą liczbą (bez nowej linii), prawa jak /etc/virtual/limit; potem powrót do domyślnego', () => {
    const s = limitSrodowisko();
    const r = s.uruchom({ MQ_USER: 'klient1', MQ_LIMIT: '250' });
    expect(r.rc).toBe(0);
    expect(r.out).toContain('VERRIS_MQ_LIMIT klient1 250 1000');
    expect(readFileSync(s.plik, 'utf8')).toBe('250');
    expect(statSync(s.plik).mode & 0o777).toBe(0o640);
    const d = s.uruchom({ MQ_USER: 'klient1', MQ_LIMIT: 'domyslny' });
    expect(d.rc).toBe(0);
    expect(d.out).toContain('VERRIS_MQ_LIMIT klient1 domyslny 1000');
    expect(existsSync(s.plik)).toBe(false);
  });

  it.each([
    ['zero (u DA „bez limitu”)', { MQ_USER: 'klient1', MQ_LIMIT: '0' }],
    ['ponad 100000', { MQ_USER: 'klient1', MQ_LIMIT: '100001' }],
    ['ujemny', { MQ_USER: 'klient1', MQ_LIMIT: '-5' }],
    ['polecenie powłoki w limicie', { MQ_USER: 'klient1', MQ_LIMIT: '5;touch PWNED' }],
    ['użytkownik ze ścieżką', { MQ_USER: '../limit', MQ_LIMIT: '5' }],
    ['konto, którego nie ma na serwerze', { MQ_USER: 'obcy1', MQ_LIMIT: '5' }],
    ['bez użytkownika', { MQ_LIMIT: '5' }],
  ])('%s → odmowa bez zmian w plikach', (_n, env) => {
    const s = limitSrodowisko();
    const r = s.uruchom(env as Record<string, string>);
    expect(r.rc).not.toBe(0);
    expect(r.err).toContain('[mail-queue] BŁĄD:');
    expect(existsSync(s.plik)).toBe(false);
    expect(readFileSync(join(s.virtual, 'limit'), 'utf8')).toBe('1000\n');
    expect(existsSync('PWNED')).toBe(false);
  });
});

const LOG = [
  // wysłana przez PHP (U=klient1) z domeny klienta: dostarczona do gmaila
  '2026-10-10 10:00:00 1tAAAA-00000000001-AAAA <= sklep@klient.pl U=klient1 P=local S=1200',
  '2026-10-10 10:00:02 1tAAAA-00000000001-AAAA => ktos@gmail.com R=lookuphost T=remote_smtp H=gmail-smtp-in.l.google.com [142.250.1.1] C="250 OK"',
  '2026-10-10 10:00:02 1tAAAA-00000000001-AAAA Completed',
  // druga z tej samej domeny, odrzucona przez wp.pl
  '2026-10-10 10:01:00 1tAAAA-00000000002-AAAA <= sklep@klient.pl U=klient1 P=local S=900',
  '2026-10-10 10:01:01 1tAAAA-00000000002-AAAA ** zly@wp.pl R=lookuphost T=remote_smtp H=mx.wp.pl [212.77.1.1]: SMTP error from remote mail server after RCPT TO:<zly@wp.pl>: 550 5.1.1 User unknown',
  // SMTP z logowaniem skrzynki innej domeny, opóźniona
  '2026-10-10 10:02:00 1tAAAA-00000000003-AAAA <= biuro@firma.pl H=(laptop) [10.0.0.5] P=esmtpsa A=dovecot_login:biuro@firma.pl S=500',
  '2026-10-10 10:02:01 1tAAAA-00000000003-AAAA == x@o2.pl R=lookuphost T=remote_smtp defer (-44): SMTP error from remote mail server after RCPT TO:<x@o2.pl>: 451 4.7.1 Greylisted',
  // poczta PRZYCHODZĄCA dostarczona lokalnie — nie liczy się
  '2026-10-10 10:03:00 1tAAAA-00000000004-AAAA <= spamer@zewnatrz.com H=mx.zewnatrz.com [1.2.3.4] P=esmtp S=700',
  '2026-10-10 10:03:00 1tAAAA-00000000004-AAAA => biuro <biuro@firma.pl> R=virtual_user T=dovecot_lmtp_udp',
].join('\n');

describe('F3.1 — najwięksi nadawcy i odrzucenia węzła (node-mail-log.sh, tryb stats)', () => {
  const uruchom = (env: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), 'stats-'));
    writeFileSync(join(dir, 'mainlog'), LOG + '\n');
    const r = spawnSync('bash', [join(SKRYPTY, 'node-mail-log.sh')], { env: { PATH: process.env.PATH, ML_LOG_DIR: dir, ...env }, encoding: 'utf8' });
    return { rc: r.status, out: r.stdout, err: r.stderr };
  };

  it('agregat wysyłki na zewnątrz: domena nadawcy + użytkownik DA, odrzucone i opóźnione; przychodząca pominięta; bez adresów', () => {
    const r = uruchom({ ML_MODE: 'stats' });
    expect(r.rc).toBe(0);
    const ms = r.out.split('\n').filter((l) => l.startsWith('VERRIS_MS '));
    expect(ms).toEqual(['VERRIS_MS klient.pl|klient1|2|1|0', 'VERRIS_MS firma.pl|-|1|0|1']);
    expect(r.out).toContain('VERRIS_MB 550|wp.pl|1');
    expect(r.out).toContain('VERRIS_MS_OKNO 2026-10-10T10:00:00 2026-10-10T10:03:00 3');
    // żadnego adresu e-mail w wyniku
    expect(r.out).not.toMatch(/[a-z0-9._-]+@[a-z0-9.-]+/i);
  });

  it('tryb konta bez domen nadal wymaga domen (stary przebieg bez zmian)', () => {
    expect(uruchom({}).rc).not.toBe(0);
  });

  it('nieznany tryb → odmowa', () => {
    const r = uruchom({ ML_MODE: 'tresc' });
    expect(r.rc).not.toBe(0);
    expect(r.err).toContain('BŁĄD');
  });
});
