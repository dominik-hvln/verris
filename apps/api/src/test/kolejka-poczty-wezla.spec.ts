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
    # Druga paczka -Mrm odrzucona (np. wiadomość zablokowana w trakcie doręczania) — pierwsza już usunięta.
    if [ "\${FAKE_MRM:-}" = blad-druga ] && [ -f "$FAKE_DIR/mrm1" ]; then for id in "$@"; do echo "Message $id is locked"; done; exit 1; fi
    touch "$FAKE_DIR/mrm1"
    # Prawdziwy exim: wiadomość, której spool już nie ma → „… or did not exist” i kod wyjścia ≠ 0 (queue.c, MSG_REMOVE).
    rc=0
    for id in "$@"; do
      rm -f "$K/$id-H" "$K/$id.bp"
      if [ "\${FAKE_MRM:-}" = zniklo ]; then echo "Message $id has been removed or did not exist"; rc=1; else echo "Message $id has been removed"; fi
    done
    exit $rc ;;
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
    expect(r.err).toContain('[mail-queue] BŁĄD: exim -Mrm: nie usunięto 1 — exim: Permission denied');
    expect(r.out).toContain('VERRIS_MQ_USUNIETO 0');
  });

  it('audyt Fal 2: błąd kolejnej paczki -Mrm — liczba już usuniętych (nieodwracalne) jest w logu przed błędem', () => {
    const s = srodowisko();
    const k = join(s.dir, 'kolejka');
    const ids = Array.from({ length: 51 }, (_, i) => `1tCcCc-${String(i).padStart(11, '0')}-0001`);
    for (const id of ids) {
      wiadomosc(k, id, ` 1m  1.0K ${id} <klient1@t1.verris.test>\n          a@gmail.com\n\n`, `${id}-H\nklient1 1001 1001\n<klient1@t1.verris.test>\n1760090000 0\nXX\n1\na@gmail.com\n\n030  Subject: spam\n`);
    }
    const r = s.uruchom({ MQ_MODE: 'remove', ...KONTO, MQ_IDS: ids.join(','), FAKE_MRM: 'blad-druga' });
    expect(r.rc).not.toBe(0);
    expect(r.out).toContain('VERRIS_MQ_USUNIETO 50');
    expect(r.err).toContain('[mail-queue] BŁĄD: exim -Mrm: nie usunięto 1 — kod 1');
    expect(s.zostalo()).toContain(ids[50]);
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

  it('audyt Fal 2: przynależność po tożsamości (login, -auth_id), nie po nadawcy koperty — cudze wiadomości z nadawcą @domena-konta pominięte w podglądzie i przy usuwaniu', () => {
    const s = srodowisko();
    const k = join(s.dir, 'kolejka');
    const msg = (id: string, login: string, nadawca: string, extra: string, temat: string) =>
      wiadomosc(k, id, ` 1m  1.0K ${id} <${nadawca}>\n          odbiorca@gmail.com\n\n`, `${id}-H\n${login} 1002 1002\n<${nadawca}>\n1760090200 0\n${extra}XX\n1\nodbiorca@gmail.com\n\n030  Subject: ${temat}\n`);
    const B_F = '1tBbBb-0000000000a-0001'; // inny użytkownik DA: mail() z -f kontakt@klient.pl
    const B_AUTH = '1tBbBb-0000000000b-0002'; // SMTP AUTH skrzynki innego klienta z MAIL FROM @klient.pl
    const ZEWN = '1tBbBb-0000000000c-0003'; // z zewnątrz, bez uwierzytelnienia, sfałszowany nadawca @klient.pl
    const AUTO = '1tBbBb-0000000000d-0004'; // autoresponder skrzynki konta wytworzony lokalnie przez exima
    msg(B_F, 'innyklient', 'kontakt@klient.pl', '-received_protocol local\n', 'Oferta B');
    msg(B_AUTH, 'mail', 'biuro@klient.pl', '-auth_id b@obcy.pl\n-received_protocol esmtpsa\n', 'Faktura B');
    msg(ZEWN, 'mail', 'biuro@klient.pl', '-received_protocol esmtp\n-host_address 203.0.113.9.4321\n', 'Spam do B');
    msg(AUTO, 'mail', 'biuro@klient.pl', '-received_protocol local\n', 'Autoodpowiedz');
    const lista = s.uruchom({ MQ_MODE: 'list', ...KONTO });
    expect(lista.rc).toBe(0);
    expect(lista.wiersze.map((w) => w.slice('VERRIS_MQ '.length).split('|')[0]).sort()).toEqual([AUTO, M_PHP, M_SMTP].sort());
    const r = s.uruchom({ MQ_MODE: 'remove', ...KONTO, MQ_IDS: [B_F, B_AUTH, ZEWN, AUTO].join(',') });
    expect(r.rc).toBe(0);
    expect(r.out).toContain('VERRIS_MQ_USUNIETO 1');
    expect(r.out).toContain('VERRIS_MQ_POMINIETO 3');
    expect(s.wywolania().filter((w) => w.startsWith('-Mrm'))).toEqual([`-Mrm ${AUTO}`]);
  });

  it('audyt Fal 2: temat z U+2028/U+2029, DEL i NEL — w wierszu spacje (jeden wiersz na wiadomość), długość w znakach', () => {
    const s = srodowisko();
    const k = join(s.dir, 'kolejka');
    const id = '1tDdDd-0000000000a-0001';
    const surowy = `Promo\u2028linia\u2029x\u007fy\u0085z ${'😀'.repeat(130)}`;
    const zakodowany = `=?UTF-8?B?${Buffer.from(surowy, 'utf8').toString('base64')}?=`;
    wiadomosc(k, id, ` 1m  1.0K ${id} <klient1@t1.verris.test>\n          a@gmail.com\n\n`, `${id}-H\nklient1 1001 1001\n<klient1@t1.verris.test>\n1760090000 0\nXX\n1\na@gmail.com\n\n030  Subject: ${zakodowany}\n`);
    const r = s.uruchom({ MQ_MODE: 'list', ...KONTO });
    const wiersz = r.wiersze.find((w) => w.includes(id))!;
    const temat = wiersz.split('|')[6]!;
    expect(temat.startsWith('Promo linia x y z ')).toBe(true);
    expect([...temat]).toHaveLength(120);
    expect(r.out.split('\n').filter((l) => l.includes('linia'))).toHaveLength(1);
  });
});
