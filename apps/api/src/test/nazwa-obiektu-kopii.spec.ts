import { readFileSync } from 'fs';
import { join } from 'path';
import { OBIEKT_KOPII_LATEST } from '../storage/object-storage.service';

/**
 * H-21 — nazwa obiektu kopii jest jedna, nie cztery.
 *
 * CO SIĘ STAŁO. Kopia bazy nie wykonała się ani razu przez ponad miesiąc
 * (najstarszy porzucony zrzut w stagingu: 24 lipca). `pg_dump` działał, gzip
 * działał, a skrypt przerywał na szyfrowaniu: w `.env.prod` nigdy nie ustawiono
 * `BACKUP_AGE_RECIPIENTS`. Zachowanie fail-closed było POPRAWNE — bez kluczy nie
 * wolno wysłać niezaszyfrowanego zrzutu z danymi osobowymi. Zawiodło to, że
 * przez miesiąc nikt się o tym nie dowiedział.
 *
 * DLACZEGO MONITORING TEGO NIE POKAZAŁ. Backup wysyła `latest.sql.gz.age`
 * (szyfrowanie w produkcji obowiązkowe), a metryka „kopia istnieje", snapshot
 * zdrowia i drill odtworzeniowy pytały o `latest.sql.gz` — obiekt, którego
 * produkcja NIGDY nie tworzy. Metryka pokazywała zero od zawsze, więc zero
 * wyglądało na normalny stan. Cztery kopie jednej nazwy, trzy błędne.
 *
 * Ten test wiąże warstwę TypeScriptu z warstwą powłoki, bo nie ma innego
 * sposobu: bash nie zaimportuje stałej z TS, a TS nie wykona funkcji z bash.
 * To ta sama technika co w X-24 (ścieżki panelu vs trasy API) i w Z-03.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');
const CRYPTO_SH = join(KORZEN, 'ops', 'lib', 'backup-crypto.sh');

/** Treść bez komentarzy — po raz dziewiąty ta sama lekcja w tym projekcie. */
function kod(sciezka: string): string {
  return readFileSync(sciezka, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

describe('H-21 — nazwa obiektu kopii ma jedno źródło prawdy', () => {
  const crypto = kod(CRYPTO_SH);

  it('strażnik czyta właściwy plik', () => {
    expect(crypto).toContain('backup_crypto_enabled()');
    expect(crypto).toContain('backup_crypto_latest_object()');
  });

  it('stała w TypeScripcie zgadza się z bibliotekną powłoki', () => {
    // W bibliotece: BACKUP_LATEST_BASENAME="latest.sql.gz" + sufiks .age,
    // gdy szyfrowanie włączone (a w produkcji jest obowiązkowe).
    const m = crypto.match(/BACKUP_LATEST_BASENAME="([^"]+)"/);
    expect(m).not.toBeNull();
    expect(OBIEKT_KOPII_LATEST).toBe(`${m![1]}.age`);
  });

  it('nazwa niesie sufiks szyfrowania — inaczej patrzymy na nieistniejący plik', () => {
    // To jest dokładnie ta litera, której brakowało przez miesiąc.
    expect(OBIEKT_KOPII_LATEST.endsWith('.age')).toBe(true);
  });

  it.each([
    ['ops/scripts/restore-drill-isolated.sh', 'drill odtworzeniowy'],
    ['ops/scripts/prod-health-snapshot.sh', 'snapshot zdrowia'],
    ['ops/restore-postgres.sh', 'odtworzenie produkcji'],
  ])('%s nie ma zaszytej nazwy — bierze ją z biblioteki (%s)', (sciezka) => {
    const tresc = kod(join(KORZEN, sciezka));
    expect(tresc).toContain('backup_crypto_latest_object');
    // Zaszyta nazwa w KODZIE (nie w komentarzu) znaczy powrót do stanu sprzed H-21.
    expect(tresc).not.toMatch(/["']latest\.sql\.gz/);
  });

  it('serwis obiektów pyta o obiekt ze stałej, nie o napis', () => {
    const ts = readFileSync(
      join(KORZEN, 'apps', 'api', 'src', 'storage', 'object-storage.service.ts'),
      'utf8',
    );
    expect(ts).toContain('OBIEKT_KOPII_LATEST');
    expect(ts).not.toContain("'postgres/latest.sql.gz'");
  });
});

describe('H-21 — drill odtworzeniowy jest JEDEN i robi wszystko', () => {
  const drill = kod(join(KORZEN, 'ops', 'scripts', 'restore-drill-isolated.sh'));

  it('strażnik czyta właściwy plik', () => {
    expect(drill).toContain('RestoreDrill');
    expect(drill).toContain('MIN_ROWS');
  });

  it('sprawdza sumę kontrolną pobranego obiektu', () => {
    // Bez tego drill dowodzi, że da się odtworzyć TO, CO POBRAŁ — a nie to,
    // co zapisała kopia. Uszkodzenie w transporcie przeszłoby niezauważone.
    expect(drill).toContain('sha256sum');
    expect(drill).toMatch(/\.sha256/);
  });

  it('deszyfruje szyfrogram age przed odtworzeniem', () => {
    // Do 2026-08-22 szedł prosto do `gunzip` — czyli zakładał format, którego
    // produkcja nie wytwarza. To był powód, dla którego pierwszy prawdziwy
    // drill nie mógł się udać niezależnie od tego, czy kopia istniała.
    expect(drill).toContain('backup_crypto_decrypt_file');
    expect(drill).toContain('RESTORE_INPUT');
  });

  it('odtwarza plik PO deszyfrowaniu, nie pobrany szyfrogram', () => {
    expect(drill).toMatch(/gunzip -c "\$RESTORE_INPUT"/);
  });

  it('nie ma drugiego skryptu robiącego to samo', () => {
    // ops/backup-verify.sh robił to samo POPRAWNIE (nazwa obiektu, suma
    // kontrolna, deszyfrowanie) i nie wołał go NIKT — żaden cron, runbook ani
    // dokument. Utwardzanie H-20 poszło w drugą kopię, tę zepsutą. Rodzina
    // „bliźniaczych miejsc": Z-12, Z-16, M-06, X-24, teraz tu.
    let istnieje = true;
    try {
      readFileSync(join(KORZEN, 'ops', 'backup-verify.sh'), 'utf8');
    } catch {
      istnieje = false;
    }
    expect(istnieje).toBe(false);
  });
});
