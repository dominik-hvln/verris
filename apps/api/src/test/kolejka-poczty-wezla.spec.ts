import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * F3.1 — prawdziwy ops/scripts/node-mail-queue.sh (zadanie MAIL_QUEUE) na atrapie exima: kolejka konta i węzła
 * z nagłówków (-bp, -Mvh), bez treści (-Mvb nigdy), usunięcie tylko wiadomości konta (-Mrm), wypchnięcie (-qff),
 * walidacja identyfikatorów wg formatu Exima i brak interpolacji danych wejściowych do powłoki.
 */
const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-mail-queue.sh');

const M_PHP = '1tAbCd-000000001bo-D342'; // Exim ≥ 4.97: 6-11-4
const M_SMTP = '1aBcDe-0003hL-9u'; // starszy Exim: 6-6-2
const M_OBCY = '1tZzZz-0000000aaaa-0001';

const ATRAPA = `#!/bin/bash
echo "$*" >> "$FAKE_DIR/wywolania"
K="$FAKE_DIR/kolejka"
case "$1" in
  -bpc) ls "$K" | grep -c '\\.bp$' || true ;;
  -bp) cat "$K"/*.bp 2>/dev/null; true ;;
  -Mvh) [ -f "$K/$2-H" ] || { echo "Spool file for $2 not found" >&2; exit 1; }; cat "$K/$2-H" ;;
  -Mrm) shift
    [ "\${FAKE_MRM:-}" = blad ] && { echo "exim: Permission denied" >&2; exit 1; }
    for id in "$@"; do
      rm -f "$K/$id-H" "$K/$id.bp"
      if [ "\${FAKE_MRM:-}" = zniklo ]; then echo "Message $id has been removed or did not exist"; else echo "Message $id has been removed"; fi
    done ;;
  -qff) rm -f "$K"/* ;;
  *) echo "nieoczekiwana opcja $1" >&2; exit 2 ;;
esac
`;

function wiadomosc(k: string, id: string, bp: string, h: string) {
  writeFileSync(join(k, `${id}.bp`), bp);
  writeFileSync(join(k, `${id}-H`), h);
}

function srodowisko() {
  const dir = mkdtempSync(join(tmpdir(), 'kolejka-'));
  const k = join(dir, 'kolejka');
  mkdirSync(k);
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'exim'), ATRAPA);
  chmodSync(join(bin, 'exim'), 0o755);
  wiadomosc(
    k,
    M_PHP,
    ` 4m  2.9K ${M_PHP} <klient1@t1.verris.test>\n          ofiara1@gmail.com\n          ofiara2@wp.pl\n        D ofiara3@o2.pl\n\n`,
    `${M_PHP}-H\nklient1 1001 1001\n<klient1@t1.verris.test>\n1760090000 0\n-ident klient1\n-received_protocol local\n-body_linecount 3\nXX\n2\nofiara1@gmail.com\nofiara2@wp.pl\n\n` +
      `018  Message-Id: <x@t1>\n068  Subject: =?UTF-8?B?WmFtw7N3aWVuaWUgbnIgMTIz?=\n \tkolejne\n032F From: Sklep <sklep@klient.pl>\n`,
  );
  wiadomosc(
    k,
    M_SMTP,
    ` 2h  12K ${M_SMTP} <biuro@klient.pl> *** frozen ***\n          ktos@gmail.com\n\n`,
    `${M_SMTP}-H\nmail 8 12\n<biuro@klient.pl>\n1760080000 1\n-auth_id biuro@klient.pl\n-frozen 1760081000\nXX\n1\nktos@gmail.com\n\n040  Subject: Faktura | pilne\n`,
  );
  wiadomosc(
    k,
    M_OBCY,
    ` 1m  1.1K ${M_OBCY} <inny@obcy.pl>\n          adres@obcy-odbiorca.pl\n\n`,
    `${M_OBCY}-H\ninny 1002 1002\n<inny@obcy.pl>\n1760090100 0\nXX\n1\nadres@obcy-odbiorca.pl\n\n030  Subject: Newsletter obcy\n`,
  );
  const uruchom = (env: Record<string, string>) => {
    const r = spawnSync('bash', [SKRYPT], { env: { PATH: `${bin}:${process.env.PATH}`, FAKE_DIR: dir, ...env }, encoding: 'utf8' });
    return { rc: r.status, out: r.stdout, err: r.stderr, wiersze: r.stdout.split('\n').filter((l) => l.startsWith('VERRIS_MQ ')) };
  };
  const wywolania = () => (existsSync(join(dir, 'wywolania')) ? readFileSync(join(dir, 'wywolania'), 'utf8').trim().split('\n') : []);
  const zostalo = () => readdirSync(k).filter((n) => n.endsWith('.bp')).map((n) => n.slice(0, -3)).sort();
  return { dir, uruchom, wywolania, zostalo };
}

const KONTO = { MQ_USER: 'klient1', MQ_DOMAINS: 'klient.pl,sklep-klienta.pl' };

describe('F3.1 — node-mail-queue.sh (kolejka exima)', () => {
  it('kolejka konta: mail() z PHP (login użytkownika) i SMTP skrzynki konta; obce konto pominięte; nagłówki bez treści', () => {
    const s = srodowisko();
    const r = s.uruchom({ MQ_MODE: 'list', ...KONTO });
    expect(r.rc).toBe(0);
    expect(r.wiersze).toEqual([
      `VERRIS_MQ ${M_SMTP}|2h|12K|1|biuro@klient.pl|ktos@gmail.com|Faktura   pilne`,
      `VERRIS_MQ ${M_PHP}|4m|2.9K|0|klient1@t1.verris.test|ofiara1@gmail.com,ofiara2@wp.pl|Zamówienie nr 123 kolejne`,
    ]);
    expect(r.out).toContain('VERRIS_MQ_RAZEM 3 3 2 2');
    // Tylko komendy z białej listy; treść (-Mvb) nigdy.
    expect(s.wywolania().map((w) => w.split(' ')[0]).sort()).toEqual(['-Mvh', '-Mvh', '-Mvh', '-bp', '-bpc']);
  });

  it('kolejka węzła z wyszukiwaniem po nadawcy, odbiorcy albo temacie', () => {
    const s = srodowisko();
    expect(s.uruchom({ MQ_MODE: 'list' }).wiersze).toHaveLength(3);
    expect(s.uruchom({ MQ_MODE: 'list', MQ_SZUKAJ: 'Newsletter' }).wiersze.map((w) => w.split('|')[0])).toEqual([`VERRIS_MQ ${M_OBCY}`]);
    expect(s.uruchom({ MQ_MODE: 'list', MQ_SZUKAJ: 'gmail.com' }).wiersze).toHaveLength(2);
  });

  it('usunięcie: tylko wiadomości konta; cudza wiadomość z listy identyfikatorów zostaje', () => {
    const s = srodowisko();
    const r = s.uruchom({ MQ_MODE: 'remove', ...KONTO, MQ_IDS: `${M_PHP},${M_OBCY},${M_SMTP}` });
    expect(r.rc).toBe(0);
    expect(r.out).toContain('VERRIS_MQ_USUNIETO 2');
    expect(r.out).toContain('VERRIS_MQ_POMINIETO 1');
    expect(s.zostalo()).toEqual([M_OBCY]);
    expect(s.wywolania().filter((w) => w.startsWith('-Mrm'))).toEqual([`-Mrm ${M_PHP} ${M_SMTP}`]);
  });

  it('przegląd: „has been removed or did not exist” (wiadomość zniknęła przed -Mrm) nie liczy się jako usunięta', () => {
    const s = srodowisko();
    const r = s.uruchom({ MQ_MODE: 'remove', ...KONTO, MQ_IDS: `${M_PHP},${M_SMTP}`, FAKE_MRM: 'zniklo' });
    expect(r.rc).toBe(0);
    expect(r.out).toContain('VERRIS_MQ_USUNIETO 0');
    expect(r.out).toContain('VERRIS_MQ_POMINIETO 2');
  });

  it('przegląd: błąd exim -Mrm bez żadnego usunięcia = błąd zadania (nie „usunięto 0” jako sukces)', () => {
    const s = srodowisko();
    const r = s.uruchom({ MQ_MODE: 'remove', ...KONTO, MQ_IDS: M_PHP, FAKE_MRM: 'blad' });
    expect(r.rc).not.toBe(0);
    expect(r.err).toContain('[mail-queue] BŁĄD: exim -Mrm: exim: Permission denied');
    expect(r.out).not.toContain('VERRIS_MQ_USUNIETO');
  });

  it('usunięcie bez konta albo bez identyfikatorów — odmowa; wypchnięcie tylko dla całego węzła', () => {
    const s = srodowisko();
    expect(s.uruchom({ MQ_MODE: 'remove', MQ_IDS: M_PHP }).rc).not.toBe(0);
    expect(s.uruchom({ MQ_MODE: 'remove', ...KONTO }).rc).not.toBe(0);
    expect(s.uruchom({ MQ_MODE: 'flush', ...KONTO }).rc).not.toBe(0);
    expect(s.zostalo()).toHaveLength(3);
    expect(s.wywolania()).toEqual([]);
  });

  it('wypchnięcie: exim -qff i liczby przed/po', () => {
    const s = srodowisko();
    const r = s.uruchom({ MQ_MODE: 'flush' });
    expect(r.rc).toBe(0);
    expect(r.out).toContain('VERRIS_MQ_PRZED 3');
    expect(r.out).toContain('VERRIS_MQ_PO 0');
    expect(s.wywolania()).toContain('-qff');
  });

  it.each([
    ['identyfikator z poleceniem powłoki', { MQ_MODE: 'remove', ...KONTO, MQ_IDS: `${M_PHP};touch PWNED` }],
    ['identyfikator z $(…)', { MQ_MODE: 'remove', ...KONTO, MQ_IDS: '$(touch PWNED)' }],
    ['identyfikator w złym formacie', { MQ_MODE: 'remove', ...KONTO, MQ_IDS: '1tAbCd-000000001bo-D34' }],
    ['użytkownik z opcją', { MQ_MODE: 'list', MQ_USER: '-qff', MQ_DOMAINS: 'klient.pl' }],
    ['domena z ukośnikiem', { MQ_MODE: 'list', MQ_USER: 'klient1', MQ_DOMAINS: '../etc' }],
    ['nieznany tryb', { MQ_MODE: 'body' }],
  ])('%s → odmowa przed jakimkolwiek wywołaniem exima', (_n, env) => {
    const s = srodowisko();
    const r = s.uruchom(env as Record<string, string>);
    expect(r.rc).not.toBe(0);
    expect(r.err).toContain('[mail-queue] BŁĄD:');
    expect(s.wywolania()).toEqual([]);
    expect(existsSync(join(s.dir, 'PWNED'))).toBe(false);
    expect(existsSync('PWNED')).toBe(false);
  });

  it('fraza wyszukiwania nie jest wykonywana przez powłokę', () => {
    const s = srodowisko();
    const r = s.uruchom({ MQ_MODE: 'list', MQ_SZUKAJ: `$(touch ${join(s.dir, 'PWNED')})` });
    expect(r.rc).toBe(0);
    expect(r.wiersze).toEqual([]);
    expect(existsSync(join(s.dir, 'PWNED'))).toBe(false);
  });
});
